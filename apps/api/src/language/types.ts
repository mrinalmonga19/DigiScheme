/**
 * Language layer contract (spec 10.1). Everything the app needs from speech and translation sits
 * behind ILanguageService, so Bhashini, Gemini, the browser and an offline stub are interchangeable.
 */
export type ProviderName = 'bhashini' | 'gemini' | 'script' | 'passthrough' | 'cache' | 'mock';

export interface Detected { lang: string; confidence: number; provider: ProviderName }
export interface Transcript { text: string; lang: string; provider: ProviderName }
export interface Translated { text: string; provider: ProviderName }
export interface Speech { audio: Buffer; mime: string; provider: ProviderName }

/** Thrown when a provider cannot do a task at all (as opposed to failing). The caller falls back. */
export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}

export interface ILanguageService {
  detectLanguage(input: { text?: string; audio?: Buffer; mime?: string }): Promise<Detected>;
  transcribe(audio: Buffer, lang: string, mime?: string): Promise<Transcript>;
  translate(text: string, from: string, to: string): Promise<Translated>;
  /** Returns null when the server has no TTS; the PWA then speaks with the browser's Web Speech API. */
  synthesize(text: string, lang: string, voiceGender?: 'female' | 'male'): Promise<Speech | null>;
}

export interface ProviderEvent {
  at: string;
  op: 'detect' | 'transcribe' | 'translate' | 'synthesize';
  lang: string;
  provider: ProviderName | 'none';
  ok: boolean;
  fellBack: boolean;
  ms: number;
  error?: string;
}
