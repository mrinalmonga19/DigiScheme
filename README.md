# DigiScheme

**Multiple scheduled languages. One assistant that speaks them all.**

DigiScheme is a Digital Citizen Assistant prototype. A citizen describes their situation in their own language
(text or voice, web or WhatsApp), and DigiScheme finds the government schemes they likely qualify for, shows which
facts are **Verified** (consented DigiLocker / Aadhaar eKYC) and which are **Estimated** (self-declared), and walks
them through the application with a downloadable, prefilled **Application Kit** PDF. It never submits anything on the
citizen's behalf and never asks for money.

> **This is a demo.** DigiLocker, Aadhaar eKYC and (by default) the LLM and Bhashini are mocked, and the UI says so
> with "Demo mode" badges. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for the honest list.

## Run it in 60 seconds (no keys needed)

```bash
npm install            # Node 20+
npm run build
SERVE_WEB=true npm start        # http://localhost:4000
```

Or for development: `npm run dev` (API on :4000, PWA on :5173). Or `docker compose up --build`.

With nothing configured the app uses an in-memory database, an offline rule-based language model, mock
DigiLocker/eKYC and the browser's speech APIs. Copy `.env.example` to `.env` to switch adapters on.

## What's inside

| Path | What it is |
|---|---|
| `packages/shared` | Types, zod schemas, 9-language UI packs, field definitions. Used by API and web. |
| `apps/api` | Express + TypeScript API: deterministic eligibility engine, orchestrator, trust layer, adapters, WhatsApp. |
| `apps/web` | React + Vite + Tailwind PWA (installable, offline shell, low-bandwidth mode). |
| `apps/api/src/seed` | 29 curated schemes (8 with guided application), 10 document types, 4 demo personas. |
| `docs/` | Architecture, API, demo script, limitations. See also [CONTRIBUTING.md](CONTRIBUTING.md). |

## Languages

English, Hindi, Punjabi, Tamil, Kannada, Bengali, Marathi, Telugu, Gujarati. UI strings and scheme names are
machine-translated and need native-speaker review before any real use.

## Try the four personas

`npm run personas` replays all four end to end offline (Lakshmi, Tamil WhatsApp voice; Gurpreet, Punjabi PWA with
DigiLocker; Anita, Hindi scam-link check; Ramesh, Kannada low-bandwidth). The same journeys run in the browser via
`npm run test:e2e -w @digischeme/web`. Walk-through: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Design principles

1. **Eligibility is code, not an LLM.** `apps/api/src/eligibility` evaluates rules per scheme and returns
   eligible / likely / unlikely / unknown with reasons and the missing facts. The LLM only plans and phrases.
2. **Honest provenance.** Every fact is Verified (with source and consent) or Estimated. Estimates never read as certain.
3. **Trust layer.** Only whitelisted `.gov.in` / `.nic.in` links are shown; a link checker flags look-alikes, shorteners,
   IP hosts and punycode; an Output Guard blocks fees, "guaranteed" claims and unlisted URLs.
4. **Privacy by default.** Explicit consent, PII scrubbed before storage and before any LLM call, encrypted
   fields, one-tap "Delete my data".
5. **Offline-first demo.** Every adapter has a mock, and the circuit breaker falls back to it automatically.

## Scripts

| Command | Purpose |
|---|---|
| `npm test` | API unit + integration tests (vitest) |
| `npm run test:e2e` | Playwright (build the web app first; `E2E_CHANNEL=chrome` uses installed Chrome) |
| `npm run personas` | Offline persona replay |
| `npm run seed` | Validate and upsert schemes into the configured DB |
| `npm run translate` | Fill missing scheme translations via the configured provider |
| `npm run typecheck` / `lint` | Static checks |

## Configuration

See `.env.example`. Production requires `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `PHONE_HASH_SALT`, `ADMIN_PASSCODE`.
The admin screen (`/admin`) takes `ADMIN_PASSCODE` (default `demo-admin` in dev).

The repo ships a small `patches/` entry (via `patch-package`) that makes fontkit tolerate null GPOS anchors, which is
required to render Punjabi and Telugu in the PDF kit.
