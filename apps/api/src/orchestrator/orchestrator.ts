/**
 * The orchestrator (spec 9). Takes one user turn, lets the LLM plan tool calls (max 5 iterations),
 * validates and executes every call, and returns the model's reply plus everything the tools produced.
 * Structured input (chips, buttons) skips the model entirely: it maps straight to tools and the reply is
 * composed deterministically, so a tap is instant and cannot be mis-parsed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  LANGUAGES, pack, profileCompleteness, type ChatUiHints, type FieldKey, type SessionState, type StructuredInput,
} from '@digischeme/shared';
import { PROMPT_DIR } from '../config/paths';
import { logger } from '../config/logger';
import type { ILLMProvider, LLMContext, LLMTurn, ToolCall, ToolResult } from '../llm/types';
import { executeTool, toolDeclarations, type ToolContext, type ToolDeps } from '../tools';
import { summarizeProfile } from '../services/profile';
import { composeReply } from './compose';

export const MAX_ITERATIONS = 5;
const TEMPERATURE = 0.3;

let template: string | null = null;
const systemTemplate = () => (template ??= fs.readFileSync(path.join(PROMPT_DIR, 'system.md'), 'utf8'));

export function buildSystemPrompt(ctx: ToolContext, deps: ToolDeps): string {
  const langName = LANGUAGES.find((l) => l.code === ctx.lang)?.english ?? ctx.lang;
  const app = ctx.session.state === 'application' && ctx.session.activeSchemeSlug
    ? `An application guide for "${ctx.session.activeSchemeSlug}" is in progress at step ${ctx.session.applicationStep}.`
    : '';
  const vars: Record<string, string> = {
    language_name: langName,
    language_code: ctx.lang,
    scheme_slugs: deps.registry.all().map((s) => s.slug).join(', '),
    state: ctx.session.state,
    profile: summarizeProfile(ctx.profile),
    completeness: String(profileCompleteness(ctx.profile)),
    application_note: app,
  };
  return systemTemplate().replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
}

export interface TurnInput {
  text: string;
  englishText?: string;
  structured?: StructuredInput;
  piiWarning: boolean;
}

export interface TurnOutput {
  replyText: string;
  toolsCalled: string[];
  usedProvider: string;
  askedField: FieldKey | null;
}

/** Map a chip/button payload to the tool calls it stands for. */
export function callsForStructured(s: StructuredInput): ToolCall[] {
  if (s.type === 'profile') {
    return [
      { name: 'update_profile', args: { fields: s.fields } },
      { name: 'run_eligibility', args: {} },
    ];
  }
  switch (s.action) {
    case 'apply': return [{ name: 'start_application_guide', args: s.slug ? { slug: s.slug } : {} }];
    case 'details': return s.slug ? [{ name: 'get_scheme_details', args: { slug: s.slug } }] : [];
    case 'results': return [{ name: 'run_eligibility', args: {} }];
    case 'verify': return [{ name: 'request_verification', args: {} }];
    case 'step': return [{ name: 'next_application_step', args: { action: s.stepAction ?? 'next' } }];
    case 'track': return [{ name: 'save_tracker', args: s.slug ? { slug: s.slug, reminderInDays: 7 } : { reminderInDays: 7 } }];
  }
}

async function runCalls(deps: ToolDeps, ctx: ToolContext, calls: ToolCall[], used: string[]): Promise<ToolResult[]> {
  const out: ToolResult[] = [];
  for (const c of calls) {
    used.push(c.name);
    try {
      const r = await executeTool(deps, ctx, c.name, c.args);
      out.push(r.ok ? { name: c.name, ok: true, result: r.result } : { name: c.name, ok: false, error: r.error, code: r.code });
    } catch (err) {
      // An unexpected bug in a tool must not take the conversation down; the model hears a generic failure.
      logger.error({ err: (err as Error).message, tool: c.name }, 'tool crashed');
      out.push({ name: c.name, ok: false, error: 'The tool failed unexpectedly.', code: 'TOOL_FAILED' });
    }
  }
  return out;
}

export class Orchestrator {
  constructor(private readonly llm: ILLMProvider & { lastProvider?: string }, private readonly deps: ToolDeps) {}

  async runTurn(ctx: ToolContext, input: TurnInput, history: LLMTurn[]): Promise<TurnOutput> {
    const used: string[] = [];
    const lang = ctx.lang;
    const b = pack(lang).bot;
    const askedBefore = (ctx.session.lastAskedField as FieldKey | null) ?? null;

    // ---- Structured fast path: no model involved ----
    if (input.structured) {
      const calls = callsForStructured(input.structured);
      const results = await runCalls(this.deps, ctx, calls, used);
      const next = (ctx.session.lastAskedField as FieldKey | null) ?? null;
      const nextQ = next ? pack(lang).questions[next] ?? null : null;
      return {
        replyText: composeReply(results, { lang, piiWarning: input.piiWarning, nextQuestion: nextQ }),
        toolsCalled: used, usedProvider: 'structured', askedField: next,
      };
    }

    const llmCtx: LLMContext = {
      language: lang,
      userText: input.text,
      ...(input.englishText ? { englishText: input.englishText } : {}),
      sessionState: ctx.session.state as SessionState,
      hasActiveApplication: Boolean(ctx.session.applicationId),
      activeSchemeSlug: ctx.session.activeSchemeSlug,
      lastAskedField: askedBefore,
      lastResultSlugs: ctx.session.lastResultSlugs,
      profile: ctx.profile,
      piiWarning: input.piiWarning,
      nextQuestion: askedBefore ? pack(lang).questions[askedBefore] ?? null : null,
      schemes: this.deps.registry.all(),
    };
    const tools = toolDeclarations(this.deps.registry.all().map((s) => s.slug));
    const turns: LLMTurn[] = [...history, { role: 'user', text: input.englishText && lang !== 'en' ? `${input.text}\n[English gloss: ${input.englishText}]` : input.text }];
    const results: ToolResult[] = [];

    let emptyRetries = 0;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      llmCtx.sessionState = ctx.session.state as SessionState;
      llmCtx.hasActiveApplication = Boolean(ctx.session.applicationId);
      llmCtx.activeSchemeSlug = ctx.session.activeSchemeSlug;
      llmCtx.profile = ctx.profile;
      // After a tool changed the profile, the next question can differ from the one asked before this turn.
      const na = (ctx.session.lastAskedField as FieldKey | null) ?? null;
      llmCtx.nextQuestion = na ? pack(lang).questions[na] ?? null : null;

      const res = await this.llm.generate({
        system: buildSystemPrompt(ctx, this.deps), turns, tools, temperature: TEMPERATURE, ctx: llmCtx,
      });

      if (res.calls.length > 0) {
        const r = await runCalls(this.deps, ctx, res.calls, used);
        results.push(...r);
        turns.push({ role: 'model', calls: res.calls }, { role: 'tool', results: r });
        continue;
      }
      if (res.text.trim()) {
        return { replyText: res.text.trim(), toolsCalled: used, usedProvider: this.llm.lastProvider ?? this.llm.name, askedField: (ctx.session.lastAskedField as FieldKey | null) ?? null };
      }
      // Empty reply: retry once, then fall back to a clarifying question (spec 9.3).
      if (emptyRetries++ < 1) continue;
      break;
    }

    const next = (ctx.session.lastAskedField as FieldKey | null) ?? null;
    const nextQ = next ? pack(lang).questions[next] ?? null : null;
    const text = results.length > 0
      ? composeReply(results, { lang, piiWarning: input.piiWarning, nextQuestion: nextQ })
      : [b.unsure, nextQ].filter(Boolean).join('\n\n');
    return { replyText: text, toolsCalled: used, usedProvider: 'compose', askedField: next };
  }
}

export type { ChatUiHints };
