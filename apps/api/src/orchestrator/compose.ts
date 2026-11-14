/**
 * Deterministic reply composition from tool results, in the user's language. The mock LLM uses it for
 * its whole reply; structured actions (chips) use it so they never wait on a model; and it is the
 * fallback when Gemini is slow or down. Every sentence comes from the language packs or from tool data,
 * so nothing here can invent a scheme, amount or link.
 */
import { fmt, pack, type GuideStepView, type LinkCheckResult, type SchemeCardView } from '@digischeme/shared';
import type { ToolResult } from '../llm/types';
import type {
  EligibilityToolResult, GuideToolResult, LinkToolResult, NoGuideResult, SchemeDetailsResult, TrackerToolResult,
  UpdateProfileResult, VerificationToolResult,
} from '../tools/types';

export interface ComposeOptions {
  lang: string;
  piiWarning?: boolean;
  nextQuestion?: string | null;
  command?: 'greeting' | 'medical_legal' | 'distress' | 'out_of_scope';
}

const label = (name: string, official: string, lang: string): string => (lang === 'en' || name === official ? name : `${name} (${official})`);

function statusWord(card: SchemeCardView, lang: string): string {
  const b = pack(lang).bot;
  return { verified: b.statusVerified, estimated: b.statusEstimated, needs_info: b.statusNeedsInfo, not_eligible: b.statusNotEligible }[card.badge];
}

export function renderStep(view: GuideStepView, lang: string): string {
  const b = pack(lang).bot;
  const lines: string[] = [];
  if (view.done) {
    lines.push(b.guideDone);
    if (view.officialLink) lines.push(`${view.officialLink.label}: ${view.officialLink.url}`);
    return lines.join('\n');
  }
  lines.push(fmt(b.guideStep, { n: view.stepNumber, total: view.totalSteps, title: view.title }));
  if (view.officialFieldName) lines.push(fmt(b.guideOnForm, { field: view.officialFieldName }));
  lines.push(view.instruction);
  if (view.prefill) lines.push(fmt(b.guidePrefill, { value: view.prefill.value }));
  if (view.documentNeeded && !view.documentNeeded.available) lines.push(`📄 ${view.documentNeeded.name}`);
  if (view.commonMistakes[0]) lines.push(`⚠ ${view.commonMistakes.slice(0, 2).join(' · ')}`);
  if (view.note) lines.push(view.note);
  return lines.join('\n');
}

function renderChecklist(view: GuideStepView, lang: string): string {
  const b = pack(lang).bot;
  const rows = view.checklist.map((c) => `${c.available ? '✅' : '⬜'} ${c.name}`);
  return [b.guideChecklist, ...rows].join('\n');
}

export function renderLinkVerdict(r: LinkCheckResult, lang: string): string {
  const b = pack(lang).bot;
  const head = { OFFICIAL: b.linkOfficial, NOT_OFFICIAL: b.linkNotOfficial, SUSPICIOUS: b.linkSuspicious }[r.verdict];
  const lines = [head];
  if (r.verdict !== 'OFFICIAL') {
    // The reasons name the host; the Output Guard would (rightly) strip a bare scam domain, so we state reasons without it.
    lines.push(...r.reasons.slice(0, 3).map((x) => `• ${x.replace(/\s*"[^"]*"/g, '').trim()}`));
    if (r.suggestedOfficialLink) lines.push(fmt(b.linkSuggest, { scheme: r.suggestedOfficialLink.label, url: r.suggestedOfficialLink.url }));
    lines.push(b.neverPay);
  }
  return lines.join('\n');
}

function renderResults(res: EligibilityToolResult, lang: string): string {
  const b = pack(lang).bot;
  const shown = res.cards.slice(0, 4);
  if (shown.length === 0) return b.resultsNone;
  const rows = shown.map((c) => `• ${label(c.name, c.officialName, lang)} — ${statusWord(c, lang)}: ${c.benefit}`);
  const out = [b.resultsIntro, ...rows];
  if (shown.some((c) => c.dataQuality === 'needs_review')) out.push(pack(lang).ui.underReview);
  if (shown.some((c) => c.hasGuide && (c.badge === 'verified' || c.badge === 'estimated'))) out.push(b.applyOffer);
  return out.join('\n');
}

function renderDetails(d: SchemeDetailsResult, lang: string): string {
  const b = pack(lang).bot;
  const lines = [`${label(d.name, d.officialName, lang)}: ${d.benefit}`];
  if (d.documents.length) lines.push(`${b.guideChecklist} ${d.documents.map((x) => x.name).join(', ')}`);
  if (d.officialLinks[0]) lines.push(`${pack(lang).ui.officialSite}: ${d.officialLinks[0].url}`);
  if (d.notChecked.length) lines.push(`${b.alsoRequired} ${d.notChecked.slice(0, 2).join(' ')}`);
  if (d.dataQuality === 'needs_review') lines.push(pack(lang).ui.underReview);
  return lines.join('\n');
}

export function composeReply(results: ToolResult[], opts: ComposeOptions): string {
  const { lang } = opts;
  const b = pack(lang).bot;
  const blocks: string[] = [];
  if (opts.piiWarning) blocks.push(b.piiWarning);
  let question = opts.nextQuestion ?? null;
  let showQuestion = true;
  let sawResults = false;

  for (const r of results) {
    if (!r.ok) {
      if (r.code === 'NO_CANDIDATE') blocks.push(b.resultsNone);
      else if (r.code === 'NO_ACTIVE_APPLICATION') blocks.push(b.applyOffer);
      else blocks.push(b.unsure);
      continue;
    }
    switch (r.name) {
      case 'update_profile': {
        const v = r.result as UpdateProfileResult;
        question = v.nextQuestion;
        if (v.applied.length > 0) blocks.push(b.noted);
        break;
      }
      case 'run_eligibility': {
        const v = r.result as EligibilityToolResult;
        question = v.nextQuestion;
        if (v.cards.length > 0) {
          sawResults = true;
          if (question) {
            const target = v.cards.find((c) => c.badge === 'needs_info') ?? v.cards[0]!;
            blocks.push(fmt(b.needInfoFor, { scheme: label(target.name, target.officialName, lang) }));
          } else {
            blocks.push(renderResults(v, lang));
          }
        } else if (!results.some((x) => x.name === 'update_profile')) {
          blocks.push(b.resultsNone);
        }
        break;
      }
      case 'get_scheme_details':
        blocks.push(renderDetails(r.result as SchemeDetailsResult, lang));
        break;
      case 'request_verification': {
        const v = r.result as VerificationToolResult;
        blocks.push([b.verifyOffer, v.demo ? pack(lang).ui.simulatedDigilocker : '', v.documents.map((d) => `• ${d.name}`).join('\n'), v.consentUrl]
          .filter(Boolean).join('\n'));
        showQuestion = false;
        break;
      }
      case 'start_application_guide': {
        const v = r.result as GuideToolResult | NoGuideResult;
        showQuestion = false;
        if ('noGuide' in v) blocks.push(fmt(b.guideNoSteps, { url: v.officialLink?.url ?? '' }));
        else blocks.push([fmt(b.guideStart, { scheme: label(v.view.schemeName, v.view.schemeName, lang) }), renderChecklist(v.view, lang), renderStep(v.view, lang)].join('\n\n'));
        break;
      }
      case 'next_application_step': {
        const v = r.result as GuideToolResult;
        showQuestion = false;
        blocks.push(renderStep(v.view, lang));
        break;
      }
      case 'check_link':
        blocks.push(renderLinkVerdict((r.result as LinkToolResult).result, lang));
        break;
      case 'save_tracker': {
        const v = r.result as TrackerToolResult;
        blocks.push(b.trackerSaved);
        void v;
        break;
      }
    }
  }

  if (opts.command === 'medical_legal') blocks.push(b.medicalLegal);
  else if (opts.command === 'out_of_scope') blocks.push(b.outOfScope);
  else if (opts.command === 'distress') blocks.push(b.distress);
  else if (opts.command === 'greeting' && blocks.length === 0) blocks.push(b.welcome);

  if (showQuestion && question && (blocks.length === 0 || sawResults || results.some((x) => x.name === 'update_profile') || opts.command)) {
    blocks.push(question);
  }
  if (blocks.length === 0) blocks.push(b.welcome, ...(question ? [question] : []));
  return blocks.join('\n\n');
}
