import type { Translations } from './languages';
import type { FieldKey, FieldSource } from './profile';

// ---------- Eligibility rule DSL ----------
export type RuleOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'in' | 'notIn' | 'exists';

export interface RuleCondition {
  field: FieldKey;
  op: RuleOp;
  value: unknown;
  /** Human-readable English label shown to the user. */
  label: string;
}
export interface RuleAll { all: RuleNode[] }
export interface RuleAny { any: RuleNode[]; label?: string }
export interface RuleNot { not: RuleNode; label?: string }
export type RuleNode = RuleCondition | RuleAll | RuleAny | RuleNot;

export interface EligibilityRules {
  ruleVersion: string;
  all: RuleNode[];
}

export type EligibilityStatus = 'ELIGIBLE_VERIFIED' | 'ELIGIBLE_ESTIMATED' | 'LIKELY_NEEDS_INFO' | 'NOT_ELIGIBLE';

export interface ConditionOutcome {
  field: FieldKey;
  op: RuleOp;
  expected: unknown;
  actual?: unknown;
  source?: FieldSource;
  label: string;
}

export interface EligibilityResult {
  slug: string;
  status: EligibilityStatus;
  matchedConditions: ConditionOutcome[];
  failedConditions: ConditionOutcome[];
  missingFields: FieldKey[];
  ruleVersion: string;
  rankScore: number;
}

export type Badge = 'verified' | 'estimated' | 'needs_info' | 'not_eligible';

// ---------- Scheme data ----------
export type SchemeCategory =
  | 'education' | 'health' | 'agriculture' | 'pension' | 'housing'
  | 'employment' | 'women_child' | 'finance' | 'social_security';

export type DocumentCode =
  | 'aadhaar' | 'income_certificate' | 'caste_certificate' | 'domicile_certificate' | 'bank_passbook'
  | 'land_record' | 'school_certificate' | 'ration_card' | 'disability_certificate' | 'age_proof';

export interface DocumentType {
  code: DocumentCode;
  displayName: Translations;
  digilockerAvailable: boolean;
  howToGet: Translations;
}

export interface ApplicationStep {
  step: number;
  title: Translations;
  officialFieldName: string;
  instruction: Translations;
  prefillFrom: FieldKey | null;
  commonMistakes: string[];
  documentNeeded: DocumentCode | null;
}

export interface Scheme {
  slug: string;
  name: Translations;
  ministry: string;
  level: 'central' | 'state';
  states: string[]; // empty for central schemes
  category: SchemeCategory;
  benefitSummary: Translations;
  /** Approximate yearly rupee value, used only for ranking. */
  benefitAmount?: number;
  eligibilityRules: EligibilityRules;
  /** Real criteria the profile cannot capture. Shown to the user as "also required". */
  notChecked: string[];
  documentsRequired: Array<{ code: DocumentCode; digilockerCanSupply: boolean }>;
  applicationSteps: ApplicationStep[];
  officialLinks: Array<{ label: string; url: string }>;
  sourceUrl: string;
  lastVerifiedOn: string;
  dataQuality: 'curated' | 'needs_review';
  reviewNote?: string;
  machineTranslated: boolean;
}

// ---------- Trust ----------
export type LinkVerdict = 'OFFICIAL' | 'NOT_OFFICIAL' | 'SUSPICIOUS';
export interface LinkCheckResult {
  url: string;
  verdict: LinkVerdict;
  host: string | null;
  reasons: string[];
  reasonCodes: string[];
  suggestedOfficialLink?: { label: string; url: string; schemeSlug: string };
}

// ---------- Trackers ----------
export type TrackerStatus = 'planned' | 'documents_ready' | 'submitted' | 'approved' | 'rejected';

// ---------- Chat API ----------
export interface SuggestedReply {
  label: string;
  /** Structured payload so chips work without the LLM having to parse free text. */
  structured?: StructuredInput;
}
export type StructuredInput =
  | { type: 'profile'; fields: Partial<Record<FieldKey, unknown>> }
  | { type: 'action'; action: 'apply' | 'details' | 'results' | 'verify' | 'step' | 'track'; slug?: string; stepAction?: StepAction };

export type StepAction = 'next' | 'back' | 'repeat' | 'explain' | 'no_document';

export interface SchemeCardView {
  slug: string;
  name: string;
  officialName: string;
  benefit: string;
  category: SchemeCategory;
  level: 'central' | 'state';
  status: EligibilityStatus;
  badge: Badge;
  reasons: string[];
  failed: string[];
  missing: Array<{ field: FieldKey; label: string }>;
  notChecked: string[];
  rankScore: number;
  dataQuality: 'curated' | 'needs_review';
  hasGuide: boolean;
}

export interface ChatUiHints {
  results?: SchemeCardView[];
  linkCheck?: LinkCheckResult;
  guide?: GuideStepView;
  consentUrl?: string;
  profileCompleteness: number;
  sessionState: SessionState;
  askedField?: FieldKey;
}

export interface ChatResponse {
  replyText: string;
  language: string;
  audioUrl: string | null;
  /** When the server has no TTS, the client speaks with the browser's Web Speech API. */
  ttsFallback: 'browser' | null;
  suggestedReplies: SuggestedReply[];
  ui: ChatUiHints;
  demoMode: DemoModeFlags;
}

export type SessionState = 'discovery' | 'verification' | 'results' | 'application';

export interface DemoModeFlags {
  llm: boolean;
  digilocker: boolean;
  aadhaar: boolean;
  language: boolean;
  any: boolean;
}

export interface ChecklistItem {
  code: DocumentCode;
  name: string;
  available: boolean; // already held via verified documents
  digilockerCanSupply: boolean;
  howToGet: string;
}

export interface GuideStepView {
  applicationId: string;
  schemeSlug: string;
  schemeName: string;
  stepNumber: number;
  totalSteps: number;
  title: string;
  officialFieldName: string;
  instruction: string;
  prefill: { value: string; source: FieldSource } | null;
  commonMistakes: string[];
  documentNeeded: ChecklistItem | null;
  checklist: ChecklistItem[];
  done: boolean;
  officialLink: { label: string; url: string } | null;
  /** Extra guidance shown for "explain" and "I do not have this document". */
  note?: string;
}
