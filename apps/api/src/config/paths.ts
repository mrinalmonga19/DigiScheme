import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locate apps/api regardless of whether we run from src/ (tsx, vitest) or dist/ (tsup bundle).
 */
function findApiRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, 'utf8')).name === '@digischeme/api') return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const API_ROOT = findApiRoot();
export const SEED_DIR = path.join(API_ROOT, 'src', 'seed');
export const FONT_DIR = path.join(API_ROOT, 'assets', 'fonts');
export const PROMPT_DIR = path.join(API_ROOT, 'src', 'orchestrator', 'prompts');
export const WEB_DIST = path.join(API_ROOT, '..', 'web', 'dist');

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
