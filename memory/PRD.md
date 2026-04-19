# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist platform. Each business (vendor) has an isolated workspace, trains its own bot with a business description + FAQs, and serves customers across web/WhatsApp/email/SMS/voice. Bot must strictly answer within the business info only. One superadmin oversees all vendors.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat` for GPT-5.2 / Claude Sonnet 4.5 / Gemini (auto-fallback).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts. Swiss/neo-brutalist theme (International Klein Blue #002FA7, Cabinet Grotesk / Satoshi / Azeret Mono, hard black borders, hard shadows).
- **Multi-tenancy**: Every collection scoped by `vendor_id`. `require_vendor` guard + suspended-vendor gating.

## Users
- **Vendor** — onboards one business; trains a bot; manages inbox / appointments / channels / analytics.
- **Superadmin** — platform-level view: all vendors, suspend/activate, global analytics + leaderboard.

## Seeded accounts
- Superadmin: `admin@botnira.com` / `admin123`
- Demo vendor: `demo@botnira.com` / `demo123` (Acme Dental Clinic)

## Implemented (2026-04-19)
- JWT auth (signup, login, me) + role scoping
- Vendor profile (GET/PUT `/api/vendor/me`)
- Bot Studio (GET/PUT `/api/bot`) with grounded system prompt builder
- Public chat `/api/chat/message` (used by Bot Studio live preview + future embed widget)
- Conversations: list, detail, agent reply, resolve — `/api/conversations/*`
- Inbound simulators for whatsapp/email/sms/voice — `/api/simulate/{channel}`
- Appointments CRUD — `/api/appointments`
- Channels — `/api/channels` (toggle connect/disconnect, default 5 channels seeded per vendor)
- Vendor analytics — totals, by_channel, daily (7d), hourly — `/api/analytics`
- Superadmin endpoints — `/api/admin/vendors` (list + counts + owner), PUT status (active/suspended), `/api/admin/analytics` (includes leaderboard)
- Suspended-vendor guard: login 403, public chat 404
- AI provider fallback chain: Claude Sonnet 4.5 → Gemini 2.5 Flash → GPT-5.2 (primary swap made because OpenAI proxy is returning 502s today; auto-uses GPT-5.2 again when it recovers)

**Frontend**
- Public landing (`/`) with hero, channels strip, features, how-it-works, pricing
- Auth pages (`/login`, `/signup`)
- Vendor shell (`/app`): Overview, Inbox (3-pane), Bot Studio (with Live Preview chat), Channels (embed snippet + simulator), Appointments, Analytics, Settings
- Superadmin shell (`/admin`): Overview, Vendors (toggle), Analytics

## Deferred (Phase 2)
- **Real Retell AI voice agent** — architecture ready; needs Retell API key + phone number + webhook wiring
- **Real WhatsApp / Email / SMS** — needs Twilio / Meta Business / SendGrid keys; simulator works today
- Team members per vendor (invite flow)
- Stripe billing + plans
- Embeddable `widget.js` (snippet shown in Channels page today but the file is not yet served)
- Knowledge-base file uploads (PDF/DOCX) in addition to plain business description
- Conversation analytics: sentiment, intent, drill-down

## Known items
- OpenAI proxy outage observed 2026-04-19 — Claude Sonnet 4.5 is primary bot brain until GPT-5.2 recovers (no code change required, fallback chain handles it).
