/**
 * "Check a link" (spec 11.4.3). Deterministic verdict: OFFICIAL, NOT_OFFICIAL or SUSPICIOUS,
 * a plain explanation, and when possible the real official link for the scheme the user wanted.
 */
import type { LinkCheckResult, Scheme } from '@digischeme/shared';
import { extractUrls } from './extract';
import { checkUrl, hostAllowed, type WhitelistCode } from './whitelist';

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'rb.gy', 'rebrand.ly', 'shorturl.at', 'tiny.cc',
  'ow.ly', 'buff.ly', 't.ly', 'shorturl.asia', 'linktr.ee', 'wa.link', 'surl.li', 'urlz.fr', 'lnkd.in',
]);

// Words a scammer puts in a hostname to look official.
const LOOKALIKE_TOKENS = [
  'gov', 'nic', 'india', 'bharat', 'sarkari', 'yojana', 'scheme', 'pmkisan', 'kisan', 'pmay', 'awas', 'svanidhi',
  'mudra', 'ayushman', 'pmjay', 'ujjwala', 'eshram', 'shram', 'aadhaar', 'aadhar', 'uidai', 'digilocker', 'scholarship',
  'pension', 'ration', 'subsidy', 'loan', 'yojna', 'modi', 'pm-', 'cm-',
];

const URGENCY = /\b(urgent|immediately|last (chance|date|day)|today only|hurry|expire[sd]?|within \d+ (hours?|minutes?)|limited (time|seats)|act now|final notice)\b|तुरंत|आज ही|जल्दी|आख़िरी मौका|अंतिम तिथि|ਤੁਰੰਤ|ਅੱਜ ਹੀ|உடனே|இன்றே|ತಕ್ಷಣ|ಇಂದೇ|এখনই|আজই|लगेच|आजच|వెంటనే|ఈరోజే|તરત|આજે જ/iu;
const FEE = /\b(processing|registration|activation|service|file)\s*(fee|charge)s?\b|\b(pay|deposit|send)\s*(rs\.?|₹|inr)?\s*\d+|₹\s?\d+\s*(fee|charge)|\bupi\b|फ़ीस|फीस|शुल्क|ਫ਼ੀਸ|ਫੀਸ|கட்டணம்|ಶುಲ್ಕ|ফি\b|ఫీజు|ફી\b/iu;
const BAIT = /\b(congratulations|you (have )?won|lottery|lucky draw|free (loan|laptop|mobile|recharge|money|scooty)|kyc (update|expire|suspend)|account (blocked|suspended)|claim (your|now))\b|बधाई|फ्री|मुफ़्त लोन|इनाम|लॉटरी|ਵਧਾਈ|ਮੁਫ਼ਤ|வாழ்த்துக்கள்|இலவச|ಅಭಿನಂದನೆ|ಉಚಿತ|অভিনন্দন|ফ্রি|अभिनंदन|मोफत|అభినందనలు|ఉచిత|અભિનંદન|મફત/iu;

const REASONS: Record<string, { en: string; hi: string }> = {
  OFFICIAL: {
    en: 'The address "{host}" ends in an official government domain and uses a secure connection.',
    hi: 'पता "{host}" सरकारी डोमेन पर ख़त्म होता है और सुरक्षित कनेक्शन इस्तेमाल करता है।',
  },
  NOT_WHITELISTED: {
    en: 'The address "{host}" does not end in .gov.in or .nic.in, so it is not a government website.',
    hi: 'पता "{host}" .gov.in या .nic.in पर ख़त्म नहीं होता, इसलिए यह सरकारी वेबसाइट नहीं है।',
  },
  NOT_HTTPS: {
    en: 'The link does not use a secure connection (https). Official scheme websites always do.',
    hi: 'यह लिंक सुरक्षित कनेक्शन (https) इस्तेमाल नहीं करता। असली सरकारी वेबसाइटें हमेशा करती हैं।',
  },
  USERINFO: {
    en: 'The link hides its real destination after an "@" sign. The part before "@" is only a disguise.',
    hi: 'यह लिंक "@" के बाद अपना असली पता छिपाता है। "@" से पहले का हिस्सा सिर्फ़ धोखा है।',
  },
  IP_ADDRESS: {
    en: 'The link points to a number address instead of a named website. Government sites do not do this.',
    hi: 'यह लिंक नाम वाली वेबसाइट की जगह नंबर वाले पते पर जाता है। सरकारी साइटें ऐसा नहीं करतीं।',
  },
  PUNYCODE: {
    en: 'The address uses look-alike letters to imitate a real website.',
    hi: 'यह पता असली वेबसाइट की नक़ल करने के लिए मिलते-जुलते अक्षर इस्तेमाल करता है।',
  },
  NON_ASCII: {
    en: 'The address uses look-alike letters to imitate a real website.',
    hi: 'यह पता असली वेबसाइट की नक़ल करने के लिए मिलते-जुलते अक्षर इस्तेमाल करता है।',
  },
  ODD_PORT: {
    en: 'The link uses an unusual port number, which official websites do not use.',
    hi: 'यह लिंक अजीब पोर्ट नंबर इस्तेमाल करता है, जो सरकारी वेबसाइटें नहीं करतीं।',
  },
  CONTROL_CHARS: {
    en: 'The link contains hidden or unusual characters meant to confuse.',
    hi: 'इस लिंक में भ्रम पैदा करने वाले छिपे या अजीब अक्षर हैं।',
  },
  UNPARSEABLE: { en: 'This does not look like a valid web address.', hi: 'यह सही वेब पता नहीं लगता।' },
  SHORTENER: {
    en: 'This is a shortened link that hides where it really goes. Government departments share full .gov.in addresses.',
    hi: 'यह छोटा किया हुआ लिंक है जो छिपाता है कि असल में कहाँ जाता है। सरकारी विभाग पूरा .gov.in पता देते हैं।',
  },
  LOOKALIKE: {
    en: 'The name is made to look like a government scheme, but it is a private website.',
    hi: 'नाम सरकारी योजना जैसा बनाया गया है, लेकिन यह निजी वेबसाइट है।',
  },
  FEE_REQUEST: {
    en: 'The message asks for a fee. Real government schemes never charge money to apply.',
    hi: 'संदेश में फ़ीस माँगी गई है। असली सरकारी योजनाएँ आवेदन के लिए कभी पैसे नहीं लेतीं।',
  },
  URGENCY: {
    en: 'The message pushes you to act fast. Scams use hurry so you do not stop to check.',
    hi: 'संदेश आपको जल्दी करने को कहता है। ठग जल्दबाज़ी कराते हैं ताकि आप जाँच न करें।',
  },
  BAIT: {
    en: 'The message promises a prize or free money. That is a common scam pattern.',
    hi: 'संदेश इनाम या मुफ़्त पैसे का वादा करता है। यह ठगी का आम तरीका है।',
  },
  NO_URL: { en: 'I could not find a web address in this text.', hi: 'मुझे इस संदेश में कोई वेब पता नहीं मिला।' },
};

function reason(code: string, host: string | null, lang: string): string {
  const t = REASONS[code] ?? REASONS.NOT_WHITELISTED!;
  return (lang === 'hi' ? t.hi : t.en).replace('{host}', host ?? '');
}

// Extra search words per scheme, beyond what the slug gives us.
const SCHEME_ALIASES: Record<string, string[]> = {
  'pm-kisan': ['pmkisan', 'kisan samman', 'kisan nidhi', 'किसान सम्मान', 'पीएम किसान'],
  pmfby: ['fasal', 'bima', 'crop insurance', 'फसल बीमा'],
  'kisan-credit-card': ['kcc', 'kisan credit'],
  'ab-pmjay': ['ayushman', 'pmjay', 'आयुष्मान'],
  'pm-svanidhi': ['svanidhi', 'swanidhi', 'street vendor', 'स्वनिधि', 'रेहड़ी'],
  'pm-mudra-yojana': ['mudra', 'मुद्रा'],
  'pm-ujjwala-yojana': ['ujjwala', 'ujjawala', 'pmuy', 'उज्ज्वला', 'free gas'],
  'pm-awas-yojana': ['awas', 'pmay', 'आवास', 'housing'],
  'e-shram': ['eshram', 'e-shram', 'shram card', 'श्रम'],
  'pm-vishwakarma': ['vishwakarma', 'विश्वकर्मा'],
  'atal-pension-yojana': ['atal pension', 'apy'],
  'central-sector-scholarship': ['scholarship', 'nsp', 'छात्रवृत्ति'],
  'sukanya-samriddhi-yojana': ['sukanya', 'सुकन्या'],
  mgnrega: ['nrega', 'mgnrega', 'मनरेगा', 'job card'],
  pmmvy: ['matru vandana', 'pmmvy'],
  'stand-up-india': ['standup', 'stand-up'],
};

export function guessScheme(haystack: string, schemes: Scheme[]): Scheme | undefined {
  const text = haystack.toLowerCase();
  let best: { scheme: Scheme; score: number } | undefined;
  for (const s of schemes) {
    const words = [
      ...(SCHEME_ALIASES[s.slug] ?? []),
      ...s.slug.split('-').filter((w) => w.length > 3 && !['yojana', 'scheme', 'delhi', 'pension', 'india'].includes(w)),
    ];
    const score = words.filter((w) => text.includes(w.toLowerCase())).length;
    if (score > 0 && (!best || score > best.score)) best = { scheme: s, score };
  }
  return best?.scheme;
}

function registrable(host: string): string {
  return host.split('.').slice(-2).join('.');
}

export function checkLink(input: string, schemes: Scheme[], lang = 'en'): LinkCheckResult {
  const urls = extractUrls(input);
  const first = urls[0];
  if (!first) {
    // Not URL-shaped at all: try it as typed so the parser can still say why it is wrong.
    const direct = checkUrl(input.trim());
    if (direct.code === 'UNPARSEABLE' || direct.code === 'CONTROL_CHARS') {
      return { url: input.trim().slice(0, 200), verdict: 'NOT_OFFICIAL', host: null, reasons: [reason('NO_URL', null, lang)], reasonCodes: ['NO_URL'] };
    }
  }
  const raw = first?.raw ?? input.trim();
  // A bare domain is judged on its host; an explicit http:// link is judged as written.
  const wl = checkUrl(first?.normalised ?? raw);
  const host = wl.host;
  const context = input.replace(raw, ' ');

  if (wl.official) {
    return { url: raw, verdict: 'OFFICIAL', host, reasons: [reason('OFFICIAL', host, lang)], reasonCodes: ['OFFICIAL'] };
  }

  const codes: string[] = [wl.code satisfies WhitelistCode];
  const hostLower = (host ?? raw).toLowerCase();
  if (host && (SHORTENERS.has(hostLower) || SHORTENERS.has(registrable(hostLower)))) codes.push('SHORTENER');
  // A genuine government host reached over http is insecure, but it is not an impersonation.
  const genuineHost = host !== null && hostAllowed(host);
  if (!genuineHost && LOOKALIKE_TOKENS.some((t) => hostLower.includes(t))) codes.push('LOOKALIKE');
  if (FEE.test(context)) codes.push('FEE_REQUEST');
  if (URGENCY.test(context)) codes.push('URGENCY');
  if (BAIT.test(context)) codes.push('BAIT');

  const hardTricks: string[] = ['USERINFO', 'PUNYCODE', 'NON_ASCII', 'IP_ADDRESS', 'CONTROL_CHARS'];
  const redFlags = codes.filter((c) => c !== 'NOT_WHITELISTED' && c !== 'NOT_HTTPS' && c !== 'ODD_PORT' && c !== 'UNPARSEABLE');
  const suspicious = redFlags.length > 0 || hardTricks.includes(wl.code);

  const scheme = guessScheme(`${hostLower} ${raw} ${context}`, schemes);
  const official = scheme?.officialLinks.find((l) => checkUrl(l.url).official);

  return {
    url: raw,
    verdict: suspicious ? 'SUSPICIOUS' : 'NOT_OFFICIAL',
    host,
    reasons: codes.map((c) => reason(c, host, lang)),
    reasonCodes: codes,
    ...(scheme && official ? { suggestedOfficialLink: { label: scheme.name.en, url: official.url, schemeSlug: scheme.slug } } : {}),
  };
}
