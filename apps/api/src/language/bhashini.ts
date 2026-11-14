/**
 * Bhashini (Dhruva / ULCA pipeline) adapter. Live mode only; needs BHASHINI_USER_ID,
 * BHASHINI_API_KEY and BHASHINI_PIPELINE_ID from https://bhashini.gov.in (register for credentials).
 *
 * The flow follows Bhashini's public two-step pipeline documentation:
 *   1. Config call: POST BHASHINI_CONFIG_URL with headers userID / ulcaApiKey and a pipelineId.
 *      It returns a serviceId per task+language and the inference endpoint + key to use.
 *   2. Compute call: POST the returned callbackUrl with the inference key, carrying the serviceId.
 *
 * TODO(before production): confirm payload shapes against the current Bhashini docs and your
 * pipeline's supported languages. Anything unexpected throws, and ResilientLanguageService then
 * falls back, so a changed response shape degrades the demo instead of breaking it.
 */
import { env } from '../config/env';
import { withTimeout } from '../llm/geminiClient';
import { UnsupportedError, type Detected, type ILanguageService, type Speech, type Transcript, type Translated } from './types';

const TIMEOUT_MS = 7000;
const CONFIG_TTL_MS = 6 * 60 * 60 * 1000;

interface PipelineConfig {
  callbackUrl: string;
  keyName: string;
  keyValue: string;
  /** serviceIds[task][source] or serviceIds[task][source>target] */
  services: Record<string, Record<string, string>>;
  fetchedAt: number;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class BhashiniService implements ILanguageService {
  private cfg: PipelineConfig | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) {
    if (!env.BHASHINI_USER_ID || !env.BHASHINI_API_KEY || !env.BHASHINI_PIPELINE_ID) {
      throw new Error('BHASHINI_MODE=live needs BHASHINI_USER_ID, BHASHINI_API_KEY and BHASHINI_PIPELINE_ID');
    }
  }

  private async post(url: string, headers: Record<string, string>, body: unknown): Promise<Json> {
    const res = await withTimeout(
      this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      TIMEOUT_MS + 500,
      'bhashini',
    );
    if (!res.ok) throw new Error(`Bhashini HTTP ${res.status}`);
    return (await res.json()) as Json;
  }

  async config(): Promise<PipelineConfig> {
    if (this.cfg && Date.now() - this.cfg.fetchedAt < CONFIG_TTL_MS) return this.cfg;
    const data = await this.post(
      env.BHASHINI_CONFIG_URL,
      { userID: env.BHASHINI_USER_ID!, ulcaApiKey: env.BHASHINI_API_KEY! },
      {
        pipelineTasks: [{ taskType: 'asr' }, { taskType: 'translation' }, { taskType: 'tts' }, { taskType: 'txt-lang-detection' }],
        pipelineRequestConfig: { pipelineId: env.BHASHINI_PIPELINE_ID },
      },
    );
    const endpoint = data.pipelineInferenceAPIEndPoint;
    if (!endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.value) throw new Error('Bhashini config: no inference endpoint');
    const services: PipelineConfig['services'] = {};
    for (const task of (data.pipelineResponseConfig ?? []) as Json[]) {
      const bucket = (services[task.taskType] ??= {});
      for (const c of (task.config ?? []) as Json[]) {
        const src = c.language?.sourceLanguage;
        const tgt = c.language?.targetLanguage;
        if (c.serviceId && src) bucket[tgt ? `${src}>${tgt}` : src] ??= c.serviceId;
      }
    }
    this.cfg = {
      callbackUrl: endpoint.callbackUrl,
      keyName: endpoint.inferenceApiKey.name ?? 'Authorization',
      keyValue: endpoint.inferenceApiKey.value,
      services,
      fetchedAt: Date.now(),
    };
    return this.cfg;
  }

  private async compute(task: Json, input: Json): Promise<Json> {
    const cfg = await this.config();
    return this.post(cfg.callbackUrl, { [cfg.keyName]: cfg.keyValue }, { pipelineTasks: [task], inputData: input });
  }

  private serviceId(cfg: PipelineConfig, task: string, key: string): string {
    const id = cfg.services[task]?.[key];
    if (!id) throw new UnsupportedError(`Bhashini has no ${task} service for ${key}`);
    return id;
  }

  async detectLanguage(input: { text?: string }): Promise<Detected> {
    if (!input.text) throw new UnsupportedError('Bhashini detection needs text');
    const cfg = await this.config();
    const serviceId = Object.values(cfg.services['txt-lang-detection'] ?? {})[0];
    if (!serviceId) throw new UnsupportedError('Bhashini has no language detection service');
    const out = await this.compute({ taskType: 'txt-lang-detection', config: { serviceId } }, { input: [{ source: input.text }] });
    const pred = out.pipelineResponse?.[0]?.output?.[0]?.langPrediction?.[0];
    if (!pred?.langCode) throw new Error('Bhashini detection: unexpected response');
    return { lang: String(pred.langCode), confidence: Number(pred.scriptCode ? 0.9 : 0.8), provider: 'bhashini' };
  }

  async transcribe(audio: Buffer, lang: string): Promise<Transcript> {
    const cfg = await this.config();
    const serviceId = this.serviceId(cfg, 'asr', lang);
    const out = await this.compute(
      { taskType: 'asr', config: { language: { sourceLanguage: lang }, serviceId, audioFormat: 'wav', samplingRate: 16000 } },
      { audio: [{ audioContent: audio.toString('base64') }] },
    );
    const text = out.pipelineResponse?.[0]?.output?.[0]?.source;
    if (typeof text !== 'string') throw new Error('Bhashini ASR: unexpected response');
    return { text, lang, provider: 'bhashini' };
  }

  async translate(text: string, from: string, to: string): Promise<Translated> {
    if (from === to) return { text, provider: 'bhashini' };
    const cfg = await this.config();
    const serviceId = this.serviceId(cfg, 'translation', `${from}>${to}`);
    const out = await this.compute(
      { taskType: 'translation', config: { language: { sourceLanguage: from, targetLanguage: to }, serviceId } },
      { input: [{ source: text }] },
    );
    const target = out.pipelineResponse?.[0]?.output?.[0]?.target;
    if (typeof target !== 'string') throw new Error('Bhashini translation: unexpected response');
    return { text: target, provider: 'bhashini' };
  }

  async synthesize(text: string, lang: string, voiceGender: 'female' | 'male' = 'female'): Promise<Speech | null> {
    const cfg = await this.config();
    const serviceId = this.serviceId(cfg, 'tts', lang);
    const out = await this.compute(
      { taskType: 'tts', config: { language: { sourceLanguage: lang }, serviceId, gender: voiceGender, samplingRate: 8000 } },
      { input: [{ source: text }] },
    );
    const b64 = out.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
    if (typeof b64 !== 'string') throw new Error('Bhashini TTS: unexpected response');
    return { audio: Buffer.from(b64, 'base64'), mime: 'audio/wav', provider: 'bhashini' };
  }
}
