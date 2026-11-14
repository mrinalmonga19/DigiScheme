/**
 * Consent + verification orchestration (spec 11.2).
 *  - consent is per document type, shows what is fetched, why, and how long it is kept;
 *  - only derived attributes and document metadata are retained, never the document files;
 *  - consent is revocable (fields fall back to Estimated) and every step is logged.
 */
import jwt from 'jsonwebtoken';
import {
  pack, tr, type DocumentCode, type FieldKey, type FieldSource,
} from '@digischeme/shared';
import { env } from '../config/env';
import type { ConsentDoc, Store, UserDoc, VerifiedDocumentMeta } from '../db/store';
import type { IVerificationProvider } from '../verification/types';
import { MockVerificationProvider } from '../verification/mock';
import { newId, sha256 } from './crypto';
import type { AuditService } from './audit';
import type { ProfileService } from './profile';
import type { Registry } from './registry';

/** What each document proves, so the consent screen can say why it is needed (localized via field labels). */
export const DOC_FIELDS: Record<DocumentCode, FieldKey[]> = {
  income_certificate: ['annualFamilyIncome'],
  caste_certificate: ['category'],
  domicile_certificate: ['state'],
  ration_card: ['isHeadOfFamily', 'isBPL'],
  school_certificate: ['educationLevel'],
  land_record: ['landholdingHectares'],
  disability_certificate: ['hasDisability', 'disabilityPercent'],
  age_proof: ['age'],
  aadhaar: ['age', 'gender', 'state'],
  bank_passbook: ['hasBankAccount'],
};

const RETENTION_DAYS = 30; // metadata only; derived attributes stay until the user deletes them
const STATE_TTL = '20m';

export class ConsentError extends Error {
  constructor(public readonly code: 'BAD_STATE' | 'NOT_FOUND' | 'NOT_PENDING' | 'INVALID_DEMO_CODE' | 'NO_CONSENT' | 'EXPIRED', message: string) {
    super(message);
  }
}

export interface ConsentView {
  consentId: string;
  provider: 'digilocker' | 'aadhaar_ekyc';
  status: ConsentDoc['status'];
  demo: boolean;
  purpose: string;
  retentionDays: number;
  documents: Array<{ code: DocumentCode; name: string; usedFor: string[]; digilockerAvailable: boolean }>;
  personas?: Array<{ id: string; name: string; language: string }>;
  defaultPersonaId?: string;
  grantedDocTypes: DocumentCode[];
}

export interface GrantResult {
  status: 'granted' | 'denied';
  fetched: Array<{ code: DocumentCode; title: string; issuer: string; issuedOn: string; validUntil: string | null }>;
  verifiedFields: FieldKey[];
}

interface StateClaims { uid: string; cid: string; p?: string | null; lang: string }

export class VerificationService {
  constructor(
    private readonly store: Store,
    private readonly registry: Registry,
    private readonly profiles: ProfileService,
    private readonly audit: AuditService,
    private readonly provider: IVerificationProvider,
  ) {}

  get demo(): { digilocker: boolean; aadhaar: boolean } {
    return { digilocker: this.provider.digilockerMode === 'mock', aadhaar: this.provider.aadhaarMode === 'mock' };
  }

  private sign(claims: StateClaims): string {
    return jwt.sign(claims, env.JWT_SECRET, { expiresIn: STATE_TTL, audience: 'consent' });
  }
  verifyState(token: string): StateClaims {
    try {
      return jwt.verify(token, env.JWT_SECRET, { audience: 'consent' }) as StateClaims & jwt.JwtPayload;
    } catch {
      throw new ConsentError('BAD_STATE', 'This consent link is invalid or has expired. Please start again.');
    }
  }

  /** Default demo identity: the persona who speaks the user's language, if any. */
  private defaultPersona(user: UserDoc): string | undefined {
    if (user.demoPersonaId) return user.demoPersonaId;
    if (this.provider instanceof MockVerificationProvider) {
      return this.provider.listPersonas().find((p) => p.language === user.preferredLanguage)?.id;
    }
    return undefined;
  }

  async start(user: UserDoc, requested: DocumentCode[] | undefined, lang: string) {
    const supplied = this.registry.docTypes().filter((d) => d.digilockerAvailable).map((d) => d.code);
    const docTypes = (requested?.length ? requested : (['income_certificate', 'caste_certificate', 'domicile_certificate', 'school_certificate'] as DocumentCode[]))
      .filter((c) => supplied.includes(c));
    if (docTypes.length === 0) throw new ConsentError('NOT_FOUND', 'None of those documents can be fetched from DigiLocker');
    const consent = await this.store.consents.insert({
      _id: newId(), userId: user._id, provider: 'digilocker', docTypes,
      purpose: 'Check which government schemes you qualify for',
      retentionDays: RETENTION_DAYS, status: 'pending', grantedDocTypes: [], demo: this.provider.digilockerMode === 'mock',
      grantedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    });
    const state = this.sign({ uid: user._id, cid: consent._id, p: this.defaultPersona(user) ?? null, lang });
    const { authUrl } = await this.provider.startConsent({ userId: user._id, consentId: consent._id, docTypes, state });
    await this.audit.log({ userId: user._id, eventType: 'consent_started', toolName: 'request_verification', result: docTypes.join(',') });
    return { consentId: consent._id, consentUrl: authUrl, demo: consent.demo, docTypes, retentionDays: RETENTION_DAYS };
  }

  async describe(consentId: string, stateToken: string, lang: string): Promise<ConsentView> {
    const claims = this.verifyState(stateToken);
    if (claims.cid !== consentId) throw new ConsentError('BAD_STATE', 'Consent link does not match');
    const consent = await this.store.consents.findOne({ _id: consentId });
    if (!consent || consent.userId !== claims.uid) throw new ConsentError('NOT_FOUND', 'Consent not found');
    const p = pack(lang);
    const view: ConsentView = {
      consentId, provider: consent.provider, status: consent.status, demo: consent.demo, purpose: consent.purpose,
      retentionDays: consent.retentionDays, grantedDocTypes: consent.grantedDocTypes,
      documents: consent.docTypes.map((code) => {
        const t = this.registry.doc(code);
        return {
          code, name: t ? tr(t.displayName, lang) : code, digilockerAvailable: t?.digilockerAvailable ?? false,
          usedFor: DOC_FIELDS[code].map((f) => p.fields[f] ?? f),
        };
      }),
    };
    if (this.provider instanceof MockVerificationProvider) {
      view.personas = this.provider.listPersonas();
      if (claims.p) view.defaultPersonaId = claims.p;
    }
    return view;
  }

  async grant(stateToken: string, consentId: string, allowed: DocumentCode[], personaId?: string | null, authCode?: string): Promise<GrantResult> {
    const claims = this.verifyState(stateToken);
    const consent = await this.store.consents.findOne({ _id: consentId });
    if (!consent || consent.userId !== claims.uid || claims.cid !== consentId) throw new ConsentError('NOT_FOUND', 'Consent not found');
    if (consent.status !== 'pending') throw new ConsentError('NOT_PENDING', 'This consent was already answered');
    if (consent.expiresAt < new Date().toISOString()) throw new ConsentError('EXPIRED', 'This consent request expired');

    const granted = allowed.filter((c) => consent.docTypes.includes(c));
    if (granted.length === 0) {
      await this.store.consents.updateOne({ _id: consentId }, { status: 'denied' });
      await this.audit.log({ userId: claims.uid, eventType: 'consent_denied', result: 'denied' });
      return { status: 'denied', fetched: [], verifiedFields: [] };
    }
    const persona = personaId ?? claims.p ?? null;
    const docs = await this.provider.fetchDocuments({
      userId: claims.uid, docTypes: granted, personaId: persona, ...(authCode ? { authCode } : {}),
    });
    const source: FieldSource = 'digilocker_verified';
    const verifiedFields = new Set<FieldKey>();
    const metas: VerifiedDocumentMeta[] = [];
    const now = new Date().toISOString();
    for (const d of docs) {
      const result = await this.profiles.merge(claims.uid, d.derived as Record<string, unknown>, source, 1);
      result.applied.forEach((f) => verifiedFields.add(f));
      metas.push({
        code: d.code, issuer: d.issuer, issuedOn: d.issuedOn, validUntil: d.validUntil,
        referenceHash: sha256(d.reference), derivedFields: result.applied, source, consentId, fetchedAt: now,
      });
    }
    await this.profiles.addDocuments(claims.uid, metas);
    await this.store.consents.updateOne({ _id: consentId }, {
      status: 'granted', grantedDocTypes: docs.map((d) => d.code), grantedAt: now,
    });
    const user = await this.store.users.findOne({ _id: claims.uid });
    if (user) {
      await this.store.users.updateOne({ _id: user._id }, {
        consentFlags: { ...user.consentFlags, digilocker: { granted: true, at: now } },
        verificationLevel: user.verificationLevel === 'ekyc' ? 'ekyc' : consent.demo ? 'mock' : 'otp',
        ...(persona ? { demoPersonaId: persona } : {}),
      });
    }
    await this.audit.log({ userId: claims.uid, eventType: 'consent_granted', result: docs.map((d) => d.code).join(',') });
    return {
      status: 'granted',
      fetched: docs.map((d) => ({ code: d.code, title: d.title, issuer: d.issuer, issuedOn: d.issuedOn, validUntil: d.validUntil })),
      verifiedFields: [...verifiedFields],
    };
  }

  async revoke(userId: string, consentId: string): Promise<{ downgraded: FieldKey[] }> {
    const consent = await this.store.consents.findOne({ _id: consentId });
    if (!consent || consent.userId !== userId) throw new ConsentError('NOT_FOUND', 'Consent not found');
    const downgraded = await this.profiles.downgradeConsent(userId, consentId);
    await this.store.consents.updateOne({ _id: consentId }, { status: 'revoked', revokedAt: new Date().toISOString() });
    const remaining = (await this.store.consents.find({ userId })).some((c) => c.status === 'granted' && c.provider === 'digilocker');
    const user = await this.store.users.findOne({ _id: userId });
    if (user && !remaining) {
      await this.store.users.updateOne({ _id: userId }, {
        consentFlags: { ...user.consentFlags, digilocker: { granted: false, at: new Date().toISOString() } },
        verificationLevel: user.verificationLevel === 'ekyc' ? 'ekyc' : 'none',
      });
    }
    await this.audit.log({ userId, eventType: 'consent_revoked', result: `downgraded:${downgraded.length}` });
    return { downgraded };
  }

  async list(userId: string) {
    const rows = await this.store.consents.find({ userId }, { sort: { field: 'createdAt', dir: -1 } });
    return rows.filter((c) => c.status !== 'pending').map((c) => ({
      consentId: c._id, provider: c.provider, status: c.status, docTypes: c.docTypes, grantedDocTypes: c.grantedDocTypes,
      demo: c.demo, grantedAt: c.grantedAt, revokedAt: c.revokedAt, retentionDays: c.retentionDays,
    }));
  }

  /** Mock eKYC: a demo code returns year of birth, gender and state only. Needs the user's explicit consent. */
  async ekyc(user: UserDoc, demoCode: string | undefined, agree: boolean) {
    const consented = user.consentFlags.aadhaarEkyc.granted || agree;
    if (!consented) throw new ConsentError('NO_CONSENT', 'Consent for identity verification is required first');
    let identity;
    try {
      identity = await this.provider.verifyIdentity({ ...(demoCode ? { demoCode } : {}), personaId: user.demoPersonaId ?? null });
    } catch (err) {
      if ((err as Error).message === 'INVALID_DEMO_CODE') throw new ConsentError('INVALID_DEMO_CODE', 'That demo code is not valid');
      throw err;
    }
    const now = new Date().toISOString();
    const age = new Date().getFullYear() - identity.yearOfBirth;
    const result = await this.profiles.merge(user._id, { age, gender: identity.gender, state: identity.state }, 'ekyc_verified', 1);
    await this.store.users.updateOne({ _id: user._id }, {
      consentFlags: { ...user.consentFlags, aadhaarEkyc: { granted: true, at: user.consentFlags.aadhaarEkyc.at ?? now } },
      verificationLevel: this.provider.aadhaarMode === 'mock' ? 'mock' : 'ekyc',
    });
    await this.audit.log({ userId: user._id, eventType: 'ekyc_verified', result: result.applied.join(',') });
    return { verifiedFields: result.applied, demo: this.provider.aadhaarMode === 'mock' };
  }
}
