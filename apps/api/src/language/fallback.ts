/**
 * Fallback language provider (spec 10.2): Gemini for translation, detection and (when it can
 * hear it) transcription; Unicode-script detection when Gemini is unavailable; no server TTS, so the
 * PWA uses the browser's Web Speech API. With no keys at all it still works: detection by script,
 * translation passes text through unchanged and says so.
 */
import { detectByScript, languageInfo } from '@digischeme/shared';
import { geminiClient, withTimeout } from '../llm/geminiClient';
import { env } from '../config/env';
import { UnsupportedError, type Detected, type ILanguageService, type Speech, type Transcript, type Translated } from './types';

/** Test and demo audio: a "voice note" whose bytes are MOCKASR:<utf8 transcript>. */
export const MOCK_ASR_PREFIX = 'MOCKASR:';
export const mockAudio = (transcript: string): Buffer => Buffer.from(MOCK_ASR_PREFIX + transcript, 'utf8');

const GEMINI_TIMEOUT_MS = 9000;

export class FallbackLanguageService implements ILanguageService {
  async detectLanguage(input: { text?: string }): Promise<Detected> {
    if (!input.text) throw new UnsupportedError('Cannot detect the language of audio without a speech service');
    const r = detectByScript(input.text);
    return { lang: r.lang, confidence: r.confidence, provider: 'script' };
  }

  async transcribe(audio: Buffer, lang: string, mime = 'audio/ogg'): Promise<Transcript> {
    const head = audio.subarray(0, MOCK_ASR_PREFIX.length).toString('utf8');
    if (head === MOCK_ASR_PREFIX) {
      const text = audio.subarray(MOCK_ASR_PREFIX.length).toString('utf8');
      return { text, lang: detectByScript(text).lang === 'en' ? lang : detectByScript(text).lang, provider: 'mock' };
    }
    const ai = geminiClient();
    if (!ai) throw new UnsupportedError('No speech-to-text available: use the browser microphone fallback');
    const res = await withTimeout(
      ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mime.split(';')[0] ?? 'audio/ogg', data: audio.toString('base64') } },
              { text: `Transcribe this ${languageInfo(lang).english} speech exactly, in its original script. Reply with the transcript only.` },
            ],
          },
        ],
        config: { temperature: 0 },
      }),
      GEMINI_TIMEOUT_MS,
      'gemini-asr',
    );
    const text = res.text?.trim();
    if (!text) throw new Error('Gemini returned no transcript');
    return { text, lang, provider: 'gemini' };
  }

  async translate(text: string, from: string, to: string): Promise<Translated> {
    if (from === to || !text.trim()) return { text, provider: 'passthrough' };
    const ai = geminiClient();
    if (!ai) return { text, provider: 'passthrough' };
    const res = await withTimeout(
      ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: `Translate from ${languageInfo(from).english} to ${languageInfo(to).english}. Keep numbers, rupee amounts, scheme names and any URL unchanged. Use simple words. Reply with the translation only.\n\n${text}`,
        config: { temperature: 0.1 },
      }),
      GEMINI_TIMEOUT_MS,
      'gemini-translate',
    );
    const out = res.text?.trim();
    if (!out) throw new Error('Gemini returned no translation');
    return { text: out, provider: 'gemini' };
  }

  async synthesize(): Promise<Speech | null> {
    return null; // The browser speaks (ttsFallback: 'browser').
  }
}
