# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat`. Modules: `server.py` (4173 lines, monolith) + `email_routes.py` (extracted Email channel, ~620 lines).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts + DOMPurify (HTML email sanitization).
- **Billing**: Stripe LIVE — subscriptions + prepaid top-ups, 13% HST, hard-stop at 0 balance.
- **Voice**: Twilio (subaccount per vendor) ⇄ OpenAI Realtime bridge.
- **SMS**: Twilio (US/CA only).
- **Email**: IMAP poll (60 s) + SMTP outbound from vendor's own address. Fernet-encrypted at rest. HTML body preserved + sanitized for inbox rendering.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented (current)

### Refactor (NEW — 2026-04-27 v3)
- **Email channel extracted** into `/app/backend/email_routes.py` (~620 lines). Server.py shrunk by 638 lines (4811 → 4173). Pattern: extracted module imports `server as _s` for helpers (db, logger, _push_message, _ensure_conversation, _vendor_can_use_channel, _decrement_message_balance, _maybe_book_appointment, get_ai_reply, require_vendor, JWT_SECRET, SMTP_FROM_NAME, now_iso, new_id). Server.py mounts the router at the bottom: `api_router.include_router(_email_router, prefix="/email")` + `app.add_event_handler("startup", _email_start)`. Late `from email_routes import ...` inside `agent_reply`'s email branch avoids circular import. 23/23 regression tests pass.

### Vendor app shell (NEW — 2026-04-27 v3)
- **Collapsible left sidebar** in VendorLayout — toggle button + persisted `localStorage` state (`botnira.vendor.sidebar.collapsed`). Collapses 260px → 64px, hides labels (icon-only with tooltips + aria-label for a11y). Frees ~196px of horizontal real estate for the inbox/main pane.

### Channels — Email panel (NEW — 2026-04-27 v3)
- **Step-by-step Gmail App-Password walkthrough** — `<details>` block with 6 numbered steps, direct links to `myaccount.google.com/security` and `/apppasswords`, Tip block (workspace accounts), and Privacy note (Fernet encryption). Renders only when email is not yet connected.

### Inbox UX (2026-04-27 v2)
- 3-pane: filters | thread list | conversation detail
- Channel filter pills (Show all default + per-channel with live counts)
- Search bar — name / phone / email / preview substring match
- Generate AI reply button (email channel only) — calls `/api/email/draft-reply`, stuffs draft into composer
- HTML email rendering via DOMPurify (allowlist: no script/style/iframe/event handlers)
- Live agent override on every channel

### Email channel (2026-04-27 v2)
- IMAP poll every 60 s (`SEARCH UNSEEN`)
- First-connect skip-old: existing unread mail flagged `\Seen` instantly so poller only sees new arrivals
- AI auto-reply OFF by default
- HTML body capture + storage on `messages.body_html`
- SMTP outbound from vendor's own address with proper threading (Message-ID / In-Reply-To / References)
- Fernet-encrypted password (key derived from `JWT_SECRET`)
- Endpoints: `/api/email/{connect, status, settings, disconnect, poll-now, send, draft-reply}` (now in `email_routes.py`)
- Auto-detects IMAP/SMTP for Gmail / Outlook / Yahoo / Zoho / iCloud
- 1 outbound = 1 message debited

### Other channels & core (unchanged)
- JWT auth + email-OTP signup/reset + optional 2FA
- Web widget, WhatsApp Cloud API, Voice (Twilio + OpenAI Realtime), SMS (Twilio US/CA)
- Conversations / Appointments / Analytics / Bot Studio
- Superadmin: vendors, suspend/activate, global analytics
- Landing: Hero, Channels, TrustedBy, Features, Use Cases (8), Multi-language, How, Reviews, Pricing, FAQ, rich black footer
- 8 SEO Use Case detail pages at `/use-case/<slug>`
- Stripe LIVE — 3 plans, 6 top-ups, 13% HST, paywall, manual sync recovery, purchase confirmation emails

## Changelog
- **2026-04-27 v3** — Email module extracted to `email_routes.py`. Collapsible vendor sidebar with localStorage persistence. Step-by-step Gmail app-password guide on Channels page. 23/23 regression tests pass.
- **2026-04-27 v2** — Inbox UX overhaul (channel pills, search, AI draft, HTML rendering). Email v2 (skip-old, AI off default, HTML capture).
- **2026-04-27 v1** — Email channel shipped (IMAP + SMTP).
- **2026-04-27** — Landing page TrustedBy + Reviews + rich footer, 8 SEO Use Case pages.
- **2026-04-26** — 13% HST + purchase emails + Twilio SMS + Stripe self-healing + admin Twilio webhook migration.
- **2026-04-23** — Twilio voice + Stripe LIVE + email-OTP auth + landing FAQ.

## Pending / Backlog
### P0
- User must provide `OPENAI_REALTIME_API_KEY` for voice audio bridge.

### P1
- WhatsApp templates manager (24h+ Meta session window).
- Customer-facing appointment confirmation email + BCC superadmin.
- Bing Webmaster verification — placeholder meta tag awaiting code.
- Edit IMAP/SMTP host post-connect (currently disconnect+reconnect).

### P2
- Vendor onboarding wizard.
- Superadmin vendor analytics drill-down.
- KB uploads, sentiment/intent analytics, team invites.

### Tech debt (in progress)
- ✅ Email module extracted.
- 🔜 Voice module extraction (~700 lines next).
- 🔜 WhatsApp module extraction.
- 🔜 Billing module extraction.

## Known items
- Stripe LIVE; Twilio paid; Meta App Review pending for wider WhatsApp.
- Reviews + brand wall on landing are PLACEHOLDERS by legal design.
- Email connect requires app passwords (not regular login passwords) — Gmail walkthrough now in-app.
- Kamal's email connection currently DISCONNECTED (testing agent disconnected to verify guide UI). User to reconnect with their app password.
