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

/**
 * Guard against asking irrelevant questions that do not belong to the user's situation.
 * Keeps user answers in mind so no confusing, out-of-place questions are asked.
 */
export function isFieldRelevantToProfile(field: FieldKey, profile: Profile): boolean {
  const occ = profile.occupation?.value;
  const age = typeof profile.age?.value === 'number' ? profile.age.value : undefined;
  const gender = profile.gender?.value;

  // Farm land is ONLY for farmers
  if (field === 'landholdingHectares' && occ !== 'farmer') return false;

  // Student / education fields are ONLY for students or youth (age <= 25)
  if (
    (field === 'educationLevel' || field === 'institutionType' || field === 'class12Above80thPercentile') &&
    occ !== 'student' &&
    (age === undefined || age > 25)
  ) {
    return false;
  }

  // Street vendor / Artisan is only for informal / self-employed / daily wage workers
  if (
    (field === 'isStreetVendor' || field === 'isArtisan') &&
    occ !== 'self_employed' && occ !== 'daily_wage_worker' && occ !== 'unemployed'
  ) {
    return false;
  }

  // EPFO is not for students, senior citizens, or homemakers
  if (field === 'isEPFOMember' && (occ === 'student' || occ === 'senior_citizen' || occ === 'homemaker')) {
    return false;
  }

  // Pregnancy / motherhood is ONLY for women
  if (field === 'isPregnantOrNewMother' && gender !== 'female') {
    return false;
  }

  // Marital status for distress/widow pensions is not for men
  if (field === 'maritalStatus' && gender === 'male') {
    return false;
  }

  // Disability percentage only if hasDisability is true
  if (field === 'disabilityPercent' && profile.hasDisability?.value !== true) {
    return false;
  }

  return true;
}

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
  const askable = (f: FieldKey) =>
    Boolean(pack(lang).questions[f]) && profile[f] === undefined && isFieldRelevantToProfile(f, profile);

  // 1. Mandatory core ladder fields: state, age, occupation
  for (const f of FIRST) if (askable(f)) return f;

  const userIntent = deriveIntent(profile, intent);
  const res = results ?? runEligibility(applicableSchemes(schemes, profile), profile, { intentCategories: userIntent });
  const open = res.filter((r) => r.status === 'LIKELY_NEEDS_INFO');

  // 2. High-priority candidate scheme matching user's specific intent (e.g. PM-KISAN for farmer)
  const intentSchemes = new Set(schemes.filter((s) => userIntent.includes(s.category)).map((s) => s.slug));
  const bestIntent = open.find((r) => intentSchemes.has(r.slug) && r.matchedConditions.length > 0 && r.missingFields.some(askable));
  if (bestIntent) {
    const f = bestIntent.missingFields.find(askable);
    if (f) return f;
  }

  // 3. Core ladder fields: annualFamilyIncome, category
  for (const f of THEN) if (askable(f)) return f;

  // 4. Any other candidate scheme with matched conditions
  const bestOther = open.find((r) => r.matchedConditions.length > 0 && r.missingFields.some(askable));
  if (bestOther) {
    const f = bestOther.missingFields.find(askable);
    if (f) return f;
  }

  // 5. Any remaining needed fields that are relevant to this user's profile
  const needed = new Set(open.flatMap((r) => r.missingFields));
  for (const f of LADDER_FIELDS) if (needed.has(f) && askable(f)) return f;
  for (const f of needed) if (askable(f)) return f;

  return null;
}
