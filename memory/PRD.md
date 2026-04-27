# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT / Claude / Gemini.
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts + DOMPurify (email HTML sanitization).
- **Billing**: Stripe LIVE — subscriptions + prepaid top-ups, 13% HST, hard-stop at 0 balance.
- **Voice**: Twilio (subaccount per vendor) ⇄ OpenAI Realtime bridge.
- **SMS**: Twilio (US/CA only).
- **Email**: IMAP poll (60 s) + SMTP outbound from vendor's own address. Fernet-encrypted at rest. HTML body preserved + sanitized for inbox rendering.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented (current)
### Inbox (NEW UX — 2026-04-27 v2)
- 3-pane: filters | thread list | conversation detail
- **Channel filter pills** in left sidebar — `Show all` + each of {web, whatsapp, email, sms, voice} with live counts. Default = Show all.
- **Search bar** above thread list — filters by `customer_name`, `customer_contact`, `last_message_preview`.
- **Status filters**: ALL / OPEN / RESOLVED.
- **Generate AI reply** button (email channel only) — calls `/api/email/draft-reply`, stuffs draft into composer for vendor to edit and send.
- **HTML email rendering** — sanitized via DOMPurify (FORBID `script`, `style`, `iframe`, `object`, `embed`, `form`, event handlers). Plain-text fallback via existing `RichText` component.
- Live agent override on every channel.

### Email channel (v2 — 2026-04-27)
- IMAP polling every 60 s with `SEARCH UNSEEN` (only fetches mail flagged unread).
- **First-connect "skip-old-emails"** — every existing UNSEEN message in INBOX is flagged `\Seen` immediately on connect, so the poller only ingests truly new mail going forward (returns `skipped_old` count to UI).
- **AI auto-reply OFF by default** — vendors review drafts manually before flipping it on.
- **HTML body captured** alongside plain text — saved on `messages.body_html`.
- SMTP outbound from vendor's own address with `Message-ID` / `In-Reply-To` / `References` for proper threading.
- Fernet-encrypted password (key derived from `JWT_SECRET`).
- Endpoints: `/api/email/{connect, status, settings, disconnect, poll-now, send, draft-reply}`.
- Auto-detects IMAP/SMTP for Gmail / Outlook / Yahoo / Zoho / iCloud; advanced fields for custom IMAP servers.
- 1 outbound email = 1 message debited from `messages_balance` (same as SMS/WhatsApp).

### Other channels & core (unchanged)
- JWT auth + email-OTP signup/reset + optional 2FA.
- Web widget, WhatsApp Cloud API, Voice (Twilio + OpenAI Realtime), SMS (Twilio US/CA).
- Conversations / Appointments / Analytics / Bot Studio.
- Superadmin: vendors, suspend/activate, global analytics.
- Landing page: Hero, Channels, TrustedBy, Features, Use Cases (8), Multi-language, How, Reviews, Pricing, FAQ, rich black footer.
- 8 SEO Use Case detail pages at `/use-case/<slug>`.
- Stripe LIVE — 3 plans, 6 top-ups, 13% HST, paywall, manual sync recovery, purchase confirmation emails.

## Changelog
- **2026-04-27** — **Inbox UX overhaul + Email v2:** clickable channel filter pills, thread search, Generate-AI-reply button for email convs, HTML email rendering with DOMPurify, skip-old-emails on first connect, AI auto-reply default OFF.
- **2026-04-27** — Email channel shipped (IMAP + SMTP, Fernet encryption, AI auto-reply, threading).
- **2026-04-27** — Wired `<TrustedBy />` + `<Reviews />` + rich footer into Landing.
- **2026-04-27** — 8 SEO Use Case detail pages live at `/use-case/<slug>`.
- **2026-04-26** — 13% HST + purchase emails + Twilio SMS + Stripe self-healing + admin Twilio webhook migration.
- **2026-04-23** — Twilio voice + Stripe LIVE + email-OTP auth + landing FAQ.

## Pending / Backlog
### P0
- User must provide `OPENAI_REALTIME_API_KEY` for voice audio bridge.

### P1
- WhatsApp templates manager (24h+ Meta session window).
- Customer-facing appointment confirmation email + BCC superadmin.
- Bing Webmaster verification — placeholder meta tag awaiting code.
- Email channel polish: edit IMAP/SMTP host post-connect.

### P2
- Vendor onboarding wizard.
- Superadmin vendor analytics drill-down.
- KB uploads, sentiment/intent analytics, team invites.

### Tech debt (high)
- Refactor `server.py` (>4750 lines) into `/app/backend/routes/{billing,voice,email,sms,auth,admin,conversations}.py`.
- Idempotency fallback for emails without Message-ID header.
- `_email_poll_once` concurrency cap when vendor count > 50.

## Known items
- Stripe LIVE; Twilio paid; Meta App Review pending for wider WhatsApp.
- Reviews + brand wall on landing are PLACEHOLDERS by legal design.
- Email connect requires app passwords (not regular login passwords).
- HTML emails sanitized client-side via DOMPurify; only allowlisted tags/attrs render.
