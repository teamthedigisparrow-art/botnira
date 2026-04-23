# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot with a business description + FAQs, serves customers across web/WhatsApp/email/SMS/voice. Bot must strictly answer within the business info only. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT-5.2 / Claude Sonnet 4.5 / Gemini (auto-fallback).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme.
- **Multi-tenancy**: Every collection scoped by `vendor_id`.
- **Billing**: Stripe (test mode) — recurring subscriptions + one-time top-ups.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented
### Core (prior)
- JWT auth, Vendor profile, Bot Studio (grounded prompts)
- Web widget (/widget.js) with Shadow DOM, long-polling, auto-appointment extraction
- Unified 3-pane Inbox with rich text + live agent override
- WhatsApp Cloud API (Meta Graph v22.0) — webhook, send/receive, embedded signup OAuth
- Conversations / Appointments / Analytics
- Superadmin panel: vendors, suspend/activate, global analytics + leaderboard
- Privacy Policy + Terms
- AI fallback chain: Claude Sonnet 4.5 → Gemini 2.5 Flash → GPT-5.2

### New (Phase 1 — Stripe Billing, 2026-04-23)
- **3 recurring plans**: Starter $49 / Growth $149 / Pro $399 USD per month (Stripe subscription mode)
- **6 prepaid top-up packs**: Spark $125 / Boost $249 / Rocket $599 / Jet $1,199 / Fleet $2,899 / Armada $5,499 USD (one-time, never expires)
- **5-day free trial**: Web + WhatsApp only, hard cap of 100 AI messages
- **Hard-stop at zero balance** — no overage auto-charge, vendor must top up
- **Channel locks**: Voice/Email/SMS locked in trial, unlock on any paid plan
- **Kamal exempt account** (`kamal@thedigisparrow.com`): infinite balance, all channels, never billed
- **Paywall modal** on vendor dashboard when trial ends
- **Stripe Checkout hosted flow** (PCI-safe, no card data touches our servers)
- **Stripe Customer Portal** for vendors to manage card / cancel
- **Webhook handler** (`/api/webhook/stripe`): checkout.session.completed, invoice.paid (renewal = balance reset), invoice.payment_failed, subscription.updated/deleted
- **Admin billing dashboard** (`/admin/billing`): MRR / ARR / active subs / trialing / total vendors + per-vendor table with plan, status, balance, stripe customer link, total spent, renewal date
- **Landing marketing**: full Pricing section with 3 plan cards + restored Voice Calls tile in channels strip
- **Balance decrement**: every AI message (web/whatsapp/email/sms) deducts from `messages_balance`

### Trial + Paywall flow
```
Signup → trial_ends_at = now+5d, subscription_status='trialing', messages_balance=100, minutes_balance=0
  ↓ allowed channels: web, whatsapp only
  ↓ day 6 → paywall modal blocks all non-billing pages
  ↓ vendor subscribes → all 5 channels unlock + plan balance granted monthly on renewal
  ↓ balance hits 0 → hard-stop 402 until top-up purchase or next renewal
```

### Key endpoints
- `GET /api/billing/plans` (public) · `GET /api/billing/me` · `POST /api/billing/checkout/subscription|topup`
- `GET /api/billing/checkout/status/{session_id}` (poll) · `POST /api/billing/portal` · `POST /api/webhook/stripe`
- `GET /api/admin/billing` · `GET /api/admin/billing/{vendor_id}`

## Changelog
- **2026-04-23** — Removed Retell AI voice (all code/deps/UI scrubbed). Removed "View widget.js" button from Channels.
- **2026-04-23** — **Phase 1 Stripe Billing shipped**: 3 plans, 6 top-up packs, 5-day trial, hard-stop balance, paywall, admin billing dashboard, landing Pricing section. Tested via `testing_agent_v3_fork` — 21/22 backend + all frontend flows passed. 2 minor bugs found and fixed (simulate/voice status code, landing Voice tile).

## Deferred (Prioritised backlog)

### P1
- **Voice backend (Twilio + OpenAI Realtime)** — UI shells are ready and locked. When user picks a carrier (Twilio / Telnyx / Plivo), build `/api/voice/activate`, TwiML webhook, WS media-stream bridge to OpenAI gpt-realtime-mini, per-call minute deduction from `minutes_balance`.
- **Email channel** via Resend.
- **SMS channel** via Twilio.
- **Stripe live-mode activation** (currently test mode only).
- **Webhook signature verification** (currently dev-mode accepts unsigned). Set `STRIPE_WEBHOOK_SECRET`.
- **WhatsApp templates manager** for 24h+ Meta session window.

### P2
- Vendor onboarding wizard (guided bot training).
- Superadmin vendor drilldown (per-vendor conversations/analytics).
- Knowledge-base PDF/DOCX uploads.
- Conversation sentiment/intent analytics.
- Team members per vendor (invite flow).

### Refactoring
- Split `server.py` (~2000 lines) into `/app/backend/routes/{auth,billing,whatsapp,chat,admin}.py` modules. Flagged by testing agent as highest-priority tech debt.

## Known items
- Stripe is in **test mode**. Test cards: `4242 4242 4242 4242`, any future date, any CVC.
- WhatsApp live on Meta test number +91 70877 30721. Meta App Review pending.
- Voice channel UI exists but backend routes not wired (Twilio pending user decision).
