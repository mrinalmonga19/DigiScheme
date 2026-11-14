import { logger } from '../config/logger';
import type { ILLMProvider, LLMRequest, LLMResponse } from './types';

const BREAKER_FAILS = 3;
const BREAKER_COOL_MS = 45_000;

/**
 * Gemini first, deterministic mock when Gemini errors, times out or its circuit is open. A turn that
 * began on one provider stays on it only until it fails; the mock then finishes the turn from the same
 * conversation so the user always gets an answer in their language (spec 16 resilience).
 */
export class ResilientLLM implements ILLMProvider {
  readonly name: 'gemini' | 'mock';
  private fails = 0;
  private openUntil = 0;
  lastProvider: 'gemini' | 'mock';
  lastError: string | null = null;

  constructor(private readonly primary: ILLMProvider, private readonly fallback: ILLMProvider, private readonly now: () => number = Date.now) {
    this.name = primary.name;
    this.lastProvider = primary.name;
  }

  get circuitOpen(): boolean {
    return this.now() < this.openUntil;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    if (this.primary !== this.fallback && !this.circuitOpen) {
      try {
        const out = await this.primary.generate(req);
        this.fails = 0;
        this.lastProvider = this.primary.name;
        return out;
      } catch (err) {
        this.lastError = (err as Error).message;
        if (++this.fails >= BREAKER_FAILS) {
          this.openUntil = this.now() + BREAKER_COOL_MS;
          logger.warn('LLM circuit opened; using the deterministic assistant for a while');
        }
        logger.warn({ err: this.lastError }, 'LLM call failed; falling back');
      }
    }
    this.lastProvider = this.fallback.name;
    return this.fallback.generate(req);
  }
}
