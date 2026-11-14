import { describe, expect, it } from 'vitest';
import { checkLink, checkUrl, containsSensitiveIdentifier, extractUrls, guardOutput, isOfficialUrl, scrubPii } from '../src/trust/index';
import { loadSchemes } from '../src/seed/loader';

const schemes = loadSchemes();

describe('whitelist: official addresses', () => {
  it.each([
    'https://pmkisan.gov.in/',
    'https://pmkisan.gov.in/RegistrationFormNew.aspx?x=1#top',
    'https://www.myscheme.gov.in/schemes/apy',
    'https://scholarships.gov.in',
    'https://pmsvanidhi.mohua.gov.in/',
    'https://edistrict.delhigovt.nic.in/',
    'https://nsap.nic.in/',
    'https://kmut.tn.gov.in/',
    'https://PMKISAN.GOV.IN/',
    'https://pmkisan.gov.in./',
    'https://www.mudra.org.in/',
    'https://www.standupmitra.in/Home',
  ])('accepts %s', (url) => {
    expect(checkUrl(url)).toMatchObject({ official: true, code: 'OK' });
  });
});

describe('whitelist: evasion attempts', () => {
  it.each([
    ['suffix moved into a subdomain', 'https://pmkisan.gov.in.evil.com/', 'NOT_WHITELISTED'],
    ['hyphenated lookalike', 'https://gov-in.pmkisan.com/', 'NOT_WHITELISTED'],
    ['suffix without a label boundary', 'https://evilgov.in/', 'NOT_WHITELISTED'],
    ['suffix glued to another word', 'https://pmkisangov.in/', 'NOT_WHITELISTED'],
    ['bare public suffix', 'https://gov.in/', 'NOT_WHITELISTED'],
    ['official name in the path', 'https://evil.com/pmkisan.gov.in/', 'NOT_WHITELISTED'],
    ['official name in the query', 'https://evil.com/?next=https://pmkisan.gov.in', 'NOT_WHITELISTED'],
    ['official name in the fragment', 'https://evil.com/#pmkisan.gov.in', 'NOT_WHITELISTED'],
    ['wrong TLD', 'https://pmkisan.gov.com/', 'NOT_WHITELISTED'],
    ['.co.in lookalike', 'https://pmkisan-gov.co.in/', 'NOT_WHITELISTED'],
    ['allowlisted name as a subdomain of another site', 'https://mudra.org.in.loans-fast.com/', 'NOT_WHITELISTED'],
    ['allowlisted name with a prefix glued on', 'https://fakemudra.org.in/', 'NOT_WHITELISTED'],
    ['userinfo trick', 'https://pmkisan.gov.in@evil.com/', 'USERINFO'],
    ['userinfo with password', 'https://pmkisan.gov.in:secret@evil.com/', 'USERINFO'],
    ['userinfo on an official host is still refused', 'https://user@pmkisan.gov.in/', 'USERINFO'],
    ['plain http', 'http://pmkisan.gov.in/', 'NOT_HTTPS'],
    ['ftp scheme', 'ftp://pmkisan.gov.in/', 'NOT_HTTPS'],
    ['javascript scheme', 'javascript:alert(1)//pmkisan.gov.in', 'NOT_HTTPS'],
    ['data scheme', 'data:text/html,pmkisan.gov.in', 'NOT_HTTPS'],
    ['punycode label', 'https://xn--pmkisn-3ya.gov.in/', 'PUNYCODE'],
    ['IDN homograph (Cyrillic a)', 'https://pmkisаn.gov.in/', 'NON_ASCII'],
    ['IDN homograph in the suffix (Cyrillic o)', 'https://pmkisan.gоv.in/', 'NON_ASCII'],
    ['IPv4 address', 'https://192.168.1.10/pmkisan.gov.in', 'IP_ADDRESS'],
    ['IPv6 address', 'https://[2001:db8::1]/', 'IP_ADDRESS'],
    ['non-default port', 'https://pmkisan.gov.in:8443/', 'ODD_PORT'],
    ['backslash confusion', 'https://pmkisan.gov.in\\@evil.com/', 'CONTROL_CHARS'],
    ['embedded whitespace', 'https://pmkisan.gov.in /login', 'CONTROL_CHARS'],
    ['embedded newline', 'https://evil.com/\nhttps://pmkisan.gov.in', 'CONTROL_CHARS'],
    ['not a URL', 'pmkisan dot gov dot in', 'CONTROL_CHARS'],
    ['empty string', '', 'CONTROL_CHARS'],
    ['scheme-relative', '//pmkisan.gov.in/', 'UNPARSEABLE'],
    ['bare domain without scheme', 'pmkisan.gov.in', 'UNPARSEABLE'],
  ])('rejects %s', (_name, url, code) => {
    const res = checkUrl(url);
    expect(res.official).toBe(false);
    expect(res.code).toBe(code);
    expect(isOfficialUrl(url)).toBe(false);
  });

  it('every link in the seed data is official', () => {
    for (const s of schemes) for (const l of s.officialLinks) expect(isOfficialUrl(l.url), `${s.slug} ${l.url}`).toBe(true);
  });
});

describe('url extraction', () => {
  it('finds scheme URLs and bare domains, and trims trailing punctuation', () => {
    const found = extractUrls('Apply at http://pm-loan.com/apply. Or visit pmkisan.gov.in, or bit.ly/abc!');
    expect(found.map((f) => f.raw)).toEqual(['http://pm-loan.com/apply', 'pmkisan.gov.in', 'bit.ly/abc']);
    expect(found[1]).toMatchObject({ bare: true, normalised: 'https://pmkisan.gov.in' });
  });
  it('does not mistake ordinary words for domains', () => {
    expect(extractUrls('I study B.Tech and pay Rs.20 e.g. yearly. Mr.Rao said ok.')).toEqual([]);
  });
});

describe('link checker', () => {
  it('OFFICIAL for a real scheme site', () => {
    const r = checkLink('https://pmkisan.gov.in/', schemes);
    expect(r.verdict).toBe('OFFICIAL');
    expect(r.reasons[0]).toContain('pmkisan.gov.in');
  });
  it('NOT_OFFICIAL for an ordinary private site with no red flags', () => {
    const r = checkLink('https://example.org/news/article', schemes);
    expect(r.verdict).toBe('NOT_OFFICIAL');
    expect(r.reasons[0]).toContain('does not end in .gov.in');
  });
  it('SUSPICIOUS for the "free loan" scam message, and points to the real PM SVANidhi site', () => {
    const msg = 'बधाई हो! आपको 50,000 का फ्री लोन मिला है। आज ही 499 रुपये प्रोसेसिंग फ़ीस देकर यहाँ आवेदन करें http://pm-svanidhi-loan.com/apply';
    const r = checkLink(msg, schemes, 'hi');
    expect(r.verdict).toBe('SUSPICIOUS');
    expect(r.reasonCodes).toEqual(expect.arrayContaining(['NOT_HTTPS', 'LOOKALIKE', 'FEE_REQUEST', 'URGENCY', 'BAIT']));
    expect(r.suggestedOfficialLink).toMatchObject({ schemeSlug: 'pm-svanidhi', url: 'https://pmsvanidhi.mohua.gov.in/' });
    expect(r.reasons.join(' ')).toContain('फ़ीस');
  });
  it('SUSPICIOUS for shortened links', () => {
    const r = checkLink('PM Kisan new list: https://bit.ly/3xYzAbc', schemes);
    expect(r.verdict).toBe('SUSPICIOUS');
    expect(r.reasonCodes).toContain('SHORTENER');
    expect(r.suggestedOfficialLink?.schemeSlug).toBe('pm-kisan');
  });
  it('SUSPICIOUS for lookalike domains', () => {
    for (const u of ['https://pmkisan.gov.in.evil.com/', 'https://gov-in.pmkisan.com/', 'https://pmkisan.gov.in@evil.com/', 'https://pmkisаn.gov.in/']) {
      expect(checkLink(u, schemes).verdict, u).toBe('SUSPICIOUS');
    }
  });
  it('judges bare domains on their host', () => {
    expect(checkLink('scholarships.gov.in', schemes).verdict).toBe('OFFICIAL');
    expect(checkLink('free-scholarship-india.com', schemes).verdict).toBe('SUSPICIOUS');
  });
  it('an http link to a government host is not called official', () => {
    const r = checkLink('http://pmkisan.gov.in/', schemes);
    expect(r.verdict).toBe('NOT_OFFICIAL');
    expect(r.reasonCodes).toEqual(['NOT_HTTPS']);
  });
  it('handles text with no link', () => {
    expect(checkLink('hello there', schemes)).toMatchObject({ verdict: 'NOT_OFFICIAL', reasonCodes: ['NO_URL'] });
  });
});

describe('output guard', () => {
  it('keeps official links and removes everything else, in the user language', () => {
    const g = guardOutput('Apply at https://pmkisan.gov.in/ not at http://pm-kisan-apply.com/form or bit.ly/x.', 'hi');
    expect(g.text).toContain('https://pmkisan.gov.in/');
    expect(g.text).not.toContain('pm-kisan-apply.com');
    expect(g.text).not.toContain('bit.ly');
    expect(g.text).toContain('[लिंक हटाया गया');
    expect(g.removedLinks).toEqual(['http://pm-kisan-apply.com/form', 'bit.ly/x']);
  });
  it('removes lookalike links even when written without a scheme', () => {
    const g = guardOutput('Go to pmkisan.gov.in.evil.com now', 'en');
    expect(g.text).toBe('Go to [link removed: not an official government website] now');
  });
  it('masks identifiers', () => {
    const g = guardOutput('Your Aadhaar 1234 5678 9012 and account 123456789012345 are noted. Call 1800115526.', 'en');
    expect(g.text).not.toMatch(/1234 5678 9012|123456789012345/);
    expect(g.text).toContain('1800115526'); // toll-free helplines survive
    expect(g.piiMasked).toEqual(expect.arrayContaining(['aadhaar', 'long_number']));
  });
  it('strips promises the assistant must never make', () => {
    const g = guardOutput('You are guaranteed to get this benefit. I have submitted your application. PM-KISAN pays Rs 6,000 a year.', 'en');
    expect(g.text).not.toMatch(/guaranteed|submitted your application/i);
    expect(g.text).toContain('PM-KISAN pays Rs 6,000 a year.');
    expect(g.text).toContain('Common Service Centre');
    expect(g.bannedClaims).toEqual(expect.arrayContaining(['guarantee', 'auto_submitted']));
  });
  it('strips requests for secrets or fees', () => {
    expect(guardOutput('Please share your OTP here.', 'en').bannedClaims).toContain('asks_secret');
    expect(guardOutput('Pay Rs 200 to continue.', 'en').bannedClaims).toContain('asks_fee');
  });
  it('leaves clean text untouched, including amounts and years', () => {
    const text = 'PMSBY: ₹2,00,000 cover for ₹20 a year. Valid till 31 May 2027.';
    expect(guardOutput(text, 'en')).toMatchObject({ text, removedLinks: [], piiMasked: [], bannedClaims: [] });
  });
});

describe('PII scrubber', () => {
  it('masks Aadhaar in common formats', () => {
    for (const s of ['123456789012', '1234 5678 9012', '1234-5678-9012']) {
      expect(scrubPii(`my number is ${s} ok`).text).toBe('my number is [number hidden] ok');
    }
  });
  it('masks OTPs, PAN and phone numbers', () => {
    expect(scrubPii('OTP is 482913').text).toBe('OTP is [number hidden]');
    expect(scrubPii('मेरा ओटीपी 4821 है').text).toContain('[number hidden]');
    expect(scrubPii('PAN ABCDE1234F').text).toBe('PAN [ID hidden]');
    expect(scrubPii('call me on 9876543210').text).toBe('call me on [number hidden]');
    expect(scrubPii('+91 9876543210').found).toContain('phone');
  });
  it('keeps ages, incomes and short numbers', () => {
    const text = 'I am 58, income 96,000 or 250000 a year, 2 hectares';
    expect(scrubPii(text)).toEqual({ text, found: [] });
  });
  it('flags sensitive identifiers the user should not share', () => {
    expect(containsSensitiveIdentifier('aadhaar 1234 5678 9012')).toBe(true);
    expect(containsSensitiveIdentifier('I am 31 years old')).toBe(false);
  });
});
