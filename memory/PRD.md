# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT / Claude / Gemini.
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme.
- **Billing**: Stripe (LIVE) — subscriptions + prepaid top-ups, 13% HST, hard-stop at 0 balance.
- **Voice**: Twilio (subaccount per vendor) ⇄ OpenAI Realtime bridge.
- **SMS**: Twilio (US/CA only).
- **Email**: IMAP poll (60 s) + SMTP outbound from vendor's own address. Fernet-encrypted at rest.
- **Email OTP**: Gmail SMTP for system-side OTP / appointment / purchase emails.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented (current)
### Core
- JWT auth + email-OTP signup/reset + optional 2FA
- Vendor profile, Bot Studio, Web widget (Shadow DOM)
- Unified 3-pane Inbox with rich text + live agent override
- Conversations / Appointments / Analytics
- Superadmin: vendors, suspend/activate, global analytics
- Privacy Policy, Terms

### Channels
- **Web** — embed widget v1.3
- **WhatsApp** — Meta Cloud API + embedded signup
- **Voice** — Twilio number search/buy + Media Streams ⇄ OpenAI Realtime
- **SMS** — Twilio inbound+outbound (US/CA)
- **Email (NEW — 2026-04-27)** — IMAP polling every 60 s, SMTP outbound, AI auto-reply toggle, threading via Message-ID/In-Reply-To, password Fernet-encrypted with key derived from JWT_SECRET. Auto-detects IMAP/SMTP for Gmail / Outlook / Yahoo / Zoho / iCloud. Advanced fields for custom IMAP servers. Channels page panel with status, last-sync timestamp, received/sent counters, "Check now" manual poll, AI auto-reply pause/resume.

### Landing & SEO
- Landing: Hero, Channels, TrustedBy strip, Features, Use Cases (8), Multi-language, How, Reviews, Pricing, FAQ, Footer
- 8 SEO Use Case detail pages at `/use-case/<slug>` with FAQ JSON-LD, OpenGraph, canonical, BreadcrumbList
- Rich black 4-column footer matching `/use-case/*` style on Landing
- Google Analytics + Search Console tags in `index.html`

### Stripe billing (LIVE mode)
- 3 plans + 6 prepaid top-ups, 13% HST, 5-day free trial, paywall, manual sync recovery, webhook signature verification, purchase confirmation emails.

## Changelog
- **2026-04-27** — **Email channel shipped.** IMAP polling + SMTP outbound, vendor-managed inbox, AI auto-reply, Fernet password encryption, Channels page panel, threading via Message-ID. 23/23 backend pytest cases pass. (`/app/backend/server.py:3748+`, `/app/frontend/src/components/botnira/ConnectEmailPanel.jsx`)
- **2026-04-27** — Wired `<TrustedBy />` and `<Reviews />` into Landing. Replaced Landing footer with rich 4-col black footer.
- **2026-04-27** — 8 SEO Use Case detail pages live at `/use-case/<slug>`.
- **2026-04-26** — 13% HST + purchase emails + Twilio SMS + Stripe self-healing + trial fix + usage panel + admin Twilio webhook migration.
- **2026-04-23** — Twilio voice + Stripe LIVE + email-OTP auth + landing FAQ.

## Pending / Backlog
### P0
- User must provide `OPENAI_REALTIME_API_KEY` for voice audio bridge.

### P1
- WhatsApp templates manager (24h+ Meta session window).
- Customer-facing appointment confirmation email + BCC superadmin.
- Bing Webmaster verification — placeholder meta tag awaiting code.
- Email channel polish: edit IMAP/SMTP host post-connect (currently disconnect+reconnect).

### P2
- Vendor onboarding wizard.
- Superadmin vendor analytics drill-down.
- KB uploads, sentiment/intent analytics, team invites.

### Tech debt (high)
- Refactor `server.py` (>4700 lines) into `/app/backend/routes/{billing,voice,email,sms,auth,admin,conversations}.py`. The Email module (3748–4344) is self-contained and is the cleanest first extraction.
- Idempotency fallback for emails without Message-ID header.
- `_email_poll_once` concurrency cap when vendor count > 50.

## Known items
- Stripe LIVE; Twilio paid; Meta App Review pending for wider WhatsApp.
- Reviews + brand wall on landing are PLACEHOLDERS by legal design.
- Email connect requires app passwords (not regular login passwords).
