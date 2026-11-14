/**
 * LLM contract (spec 4.2: ILLMProvider). Two implementations sit behind it: Gemini (function calling,
 * temperature ~0.3) and a deterministic mock that drives the same tools, so the whole app and its
 * tests run offline and CI never needs a key.
 */
import type { FieldKey, Profile, Scheme, SessionState } from '@digischeme/shared';

export interface ToolDecl {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ToolCall { name: string; args: Record<string, unknown> }
export interface ToolResult { name: string; ok: boolean; result?: unknown; error?: string; code?: string }

export type LLMTurn =
  | { role: 'user'; text: string }
  | { role: 'model'; text?: string; calls?: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };

/** Everything the deterministic provider needs to behave like a (very literal) assistant. */
export interface LLMContext {
  language: string;
  userText: string;
  englishText?: string;
  sessionState: SessionState;
  hasActiveApplication: boolean;
  activeSchemeSlug: string | null;
  lastAskedField: FieldKey | null;
  lastResultSlugs: string[];
  profile: Profile;
  piiWarning: boolean;
  nextQuestion: string | null;
  schemes: Scheme[];
}

export interface LLMRequest {
  system: string;
  turns: LLMTurn[];
  tools: ToolDecl[];
  temperature: number;
  ctx: LLMContext;
}
export interface LLMResponse { text: string; calls: ToolCall[] }

export interface ILLMProvider {
  readonly name: 'gemini' | 'mock';
  generate(req: LLMRequest): Promise<LLMResponse>;
}
