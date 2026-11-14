/**
 * Profile field catalogue. One source of truth for the eligibility engine,
 * the conversation ladder, the profile editor and validation.
 */
export type FieldSource = 'self_declared' | 'digilocker_verified' | 'ekyc_verified';

export interface ProfileFieldValue<T = unknown> {
  value: T;
  source: FieldSource;
  capturedAt: string; // ISO timestamp
  confidence: number; // 0..1
}

export type FieldType = 'number' | 'boolean' | 'enum' | 'string';

export interface FieldDef {
  type: FieldType;
  values?: readonly string[];
  /** Encrypted at rest and never logged. */
  sensitive?: boolean;
  min?: number;
  max?: number;
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

export const OCCUPATIONS = [
  'student', 'farmer', 'daily_wage_worker', 'self_employed', 'salaried', 'unemployed', 'homemaker', 'senior_citizen',
] as const;
export const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS'] as const;
export const GENDERS = ['female', 'male', 'other'] as const;
export const RESIDENCES = ['rural', 'urban'] as const;
export const MARITAL = ['single', 'married', 'widowed', 'divorced', 'separated'] as const;
export const EDUCATION_LEVELS = [
  'none', 'primary', 'class_8', 'class_9_10', 'class_11_12', 'diploma', 'undergraduate', 'postgraduate',
] as const;
export const INSTITUTION_TYPES = ['government', 'aided', 'private'] as const;

export const FIELD_DEFS = {
  // --- Fields named in the product spec ---
  age: { type: 'number', min: 0, max: 120 },
  dateOfBirth: { type: 'string', sensitive: true },
  gender: { type: 'enum', values: GENDERS },
  state: { type: 'enum', values: INDIAN_STATES },
  district: { type: 'string' },
  residence: { type: 'enum', values: RESIDENCES },
  occupation: { type: 'enum', values: OCCUPATIONS },
  annualFamilyIncome: { type: 'number', min: 0, max: 1_000_000_000, sensitive: true },
  category: { type: 'enum', values: CATEGORIES, sensitive: true },
  maritalStatus: { type: 'enum', values: MARITAL },
  hasDisability: { type: 'boolean', sensitive: true },
  landholdingHectares: { type: 'number', min: 0, max: 10_000 },
  educationLevel: { type: 'enum', values: EDUCATION_LEVELS },
  institutionType: { type: 'enum', values: INSTITUTION_TYPES },
  familySize: { type: 'number', min: 1, max: 50 },
  hasBankAccount: { type: 'boolean' },
  hasLPGConnection: { type: 'boolean' },
  hasPuccaHouse: { type: 'boolean' },
  isIncomeTaxPayer: { type: 'boolean' },
  isEPFOMember: { type: 'boolean' },
  // --- Extensions needed to encode real scheme rules (see docs/LIMITATIONS.md) ---
  isBPL: { type: 'boolean', sensitive: true },
  isGovtEmployee: { type: 'boolean' },
  isStreetVendor: { type: 'boolean' },
  isArtisan: { type: 'boolean' },
  isPregnantOrNewMother: { type: 'boolean', sensitive: true },
  hasGirlChildUnder10: { type: 'boolean' },
  isCAPFWard: { type: 'boolean' },
  isHeadOfFamily: { type: 'boolean' },
  yearsInState: { type: 'number', min: 0, max: 120 },
  disabilityPercent: { type: 'number', min: 0, max: 100, sensitive: true },
  class12Above80thPercentile: { type: 'boolean' },
} as const satisfies Record<string, FieldDef>;

export type FieldKey = keyof typeof FIELD_DEFS;
export const FIELD_KEYS = Object.keys(FIELD_DEFS) as FieldKey[];
export type Profile = Partial<Record<FieldKey, ProfileFieldValue>>;

/** The conversational ladder: asked in this order before scheme-specific questions. */
export const LADDER_FIELDS: FieldKey[] = ['state', 'age', 'occupation', 'annualFamilyIncome', 'category'];

/** Fields that count toward the profile-completeness ring. */
export const CORE_FIELDS: FieldKey[] = [
  'state', 'age', 'gender', 'occupation', 'annualFamilyIncome', 'category', 'residence', 'hasBankAccount',
];

export function isVerifiedSource(source: FieldSource | undefined): boolean {
  return source === 'digilocker_verified' || source === 'ekyc_verified';
}

export function isFieldKey(key: string): key is FieldKey {
  return Object.prototype.hasOwnProperty.call(FIELD_DEFS, key);
}

/** Validate and coerce a raw value against the field definition. Returns undefined if invalid. */
export function coerceFieldValue(key: FieldKey, raw: unknown): unknown {
  const def: FieldDef = FIELD_DEFS[key];
  if (raw === null || raw === undefined || raw === '') return undefined;
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s₹]/g, ''));
      if (!Number.isFinite(n)) return undefined;
      if (def.min !== undefined && n < def.min) return undefined;
      if (def.max !== undefined && n > def.max) return undefined;
      return n;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(s)) return true;
      if (['false', 'no', 'n', '0'].includes(s)) return false;
      return undefined;
    }
    case 'enum': {
      const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
      return def.values!.find((v) => v.toLowerCase().replace(/[\s-]+/g, '_') === s);
    }
    case 'string': {
      const s = String(raw).trim();
      return s.length > 0 && s.length <= 120 ? s : undefined;
    }
  }
}

export function profileCompleteness(profile: Profile): number {
  const have = CORE_FIELDS.filter((k) => profile[k] !== undefined).length;
  return Math.round((have / CORE_FIELDS.length) * 100);
}
