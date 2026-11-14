import { en, type LanguagePack as LanguagePackDef } from './en';
import { hi } from './hi';
import { pa } from './pa';
import { ta } from './ta';
import { kn } from './kn';
import { bn } from './bn';
import { mr } from './mr';
import { te } from './te';
import { gu } from './gu';

export type LanguagePack = LanguagePackDef & { landing: typeof en.landing };

export const PACKS: Record<string, LanguagePackDef> = { en, hi, pa, ta, kn, bn, mr, te, gu };

/** Language pack for a code, falling back to English for languages without a pack yet. */
export function pack(lang: string): LanguagePack {
  const p = PACKS[lang] ?? en;
  const landing = p.landing ? { ...en.landing, ...p.landing } : en.landing;
  return { ...p, landing };
}

/** Fill `{name}` placeholders. Unknown placeholders are left as-is so gaps are visible in review. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Locale-aware rupee formatting with a consistent symbol. */
export function formatRupees(amount: number, lang: string): string {
  const locale = lang === 'en' ? 'en-IN' : `${lang}-IN`;
  try {
    return `₹${new Intl.NumberFormat(locale, { maximumFractionDigits: 0, numberingSystem: 'latn' }).format(amount)}`;
  } catch {
    return `₹${new Intl.NumberFormat('en-IN').format(amount)}`;
  }
}
