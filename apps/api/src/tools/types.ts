import type {
  ChatUiHints, FieldKey, GuideStepView, LinkCheckResult, Profile, SchemeCardView, SchemeCategory, TrackerStatus,
} from '@digischeme/shared';
import type { SessionDoc, Store, UserDoc } from '../db/store';
import type { ResilientLanguageService } from '../language/resilient';
import type { ApplicationEngine } from '../services/applications';
import type { AuditService } from '../services/audit';
import type { ProfileService } from '../services/profile';
import type { Registry } from '../services/registry';
import type { TrackerService } from '../services/trackers';
import type { VerificationService } from '../services/verification';

export interface ToolDeps {
  store: Store;
  registry: Registry;
  profiles: ProfileService;
  audit: AuditService;
  applications: ApplicationEngine;
  trackers: TrackerService;
  verification: VerificationService;
  language: ResilientLanguageService;
}

/** Mutable per-turn state shared by the tools. The orchestrator persists the session at the end. */
export interface ToolContext {
  user: UserDoc;
  session: SessionDoc;
  profile: Profile;
  lang: string;
  userText: string;
  ui: Partial<ChatUiHints>;
}

/** A problem the model should hear about and the user should be told about kindly. */
export class ToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

// ---- Typed results (the mock LLM composes replies from these; Gemini reads them as JSON) ----
export interface UpdateProfileResult {
  applied: FieldKey[];
  rejected: string[];
  protectedFields: FieldKey[];
  completeness: number;
  nextQuestionField: FieldKey | null;
  nextQuestion: string | null;
}
export interface EligibilityToolResult {
  cards: SchemeCardView[];
  notEligible: Array<{ slug: string; name: string; reason: string }>;
  counts: { eligibleVerified: number; eligibleEstimated: number; needsInfo: number; notEligible: number };
  completeness: number;
  nextQuestionField: FieldKey | null;
  nextQuestion: string | null;
  intent: SchemeCategory[];
}
export interface SchemeDetailsResult {
  slug: string;
  name: string;
  officialName: string;
  benefit: string;
  ministry: string;
  category: string;
  level: 'central' | 'state';
  documents: Array<{ code: string; name: string }>;
  officialLinks: Array<{ label: string; url: string }>;
  notChecked: string[];
  hasGuide: boolean;
  dataQuality: 'curated' | 'needs_review';
  lastVerifiedOn: string;
  reviewNote?: string;
}
export interface GuideToolResult { view: GuideStepView; started: boolean }
export interface NoGuideResult { noGuide: true; slug: string; name: string; officialLink: { label: string; url: string } | null }
export interface LinkToolResult { result: LinkCheckResult }
export interface VerificationToolResult {
  consentUrl: string;
  demo: boolean;
  documents: Array<{ code: string; name: string }>;
  retentionDays: number;
}
export interface TrackerToolResult { saved: true; slug: string; status: TrackerStatus; reminderAt: string | null }
export type ToolResultMap = {
  update_profile: UpdateProfileResult;
  run_eligibility: EligibilityToolResult;
  get_scheme_details: SchemeDetailsResult;
  request_verification: VerificationToolResult;
  start_application_guide: GuideToolResult | NoGuideResult;
  next_application_step: GuideToolResult;
  check_link: LinkToolResult;
  save_tracker: TrackerToolResult;
};
export type ToolName = keyof ToolResultMap;
