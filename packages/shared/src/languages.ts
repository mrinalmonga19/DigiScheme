/**
 * Language registry. English plus all 22 scheduled languages are listed so the
 * architecture can grow; `demo: true` marks the nine with full string packs today.
 */
export interface LanguageInfo {
  code: string; // ISO 639 code, as used by Bhashini
  english: string;
  native: string;
  script: string;
  bcp47: string; // for browser speech APIs
  demo: boolean;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', english: 'English', native: 'English', script: 'Latin', bcp47: 'en-IN', demo: true },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी', script: 'Devanagari', bcp47: 'hi-IN', demo: true },
  { code: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', bcp47: 'pa-IN', demo: true },
  { code: 'ta', english: 'Tamil', native: 'தமிழ்', script: 'Tamil', bcp47: 'ta-IN', demo: true },
  { code: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada', bcp47: 'kn-IN', demo: true },
  { code: 'bn', english: 'Bengali', native: 'বাংলা', script: 'Bengali', bcp47: 'bn-IN', demo: true },
  { code: 'mr', english: 'Marathi', native: 'मराठी', script: 'Devanagari', bcp47: 'mr-IN', demo: true },
  { code: 'te', english: 'Telugu', native: 'తెలుగు', script: 'Telugu', bcp47: 'te-IN', demo: true },
  { code: 'gu', english: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati', bcp47: 'gu-IN', demo: true },
  { code: 'as', english: 'Assamese', native: 'অসমীয়া', script: 'Bengali', bcp47: 'as-IN', demo: false },
  { code: 'brx', english: 'Bodo', native: 'बड़ो', script: 'Devanagari', bcp47: 'brx-IN', demo: false },
  { code: 'doi', english: 'Dogri', native: 'डोगरी', script: 'Devanagari', bcp47: 'doi-IN', demo: false },
  { code: 'ks', english: 'Kashmiri', native: 'कॉशुर', script: 'Devanagari', bcp47: 'ks-IN', demo: false },
  { code: 'gom', english: 'Konkani', native: 'कोंकणी', script: 'Devanagari', bcp47: 'kok-IN', demo: false },
  { code: 'mai', english: 'Maithili', native: 'मैथिली', script: 'Devanagari', bcp47: 'mai-IN', demo: false },
  { code: 'ml', english: 'Malayalam', native: 'മലയാളം', script: 'Malayalam', bcp47: 'ml-IN', demo: false },
  { code: 'mni', english: 'Manipuri', native: 'মৈতৈলোন্', script: 'Bengali', bcp47: 'mni-IN', demo: false },
  { code: 'ne', english: 'Nepali', native: 'नेपाली', script: 'Devanagari', bcp47: 'ne-IN', demo: false },
  { code: 'or', english: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Odia', bcp47: 'or-IN', demo: false },
  { code: 'sa', english: 'Sanskrit', native: 'संस्कृतम्', script: 'Devanagari', bcp47: 'sa-IN', demo: false },
  { code: 'sat', english: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Ol Chiki', bcp47: 'sat-IN', demo: false },
  { code: 'sd', english: 'Sindhi', native: 'सिन्धी', script: 'Devanagari', bcp47: 'sd-IN', demo: false },
  { code: 'ur', english: 'Urdu', native: 'اردو', script: 'Arabic', bcp47: 'ur-IN', demo: false },
];

export const DEMO_LANGUAGES = LANGUAGES.filter((l) => l.demo);
export const DEMO_LANGUAGE_CODES = DEMO_LANGUAGES.map((l) => l.code);

export function isSupportedLanguage(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code);
}

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

/** A string with a required English value and optional other languages. */
export type Translations = { en: string } & Partial<Record<string, string>>;

/** Pick the best available translation, falling back to English. */
export function tr(t: Translations | undefined, lang: string): string {
  if (!t) return '';
  return t[lang] ?? t.en;
}

const SCRIPT_RANGES: Array<{ lang: string; from: number; to: number }> = [
  { lang: 'hi', from: 0x0900, to: 0x097f }, // Devanagari (hi/mr share it; see detectByScript)
  { lang: 'bn', from: 0x0980, to: 0x09ff },
  { lang: 'pa', from: 0x0a00, to: 0x0a7f },
  { lang: 'gu', from: 0x0a80, to: 0x0aff },
  { lang: 'or', from: 0x0b00, to: 0x0b7f },
  { lang: 'ta', from: 0x0b80, to: 0x0bff },
  { lang: 'te', from: 0x0c00, to: 0x0c7f },
  { lang: 'kn', from: 0x0c80, to: 0x0cff },
  { lang: 'ml', from: 0x0d00, to: 0x0d7f },
  { lang: 'ur', from: 0x0600, to: 0x06ff },
];

// Common Marathi-only function words, used to split Devanagari between hi and mr.
const MARATHI_MARKERS = /(आहे|नाही|माझ|मला|काय|पाहिजे|आणि|साठी|मी |तुम्ही|करायच|होय)/;

/**
 * Offline, deterministic language detection from Unicode script.
 * Used as the last-resort fallback so the demo never depends on a provider.
 */
export function detectByScript(text: string): { lang: string; confidence: number } {
  const counts = new Map<string, number>();
  let letters = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      if (/[a-z]/i.test(ch)) {
        counts.set('en', (counts.get('en') ?? 0) + 1);
        letters++;
      }
      continue;
    }
    const hit = SCRIPT_RANGES.find((r) => cp >= r.from && cp <= r.to);
    if (hit) {
      counts.set(hit.lang, (counts.get(hit.lang) ?? 0) + 1);
      letters++;
    }
  }
  if (letters === 0) return { lang: 'en', confidence: 0 };
  // Any Indic-script letters outweigh Latin ones: mixed text is usually a
  // regional-language speaker quoting an English scheme name.
  const indic = [...counts.entries()].filter(([l]) => l !== 'en').sort((a, b) => b[1] - a[1]);
  if (indic.length === 0) return { lang: 'en', confidence: 0.6 };
  let lang = indic[0]![0];
  if (lang === 'hi' && MARATHI_MARKERS.test(text)) lang = 'mr';
  return { lang, confidence: Math.min(0.95, 0.5 + indic[0]![1] / letters / 2) };
}
