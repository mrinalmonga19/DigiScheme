import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // The shared workspace package ships TS source, so bundle it; everything else stays external.
  noExternal: ['@digischeme/shared'],
});
