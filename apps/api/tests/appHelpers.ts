import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { createContext, type AppContext, type ContextOverrides } from '../src/context';
import { createMemoryStore } from '../src/db/memory';

export interface Harness { ctx: AppContext; app: Express }

/** A fresh in-memory app per test file: no network, no credentials. */
export async function harness(over: ContextOverrides = {}): Promise<Harness> {
  const ctx = await createContext({ store: createMemoryStore(), ...over });
  return { ctx, app: createApp(ctx) };
}

/** A browser-like client with a session cookie already issued. */
export async function signedIn(h: Harness, language?: string) {
  const agent = request.agent(h.app);
  const res = await agent.post('/api/auth/session').send({ consent: true, ...(language ? { language } : {}) });
  if (res.status !== 201) throw new Error(`session failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, userId: res.body.user.id as string };
}
