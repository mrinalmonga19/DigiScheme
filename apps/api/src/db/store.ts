/**
 * Storage abstraction. The app talks to `Collection<T>`; there is a Mongoose implementation
 * (DB_MODE=mongo) and an in-memory one (DB_MODE=memory) so the whole app runs offline and in CI.
 */
import type {
  DocumentType, FieldSource, Profile, Scheme, SessionState, TrackerStatus, DocumentCode, ChatUiHints,
} from '@digischeme/shared';

export interface BaseDoc {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
}

export type Filter<T> = Partial<{ [K in keyof T]: T[K] }>;

export interface FindOptions<T> {
  sort?: { field: keyof T; dir: 1 | -1 };
  limit?: number;
}

export interface Collection<T extends BaseDoc> {
  insert(doc: T): Promise<T>;
  findOne(filter: Filter<T>): Promise<T | null>;
  find(filter: Filter<T>, opts?: FindOptions<T>): Promise<T[]>;
  /** Shallow-merge `patch` into the first match. With `upsert`, inserts `{...filter, ...patch}` if none. */
  updateOne(filter: Filter<T>, patch: Partial<T>, opts?: { upsert?: boolean }): Promise<T | null>;
  deleteMany(filter: Filter<T>): Promise<number>;
  count(filter: Filter<T>): Promise<number>;
}

// ---------- Document shapes ----------
export interface ConsentFlag { granted: boolean; at: string | null }

export interface UserDoc extends BaseDoc {
  phoneHash: string | null;
  preferredLanguage: string;
  channel: 'whatsapp' | 'web';
  consentFlags: { dataProcessing: ConsentFlag; digilocker: ConsentFlag; aadhaarEkyc: ConsentFlag };
  verificationLevel: 'none' | 'mock' | 'otp' | 'ekyc';
  lowBandwidth?: boolean;
  /** AES-256-GCM encrypted phone, kept only when a WhatsApp reply needs it (spec 6). */
  phoneEnc?: string | null;
  /** True once the user picked a language themselves; detection then never overrides a manual choice. */
  languageLocked?: boolean;
  /** Mock DigiLocker/eKYC identity used for this demo user (personas.json id). */
  demoPersonaId?: string | null;
}

export interface VerifiedDocumentMeta {
  code: DocumentCode;
  issuer: string;
  issuedOn: string;
  validUntil: string | null;
  /** Hash of the document reference: lets us show "you have this" without keeping the file. */
  referenceHash: string;
  /** Profile fields this document verified; used to downgrade them again if consent is revoked. */
  derivedFields: string[];
  source: FieldSource;
  consentId: string;
  fetchedAt: string;
}

export interface ProfileDoc extends BaseDoc {
  userId: string;
  /** Field map. Sensitive fields hold `{ enc: string }` in place of `value` at rest. */
  fields: Record<string, unknown>;
  verifiedDocuments: VerifiedDocumentMeta[];
}

export interface SchemeDoc extends BaseDoc, Scheme {}
export interface DocumentTypeDoc extends BaseDoc, DocumentType {}

export interface SessionMessage {
  role: 'user' | 'assistant';
  text: string; // PII-scrubbed before it is stored
  language: string;
  timestamp: string;
  toolCalls: string[];
  ui?: ChatUiHints;
}

export interface SessionDoc extends BaseDoc {
  userId: string;
  messages: SessionMessage[];
  state: SessionState;
  activeSchemeSlug: string | null;
  applicationId: string | null;
  applicationStep: number;
  lastResultSlugs: string[];
  greeted: boolean;
  /** The profile field the assistant asked about last, so a bare "yes" or "2" can be understood. */
  lastAskedField: string | null;
  /** Suggested replies shown last. WhatsApp users answer them with a number. */
  lastSuggested: Array<{ label: string; structured?: unknown }>;
}

export interface ApplicationDoc extends BaseDoc {
  userId: string;
  schemeSlug: string;
  stepIndex: number;
  completed: boolean;
}

export interface TrackerDoc extends BaseDoc {
  userId: string;
  schemeSlug: string;
  status: TrackerStatus;
  checklistState: Record<string, boolean>;
  notes: string;
  reminderAt: string | null;
}

export interface AuditDoc extends BaseDoc {
  userId: string | null;
  eventType: string;
  toolName: string | null;
  schemeSlug: string | null;
  ruleVersion: string | null;
  /** Short machine-readable outcome. Never raw message text. */
  result: string;
  timestamp: string;
}

export interface ConsentDoc extends BaseDoc {
  userId: string;
  provider: 'digilocker' | 'aadhaar_ekyc';
  docTypes: DocumentCode[];
  purpose: string;
  retentionDays: number;
  status: 'pending' | 'granted' | 'denied' | 'revoked';
  grantedDocTypes: DocumentCode[];
  demo: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}

export interface DedupeDoc extends BaseDoc {
  seenAt: string;
}

export interface MediaDoc extends BaseDoc {
  mime: string;
  dataBase64: string;
  expiresAt: string;
}

export interface Store {
  mode: 'mongo' | 'memory';
  users: Collection<UserDoc>;
  profiles: Collection<ProfileDoc>;
  schemes: Collection<SchemeDoc>;
  documentTypes: Collection<DocumentTypeDoc>;
  sessions: Collection<SessionDoc>;
  applications: Collection<ApplicationDoc>;
  trackers: Collection<TrackerDoc>;
  audit: Collection<AuditDoc>;
  consents: Collection<ConsentDoc>;
  dedupe: Collection<DedupeDoc>;
  media: Collection<MediaDoc>;
  /** True if the backing database currently answers. */
  healthy(): Promise<boolean>;
  close(): Promise<void>;
}

export type { Profile };
