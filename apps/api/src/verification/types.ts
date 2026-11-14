/**
 * Verification adapters (spec 11.1). Mock mode is the demo default; live mode is a scaffold that
 * needs government onboarding (DigiLocker Partner API, an AUA/KUA for Aadhaar eKYC).
 */
import type { DocumentCode, FieldKey } from '@digischeme/shared';

export interface FetchedDocument {
  code: DocumentCode;
  title: string;
  issuer: string;
  issuedOn: string;
  validUntil: string | null;
  /** Issuer reference. Only its hash is stored. */
  reference: string;
  /** Profile fields this document proves. */
  derived: Partial<Record<FieldKey, unknown>>;
}

/** Aadhaar eKYC returns only these: no Aadhaar number, no address, no photo, no biometrics. */
export interface VerifiedIdentity {
  yearOfBirth: number;
  gender: 'female' | 'male' | 'other';
  state: string;
}

export interface ConsentStartRequest {
  userId: string;
  consentId: string;
  docTypes: DocumentCode[];
  /** Signed, short-lived state token carried through the redirect. */
  state: string;
}

export interface IVerificationProvider {
  readonly digilockerMode: 'mock' | 'live';
  readonly aadhaarMode: 'mock' | 'live';
  /** Where to send the citizen to approve the consent. Mock: our own consent screen. */
  startConsent(req: ConsentStartRequest): Promise<{ authUrl: string }>;
  /** Fetch only the document types the citizen allowed. */
  fetchDocuments(req: { userId: string; docTypes: DocumentCode[]; personaId?: string | null; authCode?: string }): Promise<FetchedDocument[]>;
  verifyIdentity(req: { demoCode?: string; personaId?: string | null; otpTxnId?: string; otp?: string }): Promise<VerifiedIdentity>;
}

export class NotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured. Live mode needs government onboarding; see README "Going live".`);
    this.name = 'NotConfiguredError';
  }
}
