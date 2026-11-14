/**
 * Gemini provider: function calling with temperature ~0.3 (spec 9.1). Tool arguments are validated by zod
 * in the orchestrator, never trusted here. Timeouts are enforced so a slow model cannot stall a chat.
 */
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { env } from '../config/env';
import { geminiClient, withTimeout } from './geminiClient';
import type { ILLMProvider, LLMRequest, LLMResponse, LLMTurn } from './types';

const CALL_TIMEOUT_MS = 12_000;

function toContents(turns: LLMTurn[]): Content[] {
  return turns.map((t): Content => {
    if (t.role === 'user') return { role: 'user', parts: [{ text: t.text }] };
    if (t.role === 'model') {
      const parts: Part[] = [];
      if (t.text) parts.push({ text: t.text });
      for (const c of t.calls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
      return { role: 'model', parts };
    }
    return {
      role: 'user',
      parts: t.results.map((r) => ({
        functionResponse: { name: r.name, response: r.ok ? { output: r.result } : { error: r.error, code: r.code } },
      })),
    };
  });
}

export class GeminiLLM implements ILLMProvider {
  readonly name = 'gemini' as const;

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const ai = geminiClient();
    if (!ai) throw new Error('GEMINI_API_KEY is not set');
    const decls: FunctionDeclaration[] = req.tools.map((t) => ({
      name: t.name, description: t.description, parametersJsonSchema: t.parameters,
    }));
    const res = await withTimeout(
      ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: toContents(req.turns),
        config: {
          systemInstruction: req.system,
          temperature: req.temperature,
          tools: [{ functionDeclarations: decls }],
          httpOptions: { timeout: CALL_TIMEOUT_MS },
        },
      }),
      CALL_TIMEOUT_MS + 1000,
      'gemini',
    );
    const calls = (res.functionCalls ?? []).map((c) => ({ name: c.name ?? '', args: (c.args ?? {}) as Record<string, unknown> }));
    return { text: (calls.length ? '' : res.text ?? '').trim(), calls };
  }
}
