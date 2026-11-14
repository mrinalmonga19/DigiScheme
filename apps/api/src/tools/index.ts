/**
 * The only actions the model can take (spec 9.2). Each tool has a zod schema (arguments are validated
 * before anything runs) and a JSON-schema declaration for function calling. Anything else the model
 * emits is rejected by the orchestrator, so LLM output can never trigger an undefined action.
 */
import { z } from 'zod';
import {
  DOCUMENT_CODES, FIELD_DEFS, FIELD_KEYS, profileCompleteness, tr,
  type DocumentCode, type FieldKey, type SchemeCategory, type StepAction, type TrackerStatus,
} from '@digischeme/shared';
import { isEligible, runEligibility } from '../eligibility';
import type { ToolDecl } from '../llm/types';
import { checkLink } from '../trust';
import { questionFor } from '../eligibility';
import { ApplicationError } from '../services/applications';
import { ConsentError } from '../services/verification';
import { applicableSchemes, deriveIntent, nextQuestionField } from '../orchestrator/ladder';
import { buildCard } from './cards';
import {
  ToolError, type EligibilityToolResult, type GuideToolResult, type LinkToolResult, type NoGuideResult, type SchemeDetailsResult,
  type ToolContext, type ToolDeps, type ToolName, type ToolResultMap, type TrackerToolResult, type UpdateProfileResult,
  type VerificationToolResult,
} from './types';

export * from './types';
export { buildCard };

const SCHEME_CATEGORIES = [
  'education', 'health', 'agriculture', 'pension', 'housing', 'employment', 'women_child', 'finance', 'social_security',
] as const satisfies readonly SchemeCategory[];
const STEP_ACTIONS = ['next', 'back', 'repeat', 'explain', 'no_document'] as const satisfies readonly StepAction[];
const TRACKER_STATUSES = ['planned', 'documents_ready', 'submitted', 'approved', 'rejected'] as const satisfies readonly TrackerStatus[];

// ---------- Argument schemas ----------
const schemas = {
  update_profile: z.object({ fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }),
  run_eligibility: z.object({ intent: z.array(z.enum(SCHEME_CATEGORIES)).optional() }),
  get_scheme_details: z.object({ slug: z.string().min(1).max(80) }),
  request_verification: z.object({ docTypes: z.array(z.enum(DOCUMENT_CODES)).optional() }),
  start_application_guide: z.object({ slug: z.string().min(1).max(80).optional() }),
  next_application_step: z.object({ action: z.enum(STEP_ACTIONS) }),
  check_link: z.object({ text: z.string().min(1).max(2000) }),
  save_tracker: z.object({
    slug: z.string().min(1).max(80).optional(),
    status: z.enum(TRACKER_STATUSES).optional(),
    reminderInDays: z.number().int().min(1).max(365).optional(),
    notes: z.string().max(500).optional(),
  }),
} as const;

export function validateToolArgs(name: string, args: unknown): { ok: true; args: unknown } | { ok: false; error: string } {
  const schema = (schemas as Record<string, z.ZodTypeAny>)[name];
  if (!schema) return { ok: false, error: `Unknown tool: ${name}` };
  const parsed = schema.safeParse(args ?? {});
  return parsed.success ? { ok: true, args: parsed.data } : { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}

// ---------- Function declarations (JSON schema) ----------
function profileFieldProperties(): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    const def = FIELD_DEFS[key] as { type: string; values?: readonly string[] };
    props[key] = def.type === 'enum'
      ? { type: 'string', enum: [...def.values!] }
      : { type: def.type };
  }
  return props;
}

export function toolDeclarations(slugs: string[]): ToolDecl[] {
  return [
    {
      name: 'update_profile',
      description: 'Save profile facts the user stated. Use only values the user actually said. Never guess. Income is rupees per YEAR.',
      parameters: { type: 'object', properties: { fields: { type: 'object', properties: profileFieldProperties() } }, required: ['fields'] },
    },
    {
      name: 'run_eligibility',
      description: 'Run the deterministic eligibility engine on the saved profile. ALWAYS call this to know what the user qualifies for. Never decide eligibility yourself.',
      parameters: { type: 'object', properties: { intent: { type: 'array', items: { type: 'string', enum: [...SCHEME_CATEGORIES] } } } },
    },
    {
      name: 'get_scheme_details',
      description: 'Fetch one scheme in the user language: benefit, documents, official links.',
      parameters: { type: 'object', properties: { slug: { type: 'string', enum: slugs } }, required: ['slug'] },
    },
    {
      name: 'request_verification',
      description: 'Offer DigiLocker consent so results can become Verified. Returns a consent link to give the user.',
      parameters: { type: 'object', properties: { docTypes: { type: 'array', items: { type: 'string', enum: [...DOCUMENT_CODES] } } } },
    },
    {
      name: 'start_application_guide',
      description: 'Begin the step-by-step application guide. Omit slug to use the best eligible scheme with a guide.',
      parameters: { type: 'object', properties: { slug: { type: 'string', enum: slugs } } },
    },
    {
      name: 'next_application_step',
      description: 'Move within the active application guide: next, back, repeat, explain, or no_document (user lacks the document).',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: [...STEP_ACTIONS] } }, required: ['action'] },
    },
    {
      name: 'check_link',
      description: 'Check whether a link or message the user pasted points to an official government site.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'save_tracker',
      description: 'Save or update the application tracker for a scheme, optionally with a reminder.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', enum: slugs },
          status: { type: 'string', enum: [...TRACKER_STATUSES] },
          reminderInDays: { type: 'integer' },
          notes: { type: 'string' },
        },
      },
    },
  ];
}

// ---------- Handlers ----------
async function refreshProfile(deps: ToolDeps, ctx: ToolContext): Promise<void> {
  ctx.profile = await deps.profiles.get(ctx.user._id);
}

function question(ctx: ToolContext, field: FieldKey | null): string | null {
  return field ? questionFor(field, ctx.lang) : null;
}

async function updateProfile(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.update_profile>): Promise<UpdateProfileResult> {
  const merged = await deps.profiles.merge(ctx.user._id, args.fields, 'self_declared');
  await refreshProfile(deps, ctx);
  if (merged.applied.length > 0) await deps.audit.log({ userId: ctx.user._id, eventType: 'profile_updated', toolName: 'update_profile', result: merged.applied.join(',') });
  const next = nextQuestionField(ctx.profile, deps.registry.all(), ctx.lang, deriveIntent(ctx.profile));
  ctx.session.lastAskedField = next;
  const completeness = profileCompleteness(ctx.profile);
  ctx.ui.profileCompleteness = completeness;
  if (next) ctx.ui.askedField = next;
  return { applied: merged.applied, rejected: merged.rejected, protectedFields: merged.protectedFields, completeness, nextQuestionField: next, nextQuestion: question(ctx, next) };
}

async function runElig(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.run_eligibility>): Promise<EligibilityToolResult> {
  await refreshProfile(deps, ctx);
  const intent = deriveIntent(ctx.profile, (args.intent ?? []) as SchemeCategory[]);
  const schemes = applicableSchemes(deps.registry.all(), ctx.profile);
  const results = runEligibility(schemes, ctx.profile, { intentCategories: intent });
  const bySlug = new Map(schemes.map((s) => [s.slug, s]));
  const cards = results.filter((r) => r.status !== 'NOT_ELIGIBLE').slice(0, 12).map((r) => buildCard(bySlug.get(r.slug)!, r, ctx.lang));
  const notEligible = results
    .filter((r) => r.status === 'NOT_ELIGIBLE')
    .map((r) => {
      const s = bySlug.get(r.slug)!;
      const card = buildCard(s, r, ctx.lang);
      return { slug: s.slug, name: card.name, reason: card.failed[0] ?? '' };
    });
  const next = nextQuestionField(ctx.profile, deps.registry.all(), ctx.lang, intent, results);
  const completeness = profileCompleteness(ctx.profile);
  const count = (st: string) => results.filter((r) => r.status === st).length;
  ctx.ui.results = cards;
  ctx.ui.profileCompleteness = completeness;
  if (next) ctx.ui.askedField = next;
  ctx.session.lastResultSlugs = cards.filter((c) => isEligible(c.status)).map((c) => c.slug);
  ctx.session.lastAskedField = next;
  if (ctx.session.state === 'discovery' && cards.length > 0) ctx.session.state = 'results';
  for (const c of cards.slice(0, 5)) {
    const r = results.find((x) => x.slug === c.slug)!;
    await deps.audit.log({ userId: ctx.user._id, eventType: 'eligibility_run', toolName: 'run_eligibility', schemeSlug: c.slug, ruleVersion: r.ruleVersion, result: r.status });
  }
  return {
    cards, notEligible: notEligible.slice(0, 10), completeness, intent, nextQuestionField: next, nextQuestion: question(ctx, next),
    counts: { eligibleVerified: count('ELIGIBLE_VERIFIED'), eligibleEstimated: count('ELIGIBLE_ESTIMATED'), needsInfo: count('LIKELY_NEEDS_INFO'), notEligible: count('NOT_ELIGIBLE') },
  };
}

function requireScheme(deps: ToolDeps, slug: string) {
  const s = deps.registry.get(slug);
  if (!s) throw new ToolError('UNKNOWN_SCHEME', `No scheme called "${slug}". Use only slugs from the tool declarations.`);
  return s;
}

async function schemeDetails(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.get_scheme_details>): Promise<SchemeDetailsResult> {
  const s = requireScheme(deps, args.slug);
  ctx.session.activeSchemeSlug = s.slug;
  return {
    slug: s.slug, name: tr(s.name, ctx.lang), officialName: s.name.en, benefit: tr(s.benefitSummary, ctx.lang), ministry: s.ministry,
    category: s.category, level: s.level,
    documents: s.documentsRequired.map((d) => ({ code: d.code, name: tr(deps.registry.doc(d.code)?.displayName, ctx.lang) || d.code })),
    officialLinks: deps.registry.safeLinks(s), notChecked: s.notChecked, hasGuide: s.applicationSteps.length > 0,
    dataQuality: s.dataQuality, lastVerifiedOn: s.lastVerifiedOn, ...(s.reviewNote ? { reviewNote: s.reviewNote } : {}),
  };
}

async function requestVerification(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.request_verification>): Promise<VerificationToolResult> {
  try {
    const out = await deps.verification.start(ctx.user, args.docTypes as DocumentCode[] | undefined, ctx.lang);
    ctx.ui.consentUrl = out.consentUrl;
    ctx.session.state = 'verification';
    return {
      consentUrl: out.consentUrl, demo: out.demo, retentionDays: out.retentionDays,
      documents: out.docTypes.map((c) => ({ code: c, name: tr(deps.registry.doc(c)?.displayName, ctx.lang) || c })),
    };
  } catch (err) {
    if (err instanceof ConsentError) throw new ToolError(err.code, err.message);
    throw err;
  }
}

/** Best eligible scheme that has a guide; used when the user just says "help me apply". */
async function defaultGuideSlug(deps: ToolDeps, ctx: ToolContext): Promise<string | null> {
  if (ctx.session.activeSchemeSlug && deps.registry.get(ctx.session.activeSchemeSlug)?.applicationSteps.length) return ctx.session.activeSchemeSlug;
  await refreshProfile(deps, ctx);
  const results = runEligibility(applicableSchemes(deps.registry.all(), ctx.profile), ctx.profile, { intentCategories: deriveIntent(ctx.profile) });
  const guided = (st: (s: string) => boolean) => results.find((r) => st(r.status) && deps.registry.get(r.slug)!.applicationSteps.length > 0);
  return (guided((s) => s.startsWith('ELIGIBLE')) ?? guided((s) => s === 'LIKELY_NEEDS_INFO'))?.slug ?? null;
}

async function startGuide(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.start_application_guide>): Promise<GuideToolResult | NoGuideResult> {
  const slug = args.slug ?? (await defaultGuideSlug(deps, ctx));
  if (!slug) throw new ToolError('NO_CANDIDATE', 'There is no scheme with a guided application for this profile yet. Ask for more profile details first.');
  const scheme = requireScheme(deps, slug);
  try {
    const view = await deps.applications.start(ctx.user._id, slug, ctx.lang);
    ctx.session.applicationId = view.applicationId;
    ctx.session.activeSchemeSlug = slug;
    ctx.session.applicationStep = view.stepNumber;
    ctx.session.state = 'application';
    ctx.ui.guide = view;
    await deps.audit.log({ userId: ctx.user._id, eventType: 'application_started', toolName: 'start_application_guide', schemeSlug: slug, ruleVersion: scheme.eligibilityRules.ruleVersion, result: 'ok' });
    return { view, started: true };
  } catch (err) {
    if (err instanceof ApplicationError && err.code === 'NO_GUIDE') {
      ctx.session.activeSchemeSlug = slug;
      return { noGuide: true, slug, name: tr(scheme.name, ctx.lang), officialLink: deps.registry.safeLinks(scheme)[0] ?? null };
    }
    throw err;
  }
}

async function nextStep(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.next_application_step>): Promise<GuideToolResult> {
  if (!ctx.session.applicationId) throw new ToolError('NO_ACTIVE_APPLICATION', 'No application guide is active. Call start_application_guide first.');
  const view = await deps.applications.act(ctx.user._id, ctx.session.applicationId, args.action, ctx.lang);
  ctx.session.applicationStep = view.stepNumber;
  ctx.ui.guide = view;
  if (view.done) await deps.audit.log({ userId: ctx.user._id, eventType: 'application_prepared', toolName: 'next_application_step', schemeSlug: view.schemeSlug, result: 'kit_ready' });
  return { view, started: false };
}

async function linkCheck(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.check_link>): Promise<LinkToolResult> {
  const result = checkLink(args.text, deps.registry.all(), ctx.lang);
  // Reasons are hand-written in English and Hindi; other languages go through the language layer (cached, falls back to English).
  if (ctx.lang !== 'en' && ctx.lang !== 'hi') {
    result.reasons = await Promise.all(result.reasons.map(async (r) => {
      try { return (await deps.language.translate(r, 'en', ctx.lang)).text; } catch { return r; }
    }));
  }
  ctx.ui.linkCheck = result;
  await deps.audit.log({ userId: ctx.user._id, eventType: 'link_checked', toolName: 'check_link', schemeSlug: result.suggestedOfficialLink?.schemeSlug ?? null, result: result.verdict });
  return { result };
}

async function saveTracker(deps: ToolDeps, ctx: ToolContext, args: z.infer<typeof schemas.save_tracker>): Promise<TrackerToolResult> {
  const slug = args.slug ?? ctx.session.activeSchemeSlug;
  if (!slug) throw new ToolError('NO_SCHEME', 'Say which scheme to track.');
  const scheme = requireScheme(deps, slug);
  const reminderAt = args.reminderInDays ? new Date(Date.now() + args.reminderInDays * 86_400_000).toISOString() : undefined;
  const docs = await deps.profiles.documents(ctx.user._id);
  const t = await deps.trackers.upsert(ctx.user._id, slug, {
    ...(args.status ? { status: args.status } : {}),
    ...(args.notes !== undefined ? { notes: args.notes } : {}),
    ...(reminderAt ? { reminderAt } : {}),
    checklistState: Object.fromEntries(deps.applications.buildChecklist(scheme, docs, 'en').map((c) => [c.code, c.available])),
  });
  await deps.audit.log({ userId: ctx.user._id, eventType: 'tracker_saved', toolName: 'save_tracker', schemeSlug: slug, result: t.status });
  return { saved: true, slug, status: t.status, reminderAt: t.reminderAt };
}

export type ToolHandler<N extends ToolName> = (deps: ToolDeps, ctx: ToolContext, args: never) => Promise<ToolResultMap[N]>;

const handlers = {
  update_profile: updateProfile,
  run_eligibility: runElig,
  get_scheme_details: schemeDetails,
  request_verification: requestVerification,
  start_application_guide: startGuide,
  next_application_step: nextStep,
  check_link: linkCheck,
  save_tracker: saveTracker,
} as const;

export const TOOL_NAMES = Object.keys(handlers) as ToolName[];

/** Validate, run and return a tool result, or an `{error}` object the model can read. Never throws for expected failures. */
export async function executeTool(
  deps: ToolDeps, ctx: ToolContext, name: string, rawArgs: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string; code: string }> {
  if (!(name in handlers)) return { ok: false, code: 'UNKNOWN_TOOL', error: `Unknown tool: ${name}` };
  const v = validateToolArgs(name, rawArgs);
  if (!v.ok) return { ok: false, code: 'BAD_ARGUMENTS', error: v.error };
  try {
    const handler = handlers[name as ToolName] as (d: ToolDeps, c: ToolContext, a: unknown) => Promise<unknown>;
    return { ok: true, result: await handler(deps, ctx, v.args) };
  } catch (err) {
    if (err instanceof ToolError) return { ok: false, code: err.code, error: err.message };
    if (err instanceof ApplicationError) return { ok: false, code: err.code, error: err.message };
    throw err;
  }
}

