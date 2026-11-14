import { env } from '../config/env';
import { logger } from '../config/logger';
import { BhashiniService } from './bhashini';
import { FallbackLanguageService } from './fallback';
import { ResilientLanguageService } from './resilient';

export * from './types';
export { ResilientLanguageService, FallbackLanguageService, BhashiniService };
export { mockAudio, MOCK_ASR_PREFIX } from './fallback';

/** BHASHINI_MODE=live uses Bhashini first; anything else (or missing credentials) uses the fallback alone. */
export function createLanguageService(): ResilientLanguageService {
  let primary: BhashiniService | null = null;
  if (env.BHASHINI_MODE === 'live') {
    try {
      primary = new BhashiniService();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Bhashini live mode unavailable; using fallback providers');
    }
  }
  return new ResilientLanguageService(primary, new FallbackLanguageService());
}
