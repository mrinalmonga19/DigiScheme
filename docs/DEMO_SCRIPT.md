# Demo script (5 minutes)

Start: `npm run build && SERVE_WEB=true npm start`, open http://localhost:4000 on a phone-sized window.
Everything below works offline. The "Demo mode" badge is visible on purpose: say so out loud.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing page; switch language to Hindi then back | "Nine scheduled languages, UI and answers switch together. Scheme facts are curated, not generated." |
| 0:30 | **Gurpreet (Punjabi, web).** Open Chat, accept consent, type or speak a student-scholarship question in Punjabi | "Consent first (DPDP). Estimated badges, because he only told us." |
| 1:15 | Tap *Verify with DigiLocker*, approve consent with demo persona Gurpreet (eKYC demo code `222222`) | "Now the same facts show **Verified**, with source and an easy Revoke." |
| 2:00 | Open the scholarship, *Apply*, walk 2 steps, then download the Application Kit | "A prefilled guide in Punjabi, with the official link as a QR. We never submit anything." |
| 3:00 | **Anita (Hindi).** Link Checker: paste a look-alike `.com` link, then the real `pmkisan.gov.in` | "Whitelist plus look-alike checks. Anything off the list is never shown as official." |
| 3:45 | **Lakshmi (Tamil, WhatsApp).** Run `npm run personas` in a second terminal and show the Tamil voice-note step and numbered replies | "Same engine on WhatsApp: voice note in, numbered scheme list, kit PDF link out." |
| 4:30 | **Ramesh (Kannada).** Settings: low-bandwidth on; go offline in DevTools, reload | "Installable PWA, offline shell, text-first mode." |
| 5:00 | Settings: *Delete my data* | "One tap, everything gone." |

## Persona demo codes
Lakshmi `111111`, Gurpreet `222222`, Anita `333333`, Ramesh `444444`. Phone OTP: `123456`. Admin passcode: `demo-admin`.

## If something breaks (fallbacks)
- **No microphone / voice fails:** type instead; the transcript step is the same code path.
- **Server audio missing:** the reply flags `ttsFallback: browser` and the PWA speaks it with the browser voice (needs an OS voice for that language).
- **LLM provider down:** the circuit breaker switches to the offline planner within three failures and the badge says Demo. Nothing to do.
- **Flaky Wi-Fi in the room:** the whole demo is local. Only live Gemini/Bhashini need network.
- **Total fallback:** `npm run personas` prints the four journeys as text, and `npm run test:e2e -w @digischeme/web` replays them in a browser.
