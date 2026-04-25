# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT-5.2 / Claude Sonnet 4.5 / Gemini (auto-fallback).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme.
- **Billing**: Stripe (LIVE mode) — subscriptions + prepaid top-ups with hard-stop at zero balance.
- **Voice**: Twilio (subaccount per vendor) + OpenAI Realtime API (gpt-4o-realtime-preview) bridge.
- **Email OTP**: Gmail SMTP — signup verification, password reset, optional 2FA.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented
### Core
- JWT auth, Vendor profile, Bot Studio (grounded prompts)
- Web widget with Shadow DOM, long-polling, auto-appointment extraction
- Unified 3-pane Inbox with rich text + live agent override
- WhatsApp Cloud API via Meta Embedded Signup
- Conversations / Appointments / Analytics
- Superadmin panel: vendors, suspend/activate, global analytics
- Privacy Policy + Terms
- Landing page with Hero, Channels strip, Features, How-it-works, Pricing, **FAQ (10 SEO Q&A)**, Footer

### Stripe billing (LIVE mode)
- 3 recurring plans: Starter $49 / Growth $149 / Pro $399 USD
- 6 prepaid top-up packs: Spark $125 → Armada $5,499 USD
- 5-day free trial, Web + WhatsApp only, 100-message cap
- Hard-stop at 0 balance, paywall modal after trial
- Admin billing dashboard with MRR/ARR/per-vendor drill-down
- Webhook signature verification (whsec_...)
- Kamal (`kamal@thedigisparrow.com`) exempt — infinite balance

### Auth hardening
- Signup → soft email verification (OTP via Gmail SMTP)
- Password reset via OTP
- Optional 2FA toggle per vendor (Settings → Security)
- OTP: 6-digit, 10-min expiry, 5 attempts max

### Voice (NEW — 2026-04-23)
- Twilio master account active (trial)
- Phone number search across 236 countries
- Number purchase → creates Twilio subaccount per vendor, buys number under vendor's subaccount, auto-wires voice webhook
- TwiML webhook opens Media Streams WebSocket to our bridge
- WebSocket bridge: Twilio μ-law 8kHz ⇄ OpenAI Realtime `g711_ulaw` (vendor-grounded system prompt, greeting, turn detection)
- Transcript saved to conversations/messages collection (channel="voice") — shows up in Inbox
- Per-call minute metering (Twilio status callback deducts from `minutes_balance`)
- Deactivation releases the number from Twilio
- Frontend: Channels page has full Voice activation panel (country picker, area code, type, search, buy)

### Voice endpoints
- `GET /api/voice/countries` — 236 countries
- `POST /api/voice/search-numbers` — {country_code, area_code?, number_type?}
- `POST /api/voice/buy-number` — creates subaccount, purchases, wires webhook
- `GET /api/voice/status` — current number + this-month stats
- `POST /api/voice/deactivate` — releases number
- `POST /api/voice/webhook` — Twilio TwiML response
- `POST /api/voice/status-callback` — Twilio call-completed handler (metering)
- `WS /api/voice/stream/{call_id}` — Twilio ⇄ OpenAI Realtime bridge

## Changelog
- **2026-02-XX** — Idempotent seed: `seed_admin()` now force-resyncs `admin@botnira.com`, `demo@botnira.com`, and `kamal@thedigisparrow.com` password hashes on startup if they drift from the canonical values in `test_credentials.md`. Also auto-sets `email_verified=True` on seed accounts. Resolves the deployment_agent's "test credentials mismatch" finding.
- **2026-04-23** — Shipped Twilio voice backend + frontend Channels panel. Requires `OPENAI_REALTIME_API_KEY` for the actual audio bridge — currently blank, so inbound calls will land on webhook but audio will not be processed until the key is added.
- **2026-04-23** — Stripe LIVE mode activated. All 9 products provisioned in live Stripe. Webhook signature verification enabled.
- **2026-04-23** — Email OTP auth system: signup verify, password reset, optional 2FA toggle.
- **2026-04-23** — Landing page: FAQ section + updated hero copy mentioning phone calls.
- **2026-04-23** — Phase 1 Stripe billing (plans + top-ups + paywall + admin dashboard).
- **2026-04-23** — Removed all Retell AI references.

## Deferred (Prioritised backlog)

### P0 (blocking voice launch)
- **User must provide `OPENAI_REALTIME_API_KEY`** (direct OpenAI project key with Realtime/Voice access). Without it, Twilio calls will connect but audio bridge won't function.

### P1
- **Email channel** via Resend.
- **SMS channel** via Twilio (already have creds).
- **WhatsApp templates manager** for 24h+ Meta session window.
- **Regulatory docs UX** for countries that require proof before number purchase (Germany, France, UK etc).
- **Call history view** in Inbox (filter conversations by channel=voice, show call duration/audio).

### P2
- Vendor onboarding wizard, superadmin drilldown, KB uploads, sentiment/intent analytics, team invites.
- Refactor: split `server.py` (~2300 lines) into `/app/backend/routes/*` modules.

## Known items
- Stripe LIVE; Twilio on trial account ($15 credit) — upgrade to paid before real vendors.
- Meta App Review pending for WhatsApp wider onboarding.
- OpenAI Realtime key not yet added — voice webhook will fail to bridge audio.
