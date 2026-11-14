/**
 * The service the rest of the app uses. It tries the primary provider (Bhashini, when live) and falls
 * back automatically on any error, timeout, rate limit or unsupported language. A circuit breaker
 * stops us hammering a provider that is down. Every call is logged with the provider that served it,
 * which the admin view displays (spec 10.2: "the demo must never fail because of one provider").
 */
import crypto from 'node:crypto';
import { logger } from '../config/logger';
import type {
  Detected, ILanguageService, ProviderEvent, ProviderName, Speech, Transcript, Translated,
} from './types';
import { UnsupportedError } from './types';

const BREAKER_FAILS = 3;
const BREAKER_COOL_MS = 60_000;
const LOG_SIZE = 200;
const CACHE_SIZE = 2000;

export class ResilientLanguageService implements ILanguageService {
  private fails = 0;
  private openUntil = 0;
  private readonly events: ProviderEvent[] = [];
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly primary: ILanguageService | null,
    private readonly fallback: ILanguageService,
    private readonly now: () => number = Date.now,
  ) {}

  private breakerOpen(): boolean {
    return this.now() < this.openUntil;
  }

  private record(e: Omit<ProviderEvent, 'at'>): void {
    this.events.push({ at: new Date(this.now()).toISOString(), ...e });
    if (this.events.length > LOG_SIZE) this.events.shift();
  }

  private async run<T extends { provider: ProviderName }>(
    op: ProviderEvent['op'],
    lang: string,
    call: (svc: ILanguageService) => Promise<T>,
  ): Promise<T> {
    const started = this.now();
    let fellBack = false;
    let lastError: string | undefined;
    if (this.primary && !this.breakerOpen()) {
      try {
        const out = await call(this.primary);
        this.fails = 0;
        this.record({ op, lang, provider: out.provider, ok: true, fellBack: false, ms: this.now() - started });
        return out;
      } catch (err) {
        fellBack = true;
        lastError = (err as Error).message;
        // "Unsupported" is not an outage; do not count it toward the breaker.
        if (!(err instanceof UnsupportedError) && ++this.fails >= BREAKER_FAILS) {
          this.openUntil = this.now() + BREAKER_COOL_MS;
          logger.warn({ provider: 'primary language service' }, 'Language provider circuit opened');
        }
      }
    } else if (this.primary) {
      fellBack = true;
      lastError = 'circuit open';
    }
    try {
      const out = await call(this.fallback);
      this.record({
        op, lang, provider: out.provider, ok: true, fellBack, ms: this.now() - started, ...(lastError ? { error: lastError } : {}),
      });
      return out;
    } catch (err) {
      this.record({ op, lang, provider: 'none', ok: false, fellBack, ms: this.now() - started, error: (err as Error).message });
      throw err;
    }
  }

  detectLanguage(input: { text?: string; audio?: Buffer; mime?: string }): Promise<Detected> {
    return this.run('detect', 'auto', (s) => s.detectLanguage(input));
  }

  transcribe(audio: Buffer, lang: string, mime?: string): Promise<Transcript> {
    return this.run('transcribe', lang, (s) => s.transcribe(audio, lang, mime));
  }

  async translate(text: string, from: string, to: string): Promise<Translated> {
    if (from === to) return { text, provider: 'passthrough' };
    const key = `${from}>${to}:${crypto.createHash('sha1').update(text).digest('hex')}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return { text: hit, provider: 'cache' };
    const out = await this.run('translate', `${from}>${to}`, (s) => s.translate(text, from, to));
    // Never cache a passthrough: it is "no translation", and a real provider may come back later.
    if (out.provider !== 'passthrough') {
      if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, out.text);
    }
    return out;
  }

  async synthesize(text: string, lang: string, gender?: 'female' | 'male'): Promise<Speech | null> {
    try {
      return await this.run('synthesize', lang, async (s) => {
        const out = await s.synthesize(text, lang, gender);
        // A null result (no server TTS) must flow through run() as "fall back"; model it as unsupported.
        if (!out) throw new UnsupportedError('no server TTS');
        return out;
      });
    } catch {
      return null; // PWA speaks with the browser
    }
  }

  status() {
    const byProvider: Record<string, { ok: number; failed: number }> = {};
    for (const e of this.events) {
      const k = e.provider;
      (byProvider[k] ??= { ok: 0, failed: 0 })[e.ok ? 'ok' : 'failed']++;
    }
    return {
      primaryConfigured: this.primary !== null,
      circuitOpen: this.breakerOpen(),
      consecutiveFailures: this.fails,
      byProvider,
      recent: this.events.slice(-50).reverse(),
    };
  }
}
