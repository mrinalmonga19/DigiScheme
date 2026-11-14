/**
 * PII scrubber. Used on inbound text before it is stored or sent to the LLM, and on outbound text.
 * We never want an Aadhaar number, OTP, card or account number to persist anywhere.
 */
export interface ScrubResult {
  text: string;
  found: Array<'aadhaar' | 'long_number' | 'pan' | 'phone' | 'otp'>;
}

const MASK = '[number hidden]';
// 12 digits in 4-4-4 groups, the way Aadhaar is usually written.
const AADHAAR = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
// Card and account numbers: any run of 9+ digits, allowing spaces or hyphens between digit groups.
const LONG_NUMBER = /(?<!\d)(?:\d[\s-]?){8,}\d(?!\d)/g;
const CARD_LIKE = /(?<!\d)(?:\d[\s-]?){12,18}\d(?!\d)/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
// "OTP 123456", "ओटीपी 4821", "code is 123456"
const OTP = /((?:otp|o\.t\.p|ओटीपी|ਓਟੀਪੀ|pin|पिन|cvv|password|पासवर्ड)\D{0,12})(\d{3,8})/giu;
const TOLL_FREE = /^(?:1800|1860)/;

export function scrubPii(text: string): ScrubResult {
  const found = new Set<ScrubResult['found'][number]>();
  let out = text.replace(OTP, (_m, lead: string) => {
    found.add('otp');
    return `${lead}${MASK}`;
  });
  // Card and account numbers longer than an Aadhaar (13+ digits) go first, so a 16-digit card is not half-masked as an "Aadhaar".
  out = out.replace(CARD_LIKE, (m) => {
    if (m.replace(/\D/g, '').length < 13) return m;
    found.add('long_number');
    return MASK;
  });
  out = out.replace(AADHAAR, (m) => {
    if (TOLL_FREE.test(m.replace(/\D/g, ''))) return m;
    found.add('aadhaar');
    return MASK;
  });
  out = out.replace(PHONE, () => {
    found.add('phone');
    return MASK;
  });
  out = out.replace(LONG_NUMBER, (m) => {
    if (TOLL_FREE.test(m.replace(/\D/g, ''))) return m; // helplines are safe and useful
    found.add('long_number');
    return MASK;
  });
  out = out.replace(PAN, () => {
    found.add('pan');
    return '[ID hidden]';
  });
  return { text: out, found: [...found] };
}

/** Did the user volunteer something they should never share? */
export function containsSensitiveIdentifier(text: string): boolean {
  const f = scrubPii(text).found;
  return f.includes('aadhaar') || f.includes('otp') || f.includes('long_number') || f.includes('pan');
}
