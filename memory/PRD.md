# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT-5.2 / Claude Sonnet 4.5 / Gemini.
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme.
- **Billing**: Stripe (LIVE mode) — subscriptions + prepaid top-ups, 13% HST tax, hard-stop at zero balance.
- **Voice**: Twilio (subaccount per vendor) + OpenAI Realtime API bridge.
- **SMS**: Twilio (US/CA only).
- **Email OTP**: Gmail SMTP.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented (current)
### Core
- JWT auth, Vendor profile, Bot Studio, Web widget (Shadow DOM), Unified 3-pane Inbox
- WhatsApp Cloud API, SMS (US/CA), Voice bridge, Outbound email
- Conversations / Appointments / Analytics
- Superadmin: vendors, suspend/activate, global analytics
- Privacy Policy, Terms

### Landing & SEO
- Landing: Hero, Channels, Features, Use Cases (8 cards), Multi-language, How, Pricing, FAQ, Footer
- 8 SEO-optimized Use Case detail pages at `/use-case/<slug>` (salon, dental, auto-repair, real-estate, restaurant, education, home-services, healthcare-clinic) with FAQ JSON-LD, OpenGraph, canonical, BreadcrumbList schema
- **TrustedBy** strip — animated marquee of fictional brand SVG wordmarks + 6,000+/47/1.2M/4.9★ stats
- **Reviews** grid — placeholder Google-style customer reviews (8 cards, multi-country)
- Rich black 4-column footer (brand, use cases, product, company) on Landing + UseCase pages
- Google Analytics + Search Console tags in `index.html`

### Stripe billing (LIVE mode)
- 3 recurring plans + 6 prepaid top-ups, 13% HST Stripe Tax, 5-day free trial, paywall, manual sync recovery, webhook signature verification
- Purchase confirmation emails

### Auth hardening
- Signup → email verify (OTP), password reset (OTP), optional 2FA
- Idempotent admin/demo/exempt seeding

### Voice
- Twilio subaccount-per-vendor, search/buy numbers, Media Streams ⇄ OpenAI Realtime bridge, transcript saved to inbox, per-call minute metering, deactivation releases number
- Admin "Migrate Twilio webhooks" button (uses request `Origin` header to pick prod URL)

### SMS
- Twilio inbound webhook + outbound helper (US/CA only)

## Changelog
- **2026-04-27** — Wired `<TrustedBy />` and `<Reviews />` into Landing page composition. Replaced minimal Landing footer with rich 4-column black footer matching `/use-case/*` style.
- **2026-04-27** — 8 SEO Use Case detail pages live at `/use-case/<slug>`. Per-page meta, OG, schema.org FAQ + Article + Breadcrumb JSON-LD.
- **2026-04-26** — 13% HST Stripe Tax + Purchase confirmation emails; Twilio SMS webhooks (US/CA); Stripe self-healing sync; trial expiry fix; usage panel on Billing page; admin Twilio webhook migration button.
- **2026-04-23** — Twilio voice + Stripe LIVE + email-OTP auth + landing FAQ shipped.

## Pending / Backlog
### P0 (blocking voice launch)
- User must provide `OPENAI_REALTIME_API_KEY` for the audio bridge.

### P1
- **Inbound Email channel** (IMAP poller into unified inbox; only outbound works today).
- **WhatsApp templates manager** for 24h+ Meta session window.
- Bing Webmaster verification — placeholder meta tag in `/app/frontend/public/index.html`, awaiting code from user.
- Customer-facing appointment confirmation email + BCC superadmin.

### P2
- Vendor onboarding wizard.
- Superadmin vendor analytics drill-down.
- KB uploads, sentiment/intent analytics, team invites.
- Refactor `server.py` (>4100 lines) into `/app/backend/routes/*` modules.

## Known items
- Stripe LIVE; Twilio paid account.
- Meta App Review pending for wider WhatsApp onboarding.
- Reviews + brand wall on landing are GENERIC PLACEHOLDERS (not real Google reviews / not real brands) per legal compliance — vendor must collect real reviews before claiming any "verified" status.
