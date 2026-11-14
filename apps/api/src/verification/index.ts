import { env } from '../config/env';
import { logger } from '../config/logger';
import { LiveVerificationProvider } from './live';
import { MockVerificationProvider } from './mock';
import type { IVerificationProvider } from './types';

export * from './types';
export { MockVerificationProvider, LiveVerificationProvider };

/** DIGILOCKER_MODE / AADHAAR_MODE select the mode. Live without credentials falls back to mock, loudly. */
export function createVerificationProvider(): IVerificationProvider {
  if (env.DIGILOCKER_MODE === 'live' || env.AADHAAR_MODE === 'live') {
    try {
      return new LiveVerificationProvider();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Live verification unavailable; running in MOCK mode');
    }
  }
  return new MockVerificationProvider();
}
