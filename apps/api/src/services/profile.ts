/**
 * Profile storage and merge logic.
 *
 * Every field is { value, source, capturedAt, confidence }. Sensitive fields are encrypted at rest
 * (AES-256-GCM) and stored as { enc } instead of { value }. The `source` drives the Verified /
 * Estimated badge, so the merge rules here matter:
 *   - a verified value is never overwritten by a self-declared one;
 *   - a verified value may replace any value;
 *   - revoking consent downgrades the fields a document verified back to self-declared.
 */
import {
  CORE_FIELDS, FIELD_DEFS, FIELD_KEYS, coerceFieldValue, isFieldKey, isVerifiedSource, pack,
  type FieldKey, type FieldSource, type Profile, type ProfileFieldValue,
} from '@digischeme/shared';
import type { ProfileDoc, Store, VerifiedDocumentMeta } from '../db/store';
import { decryptValue, encryptValue, newId } from './crypto';

type StoredField = { value?: unknown; enc?: string; source: FieldSource; capturedAt: string; confidence: number };

export interface MergeResult {
  applied: FieldKey[];
  /** Unknown field, or a value that failed validation. */
  rejected: string[];
  /** Valid, but blocked because a verified value already exists. */
  protectedFields: FieldKey[];
}

export function isSensitiveField(key: FieldKey): boolean {
  return 'sensitive' in FIELD_DEFS[key] && Boolean((FIELD_DEFS[key] as { sensitive?: boolean }).sensitive);
}

export function decodeFields(fields: Record<string, unknown>): Profile {
  const out: Profile = {};
  for (const [k, raw] of Object.entries(fields)) {
    if (!isFieldKey(k)) continue;
    const f = raw as StoredField;
    let value: unknown;
    try {
      value = f.enc !== undefined ? decryptValue(f.enc) : f.value;
    } catch {
      continue; // undecryptable field (key rotated): treat as unknown rather than failing the request
    }
    if (value === undefined) continue;
    out[k] = { value, source: f.source, capturedAt: f.capturedAt, confidence: f.confidence } satisfies ProfileFieldValue;
  }
  return out;
}

function encodeField(key: FieldKey, f: ProfileFieldValue): StoredField {
  const base = { source: f.source, capturedAt: f.capturedAt, confidence: f.confidence };
  return isSensitiveField(key) ? { ...base, enc: encryptValue(f.value) } : { ...base, value: f.value };
}

export class ProfileService {
  constructor(private readonly store: Store) {}

  private async doc(userId: string): Promise<ProfileDoc> {
    const existing = await this.store.profiles.findOne({ userId });
    if (existing) return existing;
    return this.store.profiles.insert({ _id: newId(), userId, fields: {}, verifiedDocuments: [] });
  }

  async get(userId: string): Promise<Profile> {
    const d = await this.store.profiles.findOne({ userId });
    return d ? decodeFields(d.fields) : {};
  }

  async documents(userId: string): Promise<VerifiedDocumentMeta[]> {
    return (await this.store.profiles.findOne({ userId }))?.verifiedDocuments ?? [];
  }

  /** Merge raw values. Invalid or unknown fields are reported, never stored. */
  async merge(
    userId: string,
    updates: Record<string, unknown>,
    source: FieldSource = 'self_declared',
    confidence = source === 'self_declared' ? 0.8 : 1,
  ): Promise<MergeResult> {
    const doc = await this.doc(userId);
    const current = decodeFields(doc.fields);
    const fields = { ...doc.fields };
    const result: MergeResult = { applied: [], rejected: [], protectedFields: [] };
    const now = new Date().toISOString();
    for (const [k, raw] of Object.entries(updates)) {
      if (!isFieldKey(k)) {
        result.rejected.push(k);
        continue;
      }
      const value = coerceFieldValue(k, raw);
      if (value === undefined) {
        result.rejected.push(k);
        continue;
      }
      const existing = current[k];
      if (existing && isVerifiedSource(existing.source) && !isVerifiedSource(source)) {
        result.protectedFields.push(k);
        continue;
      }
      fields[k] = encodeField(k, { value, source, capturedAt: now, confidence });
      result.applied.push(k);
    }
    if (result.applied.length > 0) await this.store.profiles.updateOne({ _id: doc._id }, { fields });
    return result;
  }

  async addDocuments(userId: string, metas: VerifiedDocumentMeta[]): Promise<void> {
    const doc = await this.doc(userId);
    const kept = doc.verifiedDocuments.filter((d) => !metas.some((m) => m.code === d.code));
    await this.store.profiles.updateOne({ _id: doc._id }, { verifiedDocuments: [...kept, ...metas] });
  }

  /** Revoke: drop the document metadata and turn the fields it verified back into self-declared ones. */
  async downgradeConsent(userId: string, consentId: string): Promise<FieldKey[]> {
    const doc = await this.doc(userId);
    const revoked = doc.verifiedDocuments.filter((d) => d.consentId === consentId);
    const remaining = doc.verifiedDocuments.filter((d) => d.consentId !== consentId);
    // A field stays verified if another surviving document also verified it.
    const stillVerified = new Set(remaining.flatMap((d) => d.derivedFields));
    const fields = { ...doc.fields };
    const downgraded: FieldKey[] = [];
    for (const key of new Set(revoked.flatMap((d) => d.derivedFields))) {
      if (!isFieldKey(key) || stillVerified.has(key)) continue;
      const f = fields[key] as StoredField | undefined;
      if (f && isVerifiedSource(f.source)) {
        fields[key] = { ...f, source: 'self_declared', confidence: 0.6 };
        downgraded.push(key);
      }
    }
    await this.store.profiles.updateOne({ _id: doc._id }, { fields, verifiedDocuments: remaining });
    return downgraded;
  }

  /** Forget one field (the user owns their data, including values a document verified). */
  async removeField(userId: string, key: string): Promise<boolean> {
    if (!isFieldKey(key)) return false;
    const doc = await this.doc(userId);
    if (!(key in doc.fields)) return false;
    const fields = { ...doc.fields };
    delete fields[key];
    await this.store.profiles.updateOne({ _id: doc._id }, { fields });
    return true;
  }

  async deleteAll(userId: string): Promise<void> {
    await this.store.profiles.deleteMany({ userId });
  }
}

/** Fraction of core fields known, as a whole percent (drives the completeness ring). */
export const completeness = (profile: Profile): number =>
  Math.round((CORE_FIELDS.filter((k) => profile[k] !== undefined).length / CORE_FIELDS.length) * 100);

/**
 * Compact profile summary for the LLM (spec 9.1). Sensitive values are replaced by "provided":
 * the model needs to know a field exists so it does not ask again, not what the number is.
 */
export function summarizeProfile(profile: Profile): string {
  const parts: string[] = [];
  for (const k of FIELD_KEYS) {
    const f = profile[k];
    if (!f) continue;
    const mark = isVerifiedSource(f.source) ? 'VERIFIED' : 'self-declared';
    parts.push(`${k}=${isSensitiveField(k) ? 'provided' : String(f.value)} [${mark}]`);
  }
  return parts.length > 0 ? parts.join('; ') : '(nothing known yet)';
}

/** The display label of a field in the user's language. */
export const fieldLabel = (key: FieldKey, lang: string): string => pack(lang).fields[key] ?? key;
