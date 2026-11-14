import type { EligibilityResult, EligibilityStatus, Profile, Scheme, SchemeCategory } from '@digischeme/shared';
import { evaluateNode } from './evaluator';
import { statusFor } from './badge';

export interface RunOptions {
  /** Categories the user seems to be asking about; a small relevance boost. */
  intentCategories?: SchemeCategory[];
}

const STATUS_BASE: Record<EligibilityStatus, number> = {
  ELIGIBLE_VERIFIED: 100,
  ELIGIBLE_ESTIMATED: 80,
  LIKELY_NEEDS_INFO: 40,
  NOT_ELIGIBLE: 0,
};

/**
 * rankScore = status weight + benefit relevance (0-15) + completeness (0-10) + small boosts.
 * Deterministic, so the same profile always sorts the same way.
 */
export function rankScore(
  scheme: Scheme,
  status: EligibilityStatus,
  matched: number,
  missing: number,
  profile: Profile,
  opts: RunOptions,
): number {
  if (status === 'NOT_ELIGIBLE') return 0;
  const amount = scheme.benefitAmount ?? 0;
  const benefit = amount > 0 ? Math.min(15, Math.round((Math.log10(amount + 1) / 6) * 15)) : 5;
  const total = matched + missing;
  const completeness = total === 0 ? 0 : Math.round((matched / total) * 10);
  const intent = opts.intentCategories?.includes(scheme.category) ? 8 : 0;
  const local = scheme.level === 'state' && scheme.states.includes(String(profile.state?.value ?? '')) ? 3 : 0;
  return STATUS_BASE[status] + benefit + completeness + intent + local;
}

/** Evaluate one scheme against one profile. */
export function evaluateScheme(scheme: Scheme, profile: Profile, opts: RunOptions = {}): EligibilityResult {
  const res = evaluateNode({ all: scheme.eligibilityRules.all }, profile);
  const status = statusFor(res.state, res.verified);
  return {
    slug: scheme.slug,
    status,
    matchedConditions: res.matched,
    failedConditions: res.failed,
    // When a scheme already fails there is nothing useful to ask for.
    missingFields: status === 'NOT_ELIGIBLE' ? [] : res.missing,
    ruleVersion: scheme.eligibilityRules.ruleVersion,
    rankScore: rankScore(scheme, status, res.matched.length, res.missing.length, profile, opts),
  };
}

/** Evaluate every scheme and sort by rankScore (ties broken by slug for stable output). */
export function runEligibility(schemes: Scheme[], profile: Profile, opts: RunOptions = {}): EligibilityResult[] {
  return schemes
    .map((s) => evaluateScheme(s, profile, opts))
    .sort((a, b) => b.rankScore - a.rankScore || a.slug.localeCompare(b.slug));
}

export const isEligible = (s: EligibilityStatus): boolean => s === 'ELIGIBLE_VERIFIED' || s === 'ELIGIBLE_ESTIMATED';
