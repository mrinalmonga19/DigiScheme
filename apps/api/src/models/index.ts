/**
 * Mongoose schemas (Section 6 of the spec). Ids are application-generated UUID strings so the
 * same documents work in the in-memory store. PII is minimal: no raw phone, no Aadhaar, no OTP.
 */
import mongoose, { Schema } from 'mongoose';

const opts = { timestamps: true, versionKey: false, minimize: false } as const;
const Mixed = Schema.Types.Mixed;
const consentFlag = { granted: { type: Boolean, default: false }, at: { type: String, default: null } };

export const UserSchema = new Schema(
  {
    _id: String,
    phoneHash: { type: String, default: null, index: true }, // SHA-256 with a server salt
    preferredLanguage: { type: String, default: 'en' },
    channel: { type: String, enum: ['whatsapp', 'web'], required: true },
    consentFlags: { dataProcessing: consentFlag, digilocker: consentFlag, aadhaarEkyc: consentFlag },
    verificationLevel: { type: String, enum: ['none', 'mock', 'otp', 'ekyc'], default: 'none' },
    lowBandwidth: { type: Boolean, default: false },
    phoneEnc: { type: String, default: null },
    languageLocked: { type: Boolean, default: false },
    demoPersonaId: { type: String, default: null },
  },
  opts,
);

export const ProfileSchema = new Schema(
  {
    _id: String,
    userId: { type: String, required: true, unique: true },
    // { [fieldKey]: { value | enc, source, capturedAt, confidence } }; sensitive values are AES-256-GCM encrypted.
    fields: { type: Mixed, default: {} },
    verifiedDocuments: { type: [Mixed], default: [] },
  },
  opts,
);

export const SchemeSchema = new Schema(
  {
    _id: String,
    slug: { type: String, required: true, unique: true },
    name: Mixed,
    ministry: String,
    level: { type: String, enum: ['central', 'state'] },
    states: [String],
    category: String,
    benefitSummary: Mixed,
    benefitAmount: Number,
    eligibilityRules: Mixed,
    notChecked: [String],
    documentsRequired: [Mixed],
    applicationSteps: [Mixed],
    officialLinks: [Mixed],
    sourceUrl: String,
    lastVerifiedOn: String,
    dataQuality: { type: String, enum: ['curated', 'needs_review'] },
    reviewNote: String,
    machineTranslated: Boolean,
  },
  opts,
);

export const DocumentTypeSchema = new Schema(
  { _id: String, code: { type: String, unique: true }, displayName: Mixed, digilockerAvailable: Boolean, howToGet: Mixed },
  opts,
);

export const SessionSchema = new Schema(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    messages: { type: [Mixed], default: [] },
    state: { type: String, enum: ['discovery', 'verification', 'results', 'application'], default: 'discovery' },
    activeSchemeSlug: { type: String, default: null },
    applicationId: { type: String, default: null },
    applicationStep: { type: Number, default: 0 },
    lastResultSlugs: { type: [String], default: [] },
    greeted: { type: Boolean, default: false },
    lastAskedField: { type: String, default: null },
    lastSuggested: { type: [Mixed], default: [] },
  },
  opts,
);

export const ApplicationSchema = new Schema(
  { _id: String, userId: { type: String, index: true }, schemeSlug: String, stepIndex: Number, completed: Boolean },
  opts,
);

export const TrackerSchema = new Schema(
  {
    _id: String,
    userId: { type: String, required: true, index: true },
    schemeSlug: { type: String, required: true },
    status: {
      type: String,
      enum: ['planned', 'documents_ready', 'submitted', 'approved', 'rejected'],
      default: 'planned',
    },
    checklistState: { type: Mixed, default: {} },
    notes: { type: String, default: '' },
    reminderAt: { type: String, default: null },
  },
  opts,
);

export const AuditLogSchema = new Schema(
  {
    _id: String,
    userId: { type: String, default: null, index: true },
    eventType: { type: String, required: true },
    toolName: { type: String, default: null },
    schemeSlug: { type: String, default: null },
    ruleVersion: { type: String, default: null },
    result: String,
    timestamp: { type: String, index: true },
  },
  opts,
);

export const ConsentSchema = new Schema(
  {
    _id: String,
    userId: { type: String, index: true },
    provider: String,
    docTypes: [String],
    purpose: String,
    retentionDays: Number,
    status: String,
    grantedDocTypes: [String],
    demo: Boolean,
    grantedAt: { type: String, default: null },
    revokedAt: { type: String, default: null },
    expiresAt: String,
  },
  opts,
);

export const DedupeSchema = new Schema({ _id: String, seenAt: String }, opts);
// Webhook retries only matter for a few minutes; let Mongo expire the markers.
DedupeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const MediaSchema = new Schema({ _id: String, mime: String, dataBase64: String, expiresAt: String }, opts);
MediaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export function buildModels(conn: mongoose.Connection) {
  return {
    users: conn.model('User', UserSchema),
    profiles: conn.model('Profile', ProfileSchema),
    schemes: conn.model('Scheme', SchemeSchema),
    documentTypes: conn.model('DocumentType', DocumentTypeSchema),
    sessions: conn.model('Session', SessionSchema),
    applications: conn.model('Application', ApplicationSchema),
    trackers: conn.model('ApplicationTracker', TrackerSchema),
    audit: conn.model('AuditLog', AuditLogSchema),
    consents: conn.model('Consent', ConsentSchema),
    dedupe: conn.model('Dedupe', DedupeSchema),
    media: conn.model('Media', MediaSchema),
  };
}
