#!/usr/bin/env bash
# Full local verification: typecheck, lint, API tests, personas, build, e2e.
set -euo pipefail
npm run typecheck
npm run lint
npm test
npm run personas
npm run build
E2E_CHANNEL="${E2E_CHANNEL:-}" npx playwright test --config apps/web/playwright.config.ts
