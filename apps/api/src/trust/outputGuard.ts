/**
 * Output Guard (spec 4.1 step 7). Every outgoing message on every channel passes through here:
 *   1. link whitelist  - non-official URLs are replaced with a warning in the user's language;
 *   2. PII scrubber    - identifiers are masked;
 *   3. banned claims   - promises the assistant must never make are removed.
 */
import { pack } from '@digischeme/shared';
import { extractUrls } from './extract';
import { scrubPii } from './pii';
import { checkUrl } from './whitelist';

export interface GuardReport {
  text: string;
  removedLinks: string[];
  piiMasked: string[];
  bannedClaims: string[];
}

const BANNED: Array<{ id: string; re: RegExp }> = [
  { id: 'guarantee', re: /[^.!?।\n]*\b(guarantee[ds]?|100\s?%\s?(sure|approved|guaranteed)|definitely (get|receive|be approved))\b[^.!?।\n]*[.!?।]?/giu },
  { id: 'auto_submitted', re: /[^.!?।\n]*\b(i|we)\s+(have\s+|already\s+|just\s+)*(submitted|filed|applied)\b[^.!?।\n]*\b(application|form)\b[^.!?।\n]*[.!?।]?/giu },
  { id: 'asks_fee', re: /[^.!?।\n]*\b(pay|send|transfer)\s+(us|me|rs\.?|₹|a fee)\b[^.!?।\n]*[.!?।]?/giu },
  { id: 'asks_secret', re: /[^.!?।\n]*\b(share|send|tell|enter|give)\b[^.!?।\n]{0,25}\b(your\s+)?(otp|aadhaar number|pin|password|cvv)\b[^.!?।\n]{0,10}\b(here|to me|with me|in this chat)\b[^.!?।\n]*[.!?।]?/giu },
  { id: 'guarantee_hi', re: /[^.!?।\n]*(गारंटी|पक्का मिलेगा|ज़रूर मिलेगा|100% मिलेगा)[^.!?।\n]*[.!?।]?/gu },
];

export function guardOutput(text: string, lang: string): GuardReport {
  const p = pack(lang);
  const removedLinks: string[] = [];

  // 1. Links. Replace from the end so earlier indices stay valid.
  let out = text;
  for (const u of extractUrls(text).reverse()) {
    if (checkUrl(u.normalised).official) continue;
    removedLinks.push(u.raw);
    out = out.slice(0, u.index) + p.bot.removedLink + out.slice(u.index + u.raw.length);
  }

  // 2. Banned claims. Drop the whole sentence and say honestly that we are not sure.
  const bannedClaims: string[] = [];
  for (const { id, re } of BANNED) {
    if (re.test(out)) {
      bannedClaims.push(id);
      re.lastIndex = 0;
      out = out.replace(re, ' ');
    }
    re.lastIndex = 0;
  }
  if (bannedClaims.length > 0) out = `${out.replace(/\s{2,}/g, ' ').trim()} ${p.bot.unsure}`.trim();

  // 3. PII, last, so nothing introduced above can leak a number.
  const scrubbed = scrubPii(out);
  return { text: scrubbed.text, removedLinks: removedLinks.reverse(), piiMasked: scrubbed.found, bannedClaims };
}
