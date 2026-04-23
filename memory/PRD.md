# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist platform. Each business (vendor) has an isolated workspace, trains its own bot with a business description + FAQs, and serves customers across web/WhatsApp/email/SMS. Bot must strictly answer within the business info only. One superadmin oversees all vendors.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT-5.2 / Claude Sonnet 4.5 / Gemini (auto-fallback).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme (International Klein Blue #002FA7, Cabinet Grotesk / Satoshi / Azeret Mono, hard black borders, hard shadows).
- **Multi-tenancy**: Every collection scoped by `vendor_id`. `require_vendor` guard + suspended-vendor gating.

## Users
- **Vendor** — onboards one business; trains a bot; manages inbox / appointments / channels / analytics.
- **Superadmin** — platform-level view: all vendors, suspend/activate, global analytics + leaderboard.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented
- JWT auth (signup, login, me) + role scoping
- Vendor profile, Bot Studio (grounded system prompt)
- Public widget (`/widget.js`) with Shadow DOM, long-polling for agent replies, auto-appointment extraction
- Unified 3-pane Inbox with rich text rendering + live agent override
- WhatsApp Cloud API integration (Meta Graph API v22.0): webhook, send/receive, agent override
- WhatsApp Embedded Signup OAuth callback + vendor self-onboarding button (Meta App Review pending)
- Conversations / Appointments / Channels (4: web/whatsapp/email/sms) / Analytics
- Superadmin: vendor list, suspend/activate, global analytics + leaderboard
- Privacy Policy + Terms of Service pages
- AI fallback chain: Claude Sonnet 4.5 → Gemini 2.5 Flash → GPT-5.2

## Changelog
- **2026-04-23** — Removed all Retell AI voice integration (backend routes `/api/voice/*`, webhook, SDK, env key, frontend Voice panel, waitlist UI, AREA_CODES/PLANS constants, all related MongoDB collections purged). Also removed the "View widget.js" button from Channels page. Voice channel removed from default channel seeding (vendors now get 4 channels: web/whatsapp/email/sms). Cleaned Retell/Voice references from Landing, Privacy, Terms, Overview.

## Deferred (Prioritised backlog)
### P1
- **Email channel** via Resend (no Meta review needed, fast win).
- **SMS channel** via Twilio or similar.
- **Stripe billing**: plans + metered usage.
- **WhatsApp templates manager**: send outside the 24h Meta session window.
- **Voice channel (v2)** — user asked for an architectural answer re: bypassing Twilio with OTP; answer documented in handoff. Needs a SIP/telephony carrier (Twilio/Telnyx/Plivo) before this can be rebuilt.

### P2
- Superadmin vendor analytics drill-down.
- Vendor onboarding wizard.
- Knowledge-base file uploads (PDF/DOCX).
- Conversation analytics: sentiment, intent.
- Team members per vendor (invite flow).

### Refactoring
- Split `server.py` (~1300 lines) into `/app/backend/routes/*` modules (auth, vendor, whatsapp, chat, admin).

## Known items
- WhatsApp live on Meta test number +91 70877 30721; Meta App Review is pending for wider vendor onboarding.
