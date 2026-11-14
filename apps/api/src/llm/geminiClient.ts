import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

let client: GoogleGenAI | null = null;

/** One shared Gemini client for the LLM provider and the language fallback. Null when no key is set. */
export function geminiClient(): GoogleGenAI | null {
  if (!env.GEMINI_API_KEY) return null;
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export const hasGemini = (): boolean => Boolean(env.GEMINI_API_KEY);

/** Reject if a promise takes longer than `ms`. The underlying call is abandoned, not cancelled. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
