/** Find URLs in free text, including bare domains ("pm-kisan-yojana.com/apply"). */

// TLDs that matter for scam links. Kept explicit so "B.Tech" or "Rs.20" are not mistaken for domains.
const BARE_TLDS =
  'com|in|org|net|info|co|io|xyz|online|site|top|live|app|link|ly|me|shop|club|click|cc|biz|gov|nic|gd|gl|at|to|store|website|space|fun|icu|buzz|loan|cash|win|vip';

const SCHEME_URL = /\bhttps?:\/\/[^\s<>"'`]+/giu;
const BARE_URL = new RegExp(
  `(?<![@\\w.-])((?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?\\.)+(?:${BARE_TLDS}))(?![\\p{L}\\p{N}-])((?::\\d+)?(?:[/?#][^\\s<>"'\`]*)?)`,
  'giu',
);
const TRAILING = /[.,;:!?)\]}'"।…]+$/u;

export interface FoundUrl {
  /** Exactly as it appears in the text. */
  raw: string;
  /** With a scheme, ready for the URL parser. Bare domains are assumed HTTPS so they are judged on the host. */
  normalised: string;
  index: number;
  bare: boolean;
}

export function extractUrls(text: string): FoundUrl[] {
  const found: FoundUrl[] = [];
  const taken: Array<[number, number]> = [];
  for (const m of text.matchAll(SCHEME_URL)) {
    const raw = m[0].replace(TRAILING, '');
    found.push({ raw, normalised: raw, index: m.index, bare: false });
    taken.push([m.index, m.index + raw.length]);
  }
  for (const m of text.matchAll(BARE_URL)) {
    const start = m.index;
    if (taken.some(([a, b]) => start >= a && start < b)) continue; // already part of a scheme URL
    const raw = m[0].replace(TRAILING, '');
    found.push({ raw, normalised: `https://${raw}`, index: start, bare: true });
  }
  return found.sort((a, b) => a.index - b.index);
}
