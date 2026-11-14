# Limitations and honest disclosures

DigiScheme is a prototype. This is everything that is simulated, assumed or unfinished.

## Mocked or simulated
- **DigiLocker and Aadhaar eKYC are mocks.** Live mode needs partner credentials and is not implemented. The mock eKYC matches a demo code plus year of birth against `personas.json`; it is not real identity verification.
- **Phone OTP is a mock** (`123456`). No SMS is sent.
- **LLM defaults to a deterministic offline planner** (`LLM_MODE=mock`): rule-based NLU, good for the scripted personas and common phrasings, far weaker than Gemini on free-form text. Live Gemini is implemented but only lightly exercised.
- **Bhashini live mode is implemented against its public pipeline contract but untested without credentials.** Fallbacks (Gemini, script heuristics, cached strings, browser Web Speech) are used by default. Offline voice uses a `MOCKASR:` marker in tests; real transcription quality was not measured.
- **WhatsApp** uses Twilio Sandbox semantics; the default mock mode validates signatures against a known test token. Sandbox users must join with the sandbox code first.
- **In-memory DB by default.** Data is lost on restart. MongoDB mode is implemented but was not run against a real Atlas cluster here.

## Content
- **29 curated schemes** (8 with guided application). Facts were compiled from official sources at build time and **will go stale**; each scheme carries a source URL and `lastVerifiedOn`. Never treat the catalogue as authoritative, and re-verify before production.
- Eligibility rules are a **simplification** of scheme guidelines. Verdicts are "likely/unlikely", not entitlements. Each scheme lists `notChecked` conditions we do not evaluate.
- **Machine translations.** UI packs and scheme name/summary translations are machine-generated and unreviewed. Application-step text is translated for the guided schemes; "common mistakes" strings are **English-only**.
- Telugu and Punjabi PDF rendering depends on a fontkit patch (`patches/`); other scripts were checked visually only on the first page of one scheme.

## Privacy and security assumptions
- DPDP alignment is a design intent, not a legal review: purpose-limited consent, PII scrubbing, field encryption, delete-my-data. No DPO process, retention schedule or breach workflow exists.
- WhatsApp onboarding records consent when the user replies with a language number. A real deployment should use an explicit consent message.
- Dev/test secrets are generated or defaulted (`demo-admin`); production refuses to boot without real secrets.
- Rate limits are per-process and in-memory.
- The link checker uses a static whitelist plus heuristics; it does not fetch pages or consult reputation feeds. A scam domain that passes every heuristic would be reported as "not recognised", never as "official".

## Product scope
- No application submission, no payments, no document upload. The assistant prepares and explains only.
- Reminders run in-process (`ReminderService`); they are not durable across restarts.
- Accessibility: badges use icon + text, targets are large, but no formal audit (WCAG, screen-reader pass) was done.
- No load testing. The e2e suite runs one browser worker against a local server.
