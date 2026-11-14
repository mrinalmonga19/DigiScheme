/**
 * Domain whitelist (spec 11.4). The only links DigiScheme will ever show are official ones.
 *
 * Rules:
 *  - parse with the WHATWG URL class, never with regexes or substring checks;
 *  - HTTPS only, no userinfo, no IP literals, no non-default ports, no punycode/IDN labels;
 *  - the hostname must END in an allowed suffix on a label boundary, or be on the explicit allowlist.
 */
import net from 'node:net';

/** Government-controlled second-level zones. */
export const ALLOWED_SUFFIXES = ['gov.in', 'nic.in'] as const;

/**
 * Official hosts that do not sit under .gov.in / .nic.in. Keep this list short and re-verify each
 * entry before every release (see docs/LIMITATIONS.md). Subdomains of these hosts are also allowed.
 */
export const EXPLICIT_ALLOWLIST = [
  'mudra.org.in', // Micro Units Development & Refinance Agency
  'standupmitra.in', // Stand-Up India portal (SIDBI)
  'jansamarth.in', // National portal for credit-linked government schemes
] as const;

export type WhitelistCode =
  | 'OK' | 'UNPARSEABLE' | 'NOT_HTTPS' | 'USERINFO' | 'IP_ADDRESS' | 'PUNYCODE' | 'NON_ASCII'
  | 'ODD_PORT' | 'CONTROL_CHARS' | 'NOT_WHITELISTED';

export interface WhitelistResult {
  official: boolean;
  code: WhitelistCode;
  host: string | null;
}

const fail = (code: WhitelistCode, host: string | null = null): WhitelistResult => ({ official: false, code, host });

function endsWithOnLabel(host: string, suffix: string): boolean {
  // "pmkisan.gov.in" ends with ".gov.in"; "evilgov.in" and bare "gov.in" do not qualify.
  return host.length > suffix.length + 1 && host.endsWith(`.${suffix}`);
}

/** Host-only check (no scheme, port or userinfo rules). */
export function hostAllowed(host: string): boolean {
  if (ALLOWED_SUFFIXES.some((s) => endsWithOnLabel(host, s))) return true;
  return EXPLICIT_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`));
}

export function checkUrl(raw: string): WhitelistResult {
  const input = raw.trim();
  // Backslashes, whitespace and control characters are classic parser-confusion tricks.
  // eslint-disable-next-line no-control-regex
  if (input.length === 0 || /[\s\\\u0000-\u001f\u007f]/.test(input)) return fail('CONTROL_CHARS');
  // eslint-disable-next-line no-control-regex
  const nonAscii = /[^\u0000-\u007f]/.test(input);

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail('UNPARSEABLE');
  }

  // URL lowercases the host and converts IDN to punycode for us.
  let host = url.hostname;
  if (host.endsWith('.')) host = host.slice(0, -1); // fully-qualified form of the same name
  if (url.protocol !== 'https:') return fail('NOT_HTTPS', host);
  if (url.username !== '' || url.password !== '' || input.split('/')[2]?.includes('@')) return fail('USERINFO', host);
  if (net.isIP(host.replace(/^\[|\]$/g, '')) !== 0) return fail('IP_ADDRESS', host);
  if (nonAscii && /[^\p{ASCII}]/u.test(decodeHost(input))) return fail('NON_ASCII', host);
  if (host.split('.').some((label) => label.startsWith('xn--'))) return fail('PUNYCODE', host);
  if (url.port !== '') return fail('ODD_PORT', host);
  if (!hostAllowed(host)) return fail('NOT_WHITELISTED', host);
  return { official: true, code: 'OK', host };
}

/** The authority part as typed, so a homograph in the host is caught even though URL normalises it. */
function decodeHost(input: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(input);
  return m?.[1] ?? '';
}

export const isOfficialUrl = (raw: string): boolean => checkUrl(raw).official;
