import fs from 'node:fs';
import path from 'node:path';
import { DEMO_LANGUAGE_CODES } from '@digischeme/shared';
import { SEED_DIR, readJson } from '../config/paths';
import { createLanguageService } from '../language';
import { loadSchemes, missingTranslations } from './loader';

/**
 * `npm run translate`: fill gaps in scheme-translations.json using the configured language provider
 * (Bhashini when BHASHINI_MODE=live, otherwise Gemini if a key exists). Run at seed time only, never per request.
 * Output is machine translation and must be reviewed by native speakers before production.
 */
const file = path.join(SEED_DIR, 'scheme-translations.json');
const cache = readJson<Record<string, Record<string, [string, string]>>>(file);
const lang = createLanguageService();
let added = 0;
let skipped = 0;
for (const { slug, langs } of missingTranslations(loadSchemes())) {
  const s = loadSchemes().find((x) => x.slug === slug)!;
  for (const l of langs.filter((c) => c !== 'en' && DEMO_LANGUAGE_CODES.includes(c))) {
    try {
      const [name, benefit] = await Promise.all([lang.translate(s.name.en, 'en', l), lang.translate(s.benefitSummary.en, 'en', l)]);
      if (name.provider === 'passthrough' || name.provider === 'mock') { skipped++; continue; } // no real translator available
      (cache[l] ??= {})[slug] = [name.text, benefit.text];
      added++;
    } catch (err) {
      skipped++;
      console.warn(`skip ${slug}/${l}: ${(err as Error).message}`);
    }
  }
}
if (added) fs.writeFileSync(file, JSON.stringify(cache, null, 2) + '\n');
console.log(`Translations added: ${added}, skipped: ${skipped}. ${added ? 'Review with native speakers before production.' : ''}`);
process.exit(0);
