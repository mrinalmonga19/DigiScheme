/**
 * Template-based explanations (spec 8.3). No LLM: every sentence is assembled from the
 * condition itself, so the wording can never add or drop a rule.
 */
import {
  FIELD_DEFS, fmt, formatRupees, pack, type ConditionOutcome, type EligibilityResult, type FieldKey,
} from '@digischeme/shared';

const MONEY_FIELDS: FieldKey[] = ['annualFamilyIncome'];

/** Render a single value (number, boolean, enum) in the user's language. */
export function renderValue(field: FieldKey, value: unknown, lang: string): string {
  const p = pack(lang);
  if (typeof value === 'boolean') return value ? p.values.yes : p.values.no;
  if (typeof value === 'number') {
    return MONEY_FIELDS.includes(field) ? formatRupees(value, lang) : String(value);
  }
  if (typeof value === 'string') {
    const def = FIELD_DEFS[field];
    if (def.type === 'enum' && value in p.values) return p.values[value as keyof typeof p.values];
    return value;
  }
  return String(value);
}

/** "Age: 18 to 40" in the user's language. English keeps the hand-written rule label. */
export function renderRequirement(c: ConditionOutcome, lang: string): string {
  if (lang === 'en') return c.label;
  const p = pack(lang);
  const name = p.fields[c.field] ?? c.field;
  const v = (x: unknown) => renderValue(c.field, x, lang);
  let req: string;
  switch (c.op) {
    case 'between': {
      const [a, b] = c.expected as [unknown, unknown];
      req = fmt(p.ops.between, { a: v(a), b: v(b) });
      break;
    }
    case 'lte': req = fmt(p.ops.lte, { v: v(c.expected) }); break;
    case 'gte': req = fmt(p.ops.gte, { v: v(c.expected) }); break;
    case 'lt': req = fmt(p.ops.lt, { v: v(c.expected) }); break;
    case 'gt': req = fmt(p.ops.gt, { v: v(c.expected) }); break;
    case 'in': req = (c.expected as unknown[]).map(v).join(' / '); break;
    case 'notIn': req = fmt(p.ops.notOneOf, { v: (c.expected as unknown[]).map(v).join(' / ') }); break;
    case 'neq': req = fmt(p.ops.notOneOf, { v: v(c.expected) }); break;
    case 'exists': req = p.ops.known; break;
    default: req = v(c.expected);
  }
  return `${name}: ${req}`;
}

export interface Explanation {
  statusLabel: string;
  reasons: string[]; // conditions that passed
  failed: string[]; // conditions that failed, with what the user told us
  missing: Array<{ field: FieldKey; label: string }>;
}

export function explain(result: EligibilityResult, lang: string): Explanation {
  const p = pack(lang);
  const statusLabel = {
    ELIGIBLE_VERIFIED: p.bot.statusVerified,
    ELIGIBLE_ESTIMATED: p.bot.statusEstimated,
    LIKELY_NEEDS_INFO: p.bot.statusNeedsInfo,
    NOT_ELIGIBLE: p.bot.statusNotEligible,
  }[result.status];
  return {
    statusLabel,
    reasons: result.matchedConditions.map((c) => renderRequirement(c, lang)),
    failed: result.failedConditions.map(
      (c) => `${renderRequirement(c, lang)} (${fmt(p.ops.yourInfo, { v: renderValue(c.field, c.actual, lang) })})`,
    ),
    missing: result.missingFields.map((f) => ({ field: f, label: p.fields[f] ?? f })),
  };
}

/** The question to ask for a missing field, in the user's language. */
export function questionFor(field: FieldKey, lang: string): string {
  const p = pack(lang);
  return p.questions[field] ?? fmt(p.bot.askGeneric, { field: p.fields[field] ?? field });
}
