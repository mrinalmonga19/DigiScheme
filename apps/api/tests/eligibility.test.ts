import { describe, expect, it } from 'vitest';
import type { RuleNode, Scheme } from '@digischeme/shared';
import { badgeFor, compare, evaluateNode, evaluateScheme, explain, fieldsUsed, questionFor, runEligibility } from '../src/eligibility/index';
import { loadSchemes } from '../src/seed/loader';
import { profileOf } from './helpers';
import { SCHEME_FIXTURES } from './schemeFixtures';

const schemes = loadSchemes();
const bySlug = (slug: string): Scheme => schemes.find((s) => s.slug === slug)!;

describe('seed dataset', () => {
  it('has 20+ real schemes, with Delhi and one other state', () => {
    expect(schemes.length).toBeGreaterThanOrEqual(25);
    expect(schemes.filter((s) => s.states.includes('Delhi')).length).toBeGreaterThanOrEqual(4);
    expect(schemes.filter((s) => s.states.includes('Tamil Nadu')).length).toBeGreaterThanOrEqual(2);
  });
  it('every scheme has a source, a verification date and a data-quality flag', () => {
    for (const s of schemes) {
      expect(s.sourceUrl, s.slug).toMatch(/^https:\/\//);
      expect(s.lastVerifiedOn, s.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['curated', 'needs_review']).toContain(s.dataQuality);
      if (s.dataQuality === 'needs_review') expect(s.reviewNote, s.slug).toBeTruthy();
    }
  });
  it('at least 8 schemes have a guided application', () => {
    expect(schemes.filter((s) => s.applicationSteps.length > 0).length).toBeGreaterThanOrEqual(8);
  });
  it('every scheme has a test fixture', () => {
    expect(Object.keys(SCHEME_FIXTURES).sort()).toEqual(schemes.map((s) => s.slug).sort());
  });
});

describe.each(Object.entries(SCHEME_FIXTURES))('scheme %s', (slug, fx) => {
  const scheme = bySlug(slug);

  it('passing profile is ELIGIBLE_ESTIMATED when self-declared', () => {
    const r = evaluateScheme(scheme, profileOf(fx.pass));
    expect(r.status).toBe('ELIGIBLE_ESTIMATED');
    expect(r.failedConditions).toEqual([]);
    expect(r.missingFields).toEqual([]);
    expect(r.ruleVersion).toBe(scheme.eligibilityRules.ruleVersion);
  });

  it('passing profile is ELIGIBLE_VERIFIED when every field is verified', () => {
    expect(evaluateScheme(scheme, profileOf(fx.pass, 'all')).status).toBe('ELIGIBLE_VERIFIED');
  });

  it('failing profile is NOT_ELIGIBLE with a reason', () => {
    const r = evaluateScheme(scheme, profileOf({ ...fx.pass, ...fx.fail }));
    expect(r.status).toBe('NOT_ELIGIBLE');
    expect(r.failedConditions.length).toBeGreaterThan(0);
    expect(r.failedConditions[0]!.label.length).toBeGreaterThan(3);
    expect(r.rankScore).toBe(0);
  });

  it('missing data never counts as a pass', () => {
    const partial = { ...fx.pass };
    delete partial[fx.drop];
    const r = evaluateScheme(scheme, profileOf(partial));
    expect(r.status).toBe('LIKELY_NEEDS_INFO');
    expect(r.missingFields).toContain(fx.drop);
  });

  it('an empty profile is never eligible', () => {
    const r = evaluateScheme(scheme, {});
    expect(r.status).toBe('LIKELY_NEEDS_INFO');
    expect(r.missingFields.length).toBeGreaterThan(0);
  });
});

describe('boundaries', () => {
  const apy = bySlug('atal-pension-yojana');
  const base = { hasBankAccount: true, isIncomeTaxPayer: false };
  it.each([
    [17, 'NOT_ELIGIBLE'], [18, 'ELIGIBLE_ESTIMATED'], [40, 'ELIGIBLE_ESTIMATED'], [41, 'NOT_ELIGIBLE'],
  ])('APY at age %i is %s', (age, status) => {
    expect(evaluateScheme(apy, profileOf({ ...base, age })).status).toBe(status);
  });
  it.each([[18, true], [50, true], [51, false]])('PMJJBY at age %i eligible=%s', (age, ok) => {
    const r = evaluateScheme(bySlug('pmjjby'), profileOf({ age, hasBankAccount: true }));
    expect(r.status === 'ELIGIBLE_ESTIMATED').toBe(ok);
  });
  it.each([[70, true], [71, false]])('PMSBY at age %i eligible=%s', (age, ok) => {
    const r = evaluateScheme(bySlug('pmsby'), profileOf({ age, hasBankAccount: true }));
    expect(r.status === 'ELIGIBLE_ESTIMATED').toBe(ok);
  });
  it.each([[15, false], [16, true], [59, true], [60, false]])('e-Shram at age %i eligible=%s', (age, ok) => {
    const r = evaluateScheme(bySlug('e-shram'), profileOf({ age, occupation: 'self_employed', isEPFOMember: false, isIncomeTaxPayer: false }));
    expect(r.status === 'ELIGIBLE_ESTIMATED').toBe(ok);
  });
  it('income thresholds are inclusive where the rule says "up to"', () => {
    const pms = bySlug('post-matric-scholarship-sc');
    const at = (income: number) => evaluateScheme(pms, profileOf({ category: 'SC', annualFamilyIncome: income, educationLevel: 'diploma' })).status;
    expect(at(250000)).toBe('ELIGIBLE_ESTIMATED');
    expect(at(250001)).toBe('NOT_ELIGIBLE');
  });
  it('KMUT income is strictly below Rs 2.5 lakh', () => {
    const fx = SCHEME_FIXTURES['tn-kalaignar-magalir-urimai-thogai']!;
    const kmut = bySlug('tn-kalaignar-magalir-urimai-thogai');
    expect(evaluateScheme(kmut, profileOf({ ...fx.pass, annualFamilyIncome: 249999 })).status).toBe('ELIGIBLE_ESTIMATED');
    expect(evaluateScheme(kmut, profileOf({ ...fx.pass, annualFamilyIncome: 250000 })).status).toBe('NOT_ELIGIBLE');
  });
});

describe('verified vs estimated', () => {
  const pms = bySlug('post-matric-scholarship-sc');
  const values = { category: 'SC', annualFamilyIncome: 210000, educationLevel: 'undergraduate' };
  it('one self-declared field keeps the result Estimated', () => {
    const r = evaluateScheme(pms, profileOf(values, ['category', 'annualFamilyIncome']));
    expect(r.status).toBe('ELIGIBLE_ESTIMATED');
    expect(badgeFor(r.status)).toBe('estimated');
  });
  it('eKYC results count as verified too', () => {
    const r = evaluateScheme(bySlug('mgnrega'), profileOf({ residence: 'rural', age: 30 }, 'all', 'ekyc_verified'));
    expect(r.status).toBe('ELIGIBLE_VERIFIED');
  });
  it('an "any" group is verified when one passing branch is verified', () => {
    const pmjay = bySlug('ab-pmjay');
    expect(evaluateScheme(pmjay, profileOf({ age: 75, isBPL: true }, ['age'])).status).toBe('ELIGIBLE_VERIFIED');
    expect(evaluateScheme(pmjay, profileOf({ age: 75 })).status).toBe('ELIGIBLE_ESTIMATED');
  });
  it('a failing scheme never reports missing fields to ask about', () => {
    const r = evaluateScheme(bySlug('ignoaps'), profileOf({ age: 58 }));
    expect(r.status).toBe('NOT_ELIGIBLE');
    expect(r.missingFields).toEqual([]);
  });
});

describe('rule DSL', () => {
  const p = profileOf({ age: 30, state: 'Delhi', hasBankAccount: true });
  const leaf = (field: string, op: string, value: unknown): RuleNode => ({ field, op, value, label: 'x' }) as RuleNode;
  it('supports every operator', () => {
    expect(compare('eq', 1, 1)).toBe(true);
    expect(compare('neq', 1, 2)).toBe(true);
    expect(compare('lt', 1, 2)).toBe(true);
    expect(compare('lte', 2, 2)).toBe(true);
    expect(compare('gt', 3, 2)).toBe(true);
    expect(compare('gte', 2, 2)).toBe(true);
    expect(compare('between', 5, [5, 10])).toBe(true);
    expect(compare('between', 11, [5, 10])).toBe(false);
    expect(compare('in', 'a', ['a', 'b'])).toBe(true);
    expect(compare('notIn', 'c', ['a', 'b'])).toBe(true);
    expect(compare('exists', 'x', true)).toBe(true);
  });
  it('a non-numeric value in a numeric comparison is unknown, not a pass', () => {
    expect(compare('gte', 'thirty', 18)).toBeNull();
    expect(evaluateNode(leaf('age', 'gte', 18), profileOf({ age: 'thirty' })).state).toBe('missing');
  });
  it('all: one failure fails the group even with missing fields', () => {
    const r = evaluateNode({ all: [leaf('age', 'gte', 40), leaf('gender', 'eq', 'female')] }, p);
    expect(r.state).toBe('fail');
  });
  it('any: passes on one match, is unknown if nothing matches and something is missing', () => {
    expect(evaluateNode({ any: [leaf('age', 'gte', 40), leaf('state', 'eq', 'Delhi')] }, p).state).toBe('pass');
    expect(evaluateNode({ any: [leaf('age', 'gte', 40), leaf('gender', 'eq', 'female')] }, p).state).toBe('missing');
    expect(evaluateNode({ any: [leaf('age', 'gte', 40), leaf('state', 'eq', 'Goa')] }, p).state).toBe('fail');
  });
  it('not: inverts pass and fail, keeps unknown unknown', () => {
    expect(evaluateNode({ not: leaf('state', 'eq', 'Goa') }, p).state).toBe('pass');
    expect(evaluateNode({ not: leaf('state', 'eq', 'Delhi') }, p).state).toBe('fail');
    expect(evaluateNode({ not: leaf('gender', 'eq', 'male') }, p).state).toBe('missing');
  });
  it('lists every field a rule reads', () => {
    expect(fieldsUsed({ all: bySlug('pm-ujjwala-yojana').eligibilityRules.all }).sort()).toEqual(
      ['age', 'category', 'gender', 'hasLPGConnection', 'isBPL'].sort(),
    );
  });
});

describe('ranking and explanations', () => {
  it('is deterministic and sorts eligible schemes above the rest', () => {
    const profile = profileOf({ state: 'Tamil Nadu', age: 58, occupation: 'daily_wage_worker', annualFamilyIncome: 96000, hasBankAccount: true });
    const a = runEligibility(schemes, profile);
    const b = runEligibility(schemes, profile);
    expect(a).toEqual(b);
    const statuses = a.map((r) => r.status);
    const firstNot = statuses.indexOf('NOT_ELIGIBLE');
    expect(statuses.slice(0, firstNot).every((s) => s !== 'NOT_ELIGIBLE')).toBe(true);
    expect(a.filter((r) => r.status === 'ELIGIBLE_ESTIMATED').map((r) => r.slug)).toEqual(
      expect.arrayContaining(['pmsby', 'tn-cm-health-insurance']),
    );
  });
  it('verified results outrank estimated ones for the same scheme', () => {
    const v = { age: 30, hasBankAccount: true };
    const s = bySlug('pmsby');
    expect(evaluateScheme(s, profileOf(v, 'all')).rankScore).toBeGreaterThan(evaluateScheme(s, profileOf(v)).rankScore);
  });
  it('intent categories boost matching schemes', () => {
    const s = bySlug('pm-kisan');
    const profile = profileOf({ occupation: 'farmer' });
    expect(evaluateScheme(s, profile, { intentCategories: ['agriculture'] }).rankScore).toBeGreaterThan(evaluateScheme(s, profile).rankScore);
  });
  it('explains in English with the rule labels, without adding or dropping conditions', () => {
    const r = evaluateScheme(bySlug('atal-pension-yojana'), profileOf({ age: 30, hasBankAccount: true, isIncomeTaxPayer: false }));
    const e = explain(r, 'en');
    expect(e.reasons).toEqual(['Age 18 to 40', 'Has a bank account', 'Not an income tax payer']);
  });
  it('explains failures in the user language with the value they gave', () => {
    const r = evaluateScheme(bySlug('ignoaps'), profileOf({ age: 58, isBPL: true }));
    const hi = explain(r, 'hi');
    expect(hi.statusLabel).toBe('पात्र नहीं');
    expect(hi.failed[0]).toContain('उम्र');
    expect(hi.failed[0]).toContain('58');
    const ta = explain(r, 'ta');
    expect(ta.failed[0]).toContain('வயது');
  });
  it('has a question for missing fields in every demo language', () => {
    for (const lang of ['en', 'hi', 'pa', 'ta', 'kn', 'bn', 'mr', 'te', 'gu']) {
      expect(questionFor('landholdingHectares', lang).length).toBeGreaterThan(5);
      expect(questionFor('disabilityPercent', lang).length).toBeGreaterThan(5); // generic fallback
    }
  });
});
