import { describe, expect, it } from 'vitest';
import { createContext } from '../src/context';
import { createMemoryStore } from '../src/db/memory';
import { runPersona } from '../src/personas/runner';
import { loadPersonas } from '../src/seed/loader';

/** Spec 17: every demo persona runs end to end against the real app, offline, and meets its expectations. */
describe('demo personas', () => {
  for (const persona of loadPersonas()) {
    it(`${persona.name} (${persona.language}, ${persona.channel}) meets every expectation`, async () => {
      const ctx = await createContext({ store: createMemoryStore() });
      const report = await runPersona(ctx, persona);
      expect(report.failures).toEqual([]);
      expect(report.steps.length).toBe(persona.script.length);
    });
  }
});
