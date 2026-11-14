/**
 * Seed pipeline: read the curated JSON, merge cached translations, validate with zod, and refuse
 * to load any scheme whose links are not on the whitelist.
 */
import path from 'node:path';
import { z } from 'zod';
import {
  DEMO_LANGUAGE_CODES, documentTypeSchema, schemeSchema, type DocumentCode, type DocumentType, type FieldKey, type Scheme,
} from '@digischeme/shared';
import { SEED_DIR, readJson } from '../config/paths';
import { checkUrl } from '../trust/whitelist';

type TranslationCache = Record<string, Record<string, [string, string]>> & { _meta?: unknown };

export interface PersonaDocument {
  code: DocumentCode;
  title: string;
  issuer: string;
  issuedOn: string;
  validUntil: string | null;
  reference: string;
  derived: Partial<Record<FieldKey, unknown>>;
}

export type PersonaStep =
  | { kind: 'text' | 'voice'; text: string; note?: string }
  | { kind: 'digilocker'; docs: DocumentCode[]; note?: string }
  | { kind: 'action'; action: 'apply' | 'results' | 'step' | 'details' | 'verify' | 'track'; slug?: string; stepAction?: 'next' | 'back' | 'repeat' | 'explain' | 'no_document'; note?: string };

export interface Persona {
  id: string;
  name: string;
  summary: string;
  language: string;
  channel: 'whatsapp' | 'web';
  lowBandwidth?: boolean;
  phone: string;
  ekyc: { demoCode: string; name: string; yearOfBirth: number; gender: string; state: string };
  digilockerDocuments: PersonaDocument[];
  script: PersonaStep[];
  expect: Record<string, unknown>;
}

export class SeedValidationError extends Error {}

export function loadSchemes(): Scheme[] {
  const raw = readJson<unknown[]>(path.join(SEED_DIR, 'schemes.json'));
  const cache = readJson<TranslationCache>(path.join(SEED_DIR, 'scheme-translations.json'));
  const parsed = z.array(schemeSchema).safeParse(raw);
  if (!parsed.success) {
    throw new SeedValidationError(`schemes.json failed validation: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
  }
  const schemes = parsed.data as Scheme[];
  const slugs = new Set<string>();
  for (const s of schemes) {
    if (slugs.has(s.slug)) throw new SeedValidationError(`Duplicate slug ${s.slug}`);
    slugs.add(s.slug);
    // Links are validated at seed time and again at request time (spec 11.4.2).
    for (const link of [...s.officialLinks.map((l) => l.url), s.sourceUrl]) {
      const res = checkUrl(link);
      if (!res.official) throw new SeedValidationError(`${s.slug}: link not on whitelist (${res.code}): ${link}`);
    }
    if (s.level === 'state' && s.states.length === 0) throw new SeedValidationError(`${s.slug}: state scheme needs states[]`);
    for (const lang of DEMO_LANGUAGE_CODES) {
      const t = cache[lang]?.[s.slug];
      if (t) {
        s.name[lang] = t[0];
        s.benefitSummary[lang] = t[1];
      }
    }
  }
  return schemes;
}

export function loadDocumentTypes(): DocumentType[] {
  const raw = readJson<unknown[]>(path.join(SEED_DIR, 'documentTypes.json'));
  return z.array(documentTypeSchema).parse(raw) as DocumentType[];
}

export function loadPersonas(): Persona[] {
  return readJson<Persona[]>(path.join(SEED_DIR, 'personas.json'));
}

/** Which demo languages are still missing a cached translation, per scheme. */
export function missingTranslations(schemes: Scheme[]): Array<{ slug: string; langs: string[] }> {
  return schemes
    .map((s) => ({ slug: s.slug, langs: DEMO_LANGUAGE_CODES.filter((l) => !s.name[l] || !s.benefitSummary[l]) }))
    .filter((x) => x.langs.length > 0);
}
