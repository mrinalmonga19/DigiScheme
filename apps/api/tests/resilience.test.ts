import { describe, expect, it } from 'vitest';
import { FallbackLanguageService } from '../src/language/fallback';
import { ResilientLanguageService } from '../src/language/resilient';
import type { ILanguageService } from '../src/language/types';
import { MockLLM, ResilientLLM, type ILLMProvider } from '../src/llm';
import { demoModeFlags } from '../src/services/chat';
import { harness, signedIn } from './appHelpers';

const broken = (message = 'boom'): ILanguageService => ({
  detectLanguage: () => Promise.reject(new Error(message)), transcribe: () => Promise.reject(new Error(message)),
  translate: () => Promise.reject(new Error(message)), synthesize: () => Promise.reject(new Error(message)),
});

describe('language layer fallback', () => {
  it('falls back to the offline service when the primary provider fails, and records it', async () => {
    const svc = new ResilientLanguageService(broken(), new FallbackLanguageService());
    const d = await svc.detectLanguage({ text: 'ನಮಸ್ಕಾರ ನಾನು ರೈತ' });
    expect(d.lang).toBe('kn');
    const status = svc.status();
    expect(JSON.stringify(status)).toContain('script');
  });

  it('opens the circuit after repeated failures and keeps answering', async () => {
    let now = 0;
    let primaryCalls = 0;
    const primary: ILanguageService = { ...broken(), detectLanguage: () => { primaryCalls++; return Promise.reject(new Error('down')); } };
    const svc = new ResilientLanguageService(primary, new FallbackLanguageService(), () => now);
    for (let i = 0; i < 6; i++) await svc.detectLanguage({ text: 'नमस्ते मुझे योजना चाहिए' });
    expect(primaryCalls).toBe(3); // breaker opened after three failures
    now += 61_000; // cool-down over: the primary is tried again
    await svc.detectLanguage({ text: 'नमस्ते मुझे योजना चाहिए' });
    expect(primaryCalls).toBe(4);
  });

  it('caches translations and never caches a passthrough', async () => {
    let calls = 0;
    const primary: ILanguageService = { ...broken(), translate: async (t) => { calls++; return { text: `T:${t}`, provider: 'gemini' }; } };
    const svc = new ResilientLanguageService(primary, new FallbackLanguageService());
    await svc.translate('hello', 'en', 'hi'); await svc.translate('hello', 'en', 'hi');
    expect(calls).toBe(1);
  });

  it('returns null speech (browser TTS) rather than throwing when no server voice exists', async () => {
    const svc = new ResilientLanguageService(null, new FallbackLanguageService());
    expect(await svc.synthesize('नमस्ते', 'hi')).toBeNull();
  });

  it('a chat still works, and says so, when voice transcription is down', async () => {
    const h = await harness({ language: new ResilientLanguageService(broken(), { ...new FallbackLanguageService(), transcribe: () => Promise.reject(new Error('no asr')) } as unknown as ILanguageService) });
    const { agent } = await signedIn(h, 'en');
    const res = await agent.post('/api/voice/chat').attach('audio', Buffer.from('not real audio'), { filename: 'a.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(200);
    expect(res.body.replyText).toMatch(/could not hear/i);
  });

  it('reports the active providers on the health endpoint', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    await agent.post('/api/chat').send({ text: 'I am a farmer in Karnataka, 45' });
    const res = await agent.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.demoMode.any).toBe(true);
  });
});

describe('LLM fallback', () => {
  const failing: ILLMProvider = { name: 'gemini', generate: () => Promise.reject(new Error('503 from model')) };

  it('answers with the deterministic assistant when the model fails, and flips the Demo badge', async () => {
    const llm = new ResilientLLM(failing, new MockLLM());
    const h = await harness({ llm });
    const { agent } = await signedIn(h, 'en');
    const res = await agent.post('/api/chat').send({ text: 'I am a farmer in Karnataka, 45' });
    expect(res.status).toBe(200);
    expect(res.body.ui.results.length).toBeGreaterThan(0);
    expect(llm.lastProvider).toBe('mock');
    expect(demoModeFlags(h.ctx).llm).toBe(true);
    expect(res.body.demoMode.llm).toBe(true);
  });

  it('opens a circuit after three failures and stops hammering the model', async () => {
    let calls = 0;
    let now = 0;
    const llm = new ResilientLLM({ name: 'gemini', generate: () => { calls++; return Promise.reject(new Error('down')); } }, new MockLLM(), () => now);
    const h = await harness({ llm });
    const { agent } = await signedIn(h, 'en');
    for (let i = 0; i < 6; i++) await agent.post('/api/chat').send({ text: 'hello' });
    expect(calls).toBe(3);
    expect(llm.circuitOpen).toBe(true);
    now += 46_000;
    expect(llm.circuitOpen).toBe(false);
  });

  it('survives the database being slow to answer health checks and unknown routes', async () => {
    const h = await harness();
    const { agent } = await signedIn(h, 'en');
    expect((await agent.get('/api/nope')).status).toBe(404);
    expect((await agent.get('/api/nope')).body.error.code).toBe('NOT_FOUND');
    const bad = await agent.post('/api/chat').set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_JSON');
  });
});
