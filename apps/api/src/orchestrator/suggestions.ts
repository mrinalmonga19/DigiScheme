import {
  CATEGORIES, EDUCATION_LEVELS, GENDERS, OCCUPATIONS, RESIDENCES, pack, type ChatUiHints, type FieldKey, type SessionState, type SuggestedReply,
} from '@digischeme/shared';
import { isBooleanField } from '../llm/mockNlu';

const OPTIONS: Partial<Record<FieldKey, readonly string[]>> = {
  occupation: OCCUPATIONS.filter((o) => o !== 'senior_citizen'),
  category: CATEGORIES,
  residence: RESIDENCES,
  gender: GENDERS.filter((g) => g !== 'other'),
  educationLevel: EDUCATION_LEVELS.filter((e) => e !== 'none' && e !== 'primary'),
};

/**
 * Tappable replies for the current moment. They carry structured payloads so a tap never depends on the
 * model parsing free text, and on WhatsApp a numbered reply selects one.
 */
export function suggestionsFor(args: {
  lang: string;
  state: SessionState;
  ui: Partial<ChatUiHints>;
  askedField: FieldKey | null;
  verified: boolean;
}): SuggestedReply[] {
  const p = pack(args.lang);
  const out: SuggestedReply[] = [];
  const guide = args.ui.guide;

  if (args.state === 'application' && guide) {
    if (guide.done) {
      out.push({ label: p.ui.saveTracker, structured: { type: 'action', action: 'track', slug: guide.schemeSlug } });
      out.push({ label: p.bot.btnResults, structured: { type: 'action', action: 'results' } });
      return out;
    }
    out.push({ label: p.bot.btnNext, structured: { type: 'action', action: 'step', stepAction: 'next' } });
    out.push({ label: p.bot.btnBack, structured: { type: 'action', action: 'step', stepAction: 'back' } });
    out.push({ label: p.bot.btnRepeat, structured: { type: 'action', action: 'step', stepAction: 'repeat' } });
    out.push({ label: p.bot.btnExplain, structured: { type: 'action', action: 'step', stepAction: 'explain' } });
    if (guide.documentNeeded && !guide.documentNeeded.available) {
      out.push({ label: p.bot.btnNoDoc, structured: { type: 'action', action: 'step', stepAction: 'no_document' } });
    }
    return out;
  }

  const f = args.askedField;
  if (f) {
    if (isBooleanField(f)) {
      out.push({ label: p.values.yes, structured: { type: 'profile', fields: { [f]: true } } });
      out.push({ label: p.values.no, structured: { type: 'profile', fields: { [f]: false } } });
    } else if (OPTIONS[f]) {
      for (const v of OPTIONS[f]!) out.push({ label: p.values[v as keyof typeof p.values] ?? v, structured: { type: 'profile', fields: { [f]: v } } });
    }
  }

  const top = args.ui.results?.find((c) => c.hasGuide && (c.badge === 'verified' || c.badge === 'estimated'));
  if (top) out.push({ label: `${p.bot.btnApply}: ${top.name}`, structured: { type: 'action', action: 'apply', slug: top.slug } });
  if (args.ui.results?.length && !args.verified) out.push({ label: p.bot.btnVerify, structured: { type: 'action', action: 'verify' } });
  if (out.length === 0 && args.ui.results?.length) out.push({ label: p.bot.btnResults, structured: { type: 'action', action: 'results' } });
  return out.slice(0, 8);
}
