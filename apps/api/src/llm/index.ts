import { env } from '../config/env';
import { logger } from '../config/logger';
import { GeminiLLM } from './gemini';
import { MockLLM } from './mock';
import { ResilientLLM } from './resilient';
import type { ILLMProvider } from './types';

export * from './types';
export { MockLLM, GeminiLLM, ResilientLLM };

/** LLM_MODE=gemini needs GEMINI_API_KEY; otherwise (or on failure at runtime) the deterministic assistant answers. */
export function createLLM(): ResilientLLM {
  const mock = new MockLLM();
  if (env.LLM_MODE === 'gemini') {
    if (env.GEMINI_API_KEY) return new ResilientLLM(new GeminiLLM(), mock);
    logger.warn('LLM_MODE=gemini but GEMINI_API_KEY is missing; running the deterministic assistant');
  }
  return new ResilientLLM(mock, mock);
}

export const asProvider = (l: ILLMProvider): ILLMProvider => l;
