/**
 * Conversational profile ladder (spec 9.4). One question at a time, only for fields that can change
 * an eligibility result, preferring the question that matters most for the best-matching schemes.
 *
 *   1. state, age, occupation  (always first: they eliminate the most schemes)
 *   2. the most relevant candidate scheme's first missing field (e.g. landholding for PM-KISAN)
 *   3. family income, then category, then any other missing field that a candidate needs
 */
import {
  LADDER_FIELDS, pack, type EligibilityResult, type FieldKey, type Profile, type Scheme, type SchemeCategory,
} from '@digischeme/shared';
import { runEligibility } from '../eligibility';

const FIRST: FieldKey[] = ['state', 'age', 'occupation'];
const THEN: FieldKey[] = ['annualFamilyIncome', 'category'];

/** Categories a person is probably interested in, from what we know about them. */
export function deriveIntent(profile: Profile, extra: SchemeCategory[] = []): SchemeCategory[] {
  const out = new Set<SchemeCategory>(extra);
  const occ = profile.occupation?.value;
  const age = profile.age?.value;
  if (occ === 'farmer') out.add('agriculture');
  if (occ === 'student') out.add('education');
  if (occ === 'daily_wage_worker') { out.add('social_security'); out.add('employment'); }
  if (occ === 'homemaker') out.add('women_child');
  if (occ === 'unemployed') out.add('employment');
  if (occ === 'senior_citizen' || (typeof age === 'number' && age >= 60)) { out.add('pension'); out.add('health'); out.add('social_security'); }
  if (profile.isStreetVendor?.value === true) out.add('finance');
  if (profile.isArtisan?.value === true) { out.add('employment'); out.add('finance'); }
  if (profile.isPregnantOrNewMother?.value === true || profile.hasGirlChildUnder10?.value === true) out.add('women_child');
  return [...out];
}

/** State schemes of a state the user has not named yet would only add noise. */
export function applicableSchemes(schemes: Scheme[], profile: Profile): Scheme[] {
  const state = profile.state?.value;
  return schemes.filter((s) => s.level === 'central' || (typeof state === 'string' && s.states.includes(state)));
}

/** Pick the next field to ask about, or null when every candidate scheme is decided. */
export function nextQuestionField(
  profile: Profile,
  schemes: Scheme[],
  lang: string,
  intent: SchemeCategory[] = [],
  results?: EligibilityResult[],
): FieldKey | null {
  const askable = (f: FieldKey) => Boolean(pack(lang).questions[f]) && profile[f] === undefined;

  for (const f of FIRST) if (askable(f)) return f;

  const res = results ?? runEligibility(applicableSchemes(schemes, profile), profile, { intentCategories: deriveIntent(profile, intent) });
  const open = res.filter((r) => r.status === 'LIKELY_NEEDS_INFO');
  // Fields that would still change at least one open scheme.
  const needed = new Set(open.flatMap((r) => r.missingFields));

  // The best candidate we have already partly matched: ask for what it is missing, in rule order.
  const best = open.find((r) => r.matchedConditions.length > 0 && r.missingFields.some(askable));
  if (best) {
    const f = best.missingFields.find(askable);
    if (f) return f;
  }
  for (const f of [...THEN, ...LADDER_FIELDS]) if (needed.has(f) && askable(f)) return f;
  for (const f of needed) if (askable(f)) return f;
  return null;
}
