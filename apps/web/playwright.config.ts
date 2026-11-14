import { defineConfig, devices } from '@playwright/test';

const PORT = 4100;
const BASE = `http://localhost:${PORT}`;

/**
 * The e2e suite runs the real API (memory store, mock providers) serving the built PWA from one origin,
 * so it needs no credentials and no network. Build the web app first: `npm run build -w @digischeme/web`.
 * Uses the machine's installed Chrome when Playwright's own browser download is unavailable (E2E_CHANNEL=chrome).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: BASE, trace: 'retain-on-failure', ...devices['Pixel 5'], ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) },
  webServer: {
    command: 'npx tsx ../api/src/server.ts',
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(PORT), SERVE_WEB: 'true', PUBLIC_BASE_URL: BASE, WEB_BASE_URL: BASE, CORS_ORIGINS: BASE,
      NODE_ENV: 'development', LOG_LEVEL: 'error', LLM_MODE: 'mock', DB_MODE: 'memory', DIGILOCKER_MODE: 'mock', AADHAAR_MODE: 'mock',
      BHASHINI_MODE: 'fallback', WHATSAPP_MODE: 'mock',
    },
  },
});
