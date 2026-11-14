# API

Base path `/api`. JSON unless noted. Session via httpOnly cookie `ds_session`. Errors:
`{ "error": { "code": "...", "message": "..." } }`.

## Core
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Status, store mode, demo flags |
| GET | `/languages` | Supported languages |
| POST | `/auth/session` | Create/resume session (language, channel) |
| GET | `/auth/session` | Current user, consent state |
| POST | `/auth/phone/start` · `/auth/phone/verify` | Mock OTP (demo code `123456`) |
| PATCH | `/me/settings` | language, low bandwidth |
| DELETE | `/me` | Delete all user data |
| POST | `/links/check` | `{ url }` returns verdict and reasons |

## Chat and voice (consent required)
| Method | Path | Notes |
|---|---|---|
| GET | `/chat/welcome`, `/chat/history` | |
| POST | `/chat` | `{ text }` or `{ chip }` returns reply, chips, schemes, badges, optional audio |
| POST | `/voice/transcribe` · `/voice/chat` | multipart `audio` |
| POST | `/voice/speak` | `{ text, lang }` returns audio or `ttsFallback: "browser"` |
| GET | `/media/:id` | Generated audio |

## Schemes, profile, eligibility
| Method | Path | Notes |
|---|---|---|
| GET | `/schemes`, `/schemes/:slug`, `/schemes/:slug/rules` | Curated catalogue, rules in plain language |
| POST | `/eligibility` | Evaluate profile against all schemes |
| GET/PATCH | `/profile` | Fields with provenance |
| DELETE | `/profile/:field` | Remove one field |
| GET/POST/PATCH | `/trackers`, `/trackers/:id` | Application status tracking |

## Verification
`POST /verify/digilocker/start`, `GET /verify/consent/:id`, `POST /verify/consent/:id/decision`,
`GET /verify/consents`, `POST /verify/consents/:id/revoke`, `POST /verify/ekyc`, `GET /verify/personas`.

## Guided application
`POST /applications`, `GET /applications/:id`, `POST /applications/:id/step` (`next|back|repeat|explain|no_document`),
`GET /applications/:id/kit-link` (signed 24 h URL), `GET /applications/:id/kit.pdf` (cookie or `?t=` token).

## Webhooks
`POST /webhooks/whatsapp`: Twilio form-encoded; `X-Twilio-Signature` required.

## Admin (`x-admin-passcode`)
`GET /admin/overview`, `/admin/audit`, `/admin/providers`, `/admin/schemes`.
