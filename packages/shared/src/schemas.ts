import { z } from 'zod';
import { FIELD_KEYS, type FieldKey } from './profile';
import type { RuleNode } from './types';

const fieldKey = z.custom<FieldKey>((v) => typeof v === 'string' && (FIELD_KEYS as string[]).includes(v), {
  message: 'Unknown profile field',
});

export const translationsSchema = z.object({ en: z.string().min(1) }).catchall(z.string());

export const ruleConditionSchema = z.object({
  field: fieldKey,
  op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'in', 'notIn', 'exists']),
  value: z.unknown(),
  label: z.string().min(1),
});

export const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    ruleConditionSchema,
    z.object({ all: z.array(ruleNodeSchema).min(1) }),
    z.object({ any: z.array(ruleNodeSchema).min(1), label: z.string().optional() }),
    z.object({ not: ruleNodeSchema, label: z.string().optional() }),
  ]),
) as z.ZodType<RuleNode>;

export const DOCUMENT_CODES = [
  'aadhaar', 'income_certificate', 'caste_certificate', 'domicile_certificate', 'bank_passbook',
  'land_record', 'school_certificate', 'ration_card', 'disability_certificate', 'age_proof',
] as const;

export const applicationStepSchema = z.object({
  step: z.number().int().positive(),
  title: translationsSchema,
  officialFieldName: z.string().min(1),
  instruction: translationsSchema,
  prefillFrom: fieldKey.nullable(),
  commonMistakes: z.array(z.string()),
  documentNeeded: z.enum(DOCUMENT_CODES).nullable(),
});

export const schemeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: translationsSchema,
  ministry: z.string().min(1),
  level: z.enum(['central', 'state']),
  states: z.array(z.string()),
  category: z.enum([
    'education', 'health', 'agriculture', 'pension', 'housing', 'employment', 'women_child', 'finance', 'social_security',
  ]),
  benefitSummary: translationsSchema,
  benefitAmount: z.number().nonnegative().optional(),
  eligibilityRules: z.object({
    ruleVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    all: z.array(ruleNodeSchema).min(1),
  }),
  notChecked: z.array(z.string()),
  documentsRequired: z.array(z.object({ code: z.enum(DOCUMENT_CODES), digilockerCanSupply: z.boolean() })),
  applicationSteps: z.array(applicationStepSchema),
  officialLinks: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).min(1),
  sourceUrl: z.string().url(),
  lastVerifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataQuality: z.enum(['curated', 'needs_review']),
  reviewNote: z.string().optional(),
  machineTranslated: z.boolean(),
});

export const documentTypeSchema = z.object({
  code: z.enum(DOCUMENT_CODES),
  displayName: translationsSchema,
  digilockerAvailable: z.boolean(),
  howToGet: translationsSchema,
});
