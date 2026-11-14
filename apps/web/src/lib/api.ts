import type { ChatResponse, ChatUiHints, DemoModeFlags, GuideStepView, LinkCheckResult, SchemeCardView, StructuredInput } from '@digischeme/shared';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'offline');
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Request failed');
  return json as T;
}
const get = <T>(p: string) => req<T>('GET', p);
const post = <T>(p: string, b?: unknown) => req<T>('POST', p, b ?? {});

export interface SessionInfo {
  authenticated: boolean;
  user?: {
    id: string; language: string; languageLocked: boolean; channel: string; lowBandwidth: boolean; verificationLevel: string; phoneLinked: boolean;
    consent: { dataProcessing: { granted: boolean }; digilocker: { granted: boolean }; aadhaarEkyc: { granted: boolean } };
  };
  sessionState?: string;
  hasHistory?: boolean;
  demoMode: DemoModeFlags;
}
export interface LanguageOption { code: string; english: string; native: string; bcp47: string }
export interface SchemeListItem {
  slug: string; name: string; officialName: string; benefit: string; category: string; level: 'central' | 'state'; states: string[];
  hasGuide: boolean; dataQuality: 'curated' | 'needs_review'; lastVerifiedOn: string; machineTranslated: boolean;
}
export interface SchemeDetail extends Omit<SchemeListItem, 'states'> {
  ministry: string; states: string[]; notChecked: string[];
  documents: Array<{ code: string; name: string; digilockerCanSupply: boolean; howToGet: string }>;
  officialLinks: Array<{ label: string; url: string }>; sourceUrl: string; reviewNote?: string;
}
export interface ChatReply extends ChatResponse { transcript?: string }
export interface EligibilityResponse {
  cards: SchemeCardView[]; notEligible: Array<{ slug: string; name: string; reason: string }>; eligibleCount: number;
  profileCompleteness: number; nextQuestion: string | null; nextQuestionField: string | null;
}
export interface ProfileResponse {
  fields: Array<{ key: string; label: string; value: unknown; sensitive: boolean; source: string; verified: boolean; capturedAt: string }>;
  completeness: number;
  documents: Array<{ code: string; name: string; issuer: string; issuedOn: string; validUntil: string | null }>;
}
export interface TrackerItem { id: string; slug: string; name: string; status: string; notes: string; reminderAt: string | null; checklistState: Record<string, boolean> }
export interface ConsentView {
  consentId: string; provider: string; status: string; demo: boolean; purpose: string; retentionDays: number;
  documents: Array<{ code: string; name: string; usedFor: string[]; digilockerAvailable: boolean }>;
  personas?: Array<{ id: string; name: string; language: string }>; defaultPersonaId?: string;
}

export const api = {
  health: () => get<{ status: string; demoMode: DemoModeFlags }>('/health'),
  languages: () => get<{ languages: LanguageOption[] }>('/languages'),
  session: () => get<SessionInfo>('/auth/session'),
  startSession: (b: { language?: string; consent: boolean; lowBandwidth?: boolean }) => post<SessionInfo>('/auth/session', b),
  settings: (b: { language?: string; lowBandwidth?: boolean }) => req<SessionInfo>('PATCH', '/me/settings', b),
  deleteMe: () => req<{ deleted: boolean }>('DELETE', '/me'),
  welcome: (language?: string) => get<{ text: string }>(`/chat/welcome${language ? `?language=${language}` : ''}`),
  history: () => get<{ messages: Array<{ role: 'user' | 'assistant'; text: string; language: string; timestamp: string; ui?: ChatUiHints }>; state: string; suggestedReplies: Array<{ label: string; structured?: StructuredInput }>; profileCompleteness: number }>('/chat/history'),
  chat: (b: { text?: string; structured?: StructuredInput; language?: string; wantAudio?: boolean; userLabel?: string }) => post<ChatReply>('/chat', b),
  voiceChat: (blob: Blob, language?: string) => {
    const f = new FormData();
    f.append('audio', blob, 'voice.webm');
    if (language) f.append('language', language);
    return req<ChatReply>('POST', '/voice/chat', f);
  },
  speak: (text: string, language: string) => post<{ audioUrl: string | null; ttsFallback: 'browser' | null }>('/voice/speak', { text, language }),
  schemes: (language: string) => get<{ schemes: SchemeListItem[] }>(`/schemes?language=${language}`),
  scheme: (slug: string, language: string) => get<SchemeDetail>(`/schemes/${slug}?language=${language}`),
  rules: (slug: string, language: string) => get<{ ruleVersion: string; lastVerifiedOn: string; sourceUrl: string; rules: string[]; notChecked: string[] }>(`/schemes/${slug}/rules?language=${language}`),
  eligibility: () => post<EligibilityResponse>('/eligibility'),
  profile: () => get<ProfileResponse>('/profile'),
  forgetField: (key: string) => req<{ removed: boolean }>('DELETE', `/profile/${key}`),
  trackers: () => get<{ trackers: TrackerItem[] }>('/trackers'),
  addTracker: (slug: string, reminderInDays?: number) => post<{ id: string }>('/trackers', { slug, ...(reminderInDays ? { reminderInDays } : {}) }),
  setTracker: (id: string, status: string) => req<{ id: string }>('PATCH', `/trackers/${id}`, { status }),
  checkLink: (text: string, language: string) => post<{ result: LinkCheckResult; advice: string }>('/links/check', { text, language }),
  startDigilocker: () => post<{ consentUrl: string; consentId: string }>('/verify/digilocker/start'),
  consent: (id: string, state: string, language: string) => get<ConsentView>(`/verify/consent/${id}?state=${encodeURIComponent(state)}&language=${language}`),
  decide: (id: string, state: string, allow: string[], personaId: string | null) =>
    post<{ status: string; fetched: Array<{ code: string; title: string }>; verifiedFields: string[] }>(`/verify/consent/${id}/decision`, { state, allow, personaId }),
  consents: () => get<{ consents: Array<{ consentId: string; provider: string; status: string; docTypes: string[]; grantedDocTypes: string[]; demo: boolean; grantedAt: string | null }>; demo: { digilocker: boolean; aadhaar: boolean } }>('/verify/consents'),
  revoke: (id: string) => post<{ downgraded: string[] }>(`/verify/consents/${id}/revoke`),
  ekyc: (demoCode: string | undefined, agree: boolean) => post<{ verifiedFields: string[]; demo: boolean }>('/verify/ekyc', { demoCode, agree }),
  application: (id: string) => get<{ view: GuideStepView }>(`/applications/${id}`),
  startApplication: (slug: string) => post<{ view: GuideStepView }>('/applications', { slug }),
  step: (id: string, action: string) => post<{ view: GuideStepView }>(`/applications/${id}/step`, { action }),
  admin: <T>(path: string, pass: string) => req<T>('GET', `/admin${path}`, undefined, { headers: { 'x-admin-passcode': pass } }),
};
