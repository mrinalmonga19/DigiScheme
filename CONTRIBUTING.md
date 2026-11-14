# Contributing

## Setup
`npm install` (Node 20+). `npm run dev` for API + PWA. Before a PR: `npm run typecheck && npm run lint && npm test && npm run personas`.

## Add a scheme in under 15 minutes
1. **Copy a similar entry** in `apps/api/src/seed/schemes.json` (e.g. `pm-svanidhi` for a loan, `pm-kisan` for a farmer benefit).
2. Fill the required fields: `slug`, `name`/`benefitSummary` (`en` at minimum), `ministry`, `category`, `states` (`[]` = all India), `rules`, `notChecked` (conditions you do not evaluate), `officialLinks`, `sourceUrl`, `lastVerifiedOn`.
3. **Links must be on the whitelist** (`.gov.in`, `.nic.in` or a listed exception in `trust/whitelist.ts`). The seed refuses to load otherwise.
4. **Rules** use profile fields from `packages/shared/src/profile.ts` (`FIELD_DEFS`). Use only facts you can verify from the official guideline; put everything else in `notChecked`.
5. *(Optional)* **Guided application:** add `applicationSteps` (`step`, `title`, `officialFieldName` exactly as on the portal, `instruction`, `prefillFrom`, `commonMistakes`, `documentNeeded`). Never include fees or third-party sites.
6. `npm run seed` validates schema and links. `npm run translate` fills other languages (needs a provider, else leave English and the UI falls back).
7. Add a fixture case to `apps/api/tests/eligibility.test.ts` (one person who qualifies, one who does not) and run `npm test`.

## Rules of the road
- **Never fabricate scheme facts.** If you cannot cite an official page, don't add the fact.
- Eligibility stays deterministic. Do not route it through the LLM.
- New adapters need a mock and must degrade through `Resilient*` wrappers.
- No secrets in the repo; add new variables to `.env.example` and `config/env.ts`.
- Keep UI honest: anything simulated shows the Demo badge.
- New UI strings go in every language pack in `packages/shared/src/i18n`; English first, mark machine translations as such.
