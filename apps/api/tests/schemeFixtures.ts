import type { FieldKey } from '@digischeme/shared';

type Values = Partial<Record<FieldKey, unknown>>;

/**
 * For every scheme: a profile that passes, an override that makes it fail, and a field whose
 * absence must turn the result into LIKELY_NEEDS_INFO. Adding a scheme without an entry here
 * fails the test suite on purpose (see CONTRIBUTING.md).
 */
export const SCHEME_FIXTURES: Record<string, { pass: Values; fail: Values; drop: FieldKey }> = {
  'pm-kisan': {
    pass: { occupation: 'farmer', landholdingHectares: 1.2, isIncomeTaxPayer: false, isGovtEmployee: false },
    fail: { isIncomeTaxPayer: true },
    drop: 'landholdingHectares',
  },
  pmfby: { pass: { occupation: 'farmer' }, fail: { occupation: 'salaried' }, drop: 'occupation' },
  'kisan-credit-card': { pass: { occupation: 'farmer', age: 40 }, fail: { age: 80 }, drop: 'age' },
  'ab-pmjay': { pass: { age: 72, isBPL: false }, fail: { age: 40, isBPL: false }, drop: 'age' },
  'janani-suraksha-yojana': {
    pass: { gender: 'female', isPregnantOrNewMother: true, isBPL: true, category: 'General', state: 'Kerala' },
    fail: { gender: 'male' },
    drop: 'isPregnantOrNewMother',
  },
  'atal-pension-yojana': {
    pass: { age: 30, hasBankAccount: true, isIncomeTaxPayer: false },
    fail: { age: 41 },
    drop: 'hasBankAccount',
  },
  pmjjby: { pass: { age: 45, hasBankAccount: true }, fail: { age: 51 }, drop: 'hasBankAccount' },
  pmsby: { pass: { age: 58, hasBankAccount: true }, fail: { age: 71 }, drop: 'hasBankAccount' },
  ignoaps: { pass: { age: 65, isBPL: true }, fail: { age: 58 }, drop: 'isBPL' },
  'central-sector-scholarship': {
    pass: { educationLevel: 'undergraduate', class12Above80thPercentile: true, annualFamilyIncome: 400000 },
    fail: { annualFamilyIncome: 450001 },
    drop: 'class12Above80thPercentile',
  },
  'post-matric-scholarship-sc': {
    pass: { category: 'SC', annualFamilyIncome: 210000, educationLevel: 'undergraduate' },
    fail: { category: 'OBC' },
    drop: 'annualFamilyIncome',
  },
  'pm-scholarship-capf': {
    pass: { isCAPFWard: true, educationLevel: 'undergraduate' },
    fail: { isCAPFWard: false },
    drop: 'educationLevel',
  },
  nmms: {
    pass: { educationLevel: 'class_9_10', institutionType: 'government', annualFamilyIncome: 300000 },
    fail: { institutionType: 'private' },
    drop: 'annualFamilyIncome',
  },
  pmmvy: {
    pass: { gender: 'female', isPregnantOrNewMother: true, isGovtEmployee: false },
    fail: { isGovtEmployee: true },
    drop: 'isPregnantOrNewMother',
  },
  'sukanya-samriddhi-yojana': { pass: { hasGirlChildUnder10: true }, fail: { hasGirlChildUnder10: false }, drop: 'hasGirlChildUnder10' },
  'pm-ujjwala-yojana': {
    pass: { gender: 'female', age: 30, hasLPGConnection: false, isBPL: true, category: 'General' },
    fail: { hasLPGConnection: true },
    drop: 'hasLPGConnection',
  },
  'pm-awas-yojana': { pass: { hasPuccaHouse: false, annualFamilyIncome: 250000 }, fail: { hasPuccaHouse: true }, drop: 'hasPuccaHouse' },
  mgnrega: { pass: { residence: 'rural', age: 30 }, fail: { residence: 'urban' }, drop: 'age' },
  'pm-svanidhi': {
    pass: { isStreetVendor: true, residence: 'urban', age: 31 },
    fail: { residence: 'rural' },
    drop: 'residence',
  },
  'pm-vishwakarma': {
    pass: { isArtisan: true, age: 35, isGovtEmployee: false },
    fail: { isArtisan: false },
    drop: 'isGovtEmployee',
  },
  'pm-mudra-yojana': {
    pass: { age: 28, occupation: 'self_employed', isStreetVendor: false, isArtisan: false },
    fail: { age: 17 },
    drop: 'age',
  },
  'stand-up-india': {
    pass: { age: 30, category: 'General', gender: 'female', occupation: 'self_employed' },
    fail: { occupation: 'salaried' },
    drop: 'occupation',
  },
  'e-shram': {
    pass: { age: 35, occupation: 'daily_wage_worker', isEPFOMember: false, isIncomeTaxPayer: false },
    fail: { isEPFOMember: true },
    drop: 'isEPFOMember',
  },
  'delhi-old-age-pension': {
    pass: { state: 'Delhi', age: 64, annualFamilyIncome: 80000, yearsInState: 12 },
    fail: { state: 'Punjab' },
    drop: 'yearsInState',
  },
  'delhi-disability-pension': {
    pass: { state: 'Delhi', hasDisability: true, disabilityPercent: 60, annualFamilyIncome: 60000, yearsInState: 8 },
    fail: { disabilityPercent: 30 },
    drop: 'disabilityPercent',
  },
  'delhi-women-in-distress-pension': {
    pass: { state: 'Delhi', gender: 'female', age: 40, maritalStatus: 'widowed', annualFamilyIncome: 50000, yearsInState: 10 },
    fail: { maritalStatus: 'married' },
    drop: 'maritalStatus',
  },
  'delhi-jai-bhim-coaching': {
    pass: { state: 'Delhi', category: 'OBC', annualFamilyIncome: 500000, educationLevel: 'class_11_12' },
    fail: { category: 'General' },
    drop: 'category',
  },
  'tn-kalaignar-magalir-urimai-thogai': {
    pass: {
      state: 'Tamil Nadu', gender: 'female', age: 58, isHeadOfFamily: true, annualFamilyIncome: 96000,
      isIncomeTaxPayer: false, isGovtEmployee: false,
    },
    fail: { annualFamilyIncome: 250000 },
    drop: 'isHeadOfFamily',
  },
  'tn-cm-health-insurance': {
    pass: { state: 'Tamil Nadu', annualFamilyIncome: 96000 },
    fail: { state: 'Kerala' },
    drop: 'annualFamilyIncome',
  },
};
