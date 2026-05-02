# BotNira — PRD

## Original Problem Statement
Multi-tenant AI receptionist SaaS. Each business (vendor) has an isolated workspace, trains its own bot, and serves customers across web, WhatsApp, email, SMS, and voice. Bot strictly answers within the vendor's own business info. One superadmin oversees all vendors with full billing visibility.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor), JWT auth, emergentintegrations `LlmChat`. Modules: `server.py` (~4200 lines) + `email_routes.py` (~670 lines, extracted).
- **Frontend**: React 19 + Tailwind + Shadcn UI + Recharts + DOMPurify (HTML email sanitization).
- **Billing**: Stripe LIVE — subscriptions + prepaid top-ups, 13% HST, hard-stop at 0 balance.
- **Voice**: Twilio (subaccount per vendor) ⇄ OpenAI Realtime bridge.
- **SMS**: Twilio (US/CA only).
- **Email**: IMAP poll (60 s) with **UID watermark** + SMTP outbound from vendor's own address. Fernet-encrypted. HTML preserved + sanitized.

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Implemented (current)

### Sales Assistance — outbound email marketing (v1 — 2026-05-02 iter 6)
- **Plan-gated**: Growth + Pro (+ exempt). Starter / trial sees a "Locked — upgrade" overlay.
- **Prospects**: CSV upload (`email,name,company`), case-insensitive merge with existing list, duplicate + invalid-email skip stats.
- **Campaigns**: create with subject + body (text **or** HTML, sanitised), `{{name}} {{first_name}} {{company}} {{email}}` merge tags. Pause / resume / cancel state machine.
- **Anti-spam pacing**: single asyncio loop ticks every 20 s; sends **one email at a time** per campaign, then schedules the next slot **5–45 min later** at random.
- **Open tracking**: invisible 1×1 GIF pixel injected per recipient — first hit flips `opened_at` and increments campaign open count.
- **Compliance**: every email auto-appends an unsubscribe footer + `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers. Public unsubscribe page sets prospect `status=unsubscribed`. Hard SMTP bounces flip `status=bounced`.
- **Analytics**: KPI cards (Sent / Opened / Open Rate / Failed / Unsubscribed) + daily bar chart for last 7/30/90/365 days.
- **Reuses** the inbox SMTP — vendor connects email **once** in Channels → Email and it powers both transactional replies and outbound campaigns.
- Endpoints: `/api/sales/{access, prospects, prospects/upload, prospects/clear, campaigns, campaigns/{id}, campaigns/{id}/{pause|resume|cancel}, analytics, track/open/{cid}/{rid}.gif, unsubscribe/{vid}/{pid}}`.
- Pricing: animated gradient "Sales Assistant Included" badge on Growth & Pro landing cards.

### Inbox (v3 — 2026-04-27 iter 5)
- **Server-side pagination** — 30 threads per page, `Load more` button. `/api/conversations?limit&offset` returns `{items, total, has_more, unread_total}`.
- **Server-side search** (debounced 280ms) — `?q=...` searches `customer_name`, `customer_contact`, `last_message_preview`, `subject` across the full dataset. Load-more hidden during search (global).
- **Unread indicator** on every thread card — blue dot (top-left), bolder font, blue "NEW" label, subtle blue bg. Auto mark-as-read on open (`POST /conversations/{cid}/read`). Top-right "N NEW" badge.
- **Channel filter pills** with real-time totals (parallel count calls).
- **Thread timestamps** — "2:43pm" today / "Yesterday 11am" / "Mar 14 1:23pm".
- **HTML email rendering** via DOMPurify.
- **Generate AI reply** button (email channel only).

### Email channel (v3 — 2026-04-27 iter 5)
- **Bulletproof UID watermark polling** — `UID SEARCH UID {last_uid+1}:*`, immune to \Seen flag flips, label moves, re-deliveries.
- **3-layer UIDNEXT fallback on connect** — STATUS(UIDNEXT) → SELECT untagged response → SEARCH ALL max+1.
- **Fresh start on reconnect** — `fresh_start=true` checkbox (default ON) wipes previously ingested email threads so the inbox starts clean.
- **Clear history** button in the Email panel (post-connect) for one-click wipe.
- **AI auto-reply OFF by default** — vendor reviews drafts first.
- **HTML body captured + sanitized** for rich rendering.
- **Step-by-step Gmail app-password walkthrough** in the connect panel.
- Endpoints: `/api/email/{connect, status, settings, disconnect, poll-now, send, draft-reply, clear-history}`.
- Auto-detects IMAP/SMTP for Gmail / Outlook / Yahoo / Zoho / iCloud.

### Vendor shell
- **Collapsible left sidebar** (260 ↔ 64px) with localStorage persistence.

### Other channels & core (unchanged)
- JWT auth + email-OTP signup/reset + optional 2FA
- Web widget, WhatsApp Cloud API, Voice, SMS (US/CA)
- Appointments / Analytics / Bot Studio
- Superadmin: vendors, suspend/activate, global analytics
- Landing: Hero, Channels, TrustedBy, Features, Use Cases (8), Multi-language, How, Reviews, Pricing, FAQ, rich footer
- 8 SEO Use Case detail pages at `/use-case/<slug>`
- Stripe LIVE — 3 plans, 6 top-ups, 13% HST, paywall, sync recovery, purchase emails

## Changelog
- **2026-05-02 iter 7** — Sales Assistance **Phase 2** (multi-list). New `sales_prospect_lists` collection + CRUD endpoints (`/sales/lists`). Prospects now carry `list_ids: List[str]` — one canonical prospect per (vendor, email) with multi-list membership. Campaign creation accepts `list_ids[]` and unions active prospects across lists (deduped by identity). Auto-migration creates a **"Main list"** for existing vendors, backfills legacy campaigns with `list_ids=[]`. New **DSN bounce detector** in `email_routes.py` flips matching recipients + prospects to `status=bounced` (only swallows DSN when recipient is matched — legitimate postmaster mail still reaches the inbox). Analytics daily series now includes **bounced** bucket. Frontend rebuilt: left sidebar list manager, inline prospect edit modal, multi-select campaign composer, expandable per-recipient detail drawer. **41/41 pytest cases pass.**
- **2026-05-02 iter 6** — Sales Assistance Phase 1 (Email module). Prospect CSV upload, single-list campaigns, sender loop with 5–45 min jitter, open-pixel tracking, CASL unsubscribe, Growth/Pro plan gating + animated pricing badge. **23/23 backend pytest cases pass.**
- **2026-04-27 iter 5** — Inbox pagination (30/page + Load More), debounced server-side search, unread indicator + mark-read endpoint, Fresh-start checkbox on reconnect, 3-layer UIDNEXT fallback. **41/41 pytest cases pass.**
- **2026-04-27 iter 4** — UID watermark poller, /email/clear-history, thread timestamps.
- **2026-04-27 iter 3** — Email module extracted to email_routes.py, collapsible sidebar, Gmail app-password guide.
- **2026-04-27 iter 2** — Channel filter pills, Generate AI reply, HTML email rendering.
- **2026-04-27 iter 1** — Email channel MVP (IMAP + SMTP).
- **2026-04-26** — 13% HST + Twilio SMS + Stripe self-healing + Twilio webhook migration.
- **2026-04-23** — Twilio voice + Stripe LIVE + email-OTP + landing FAQ.

## Pending / Backlog
### P0
- User must provide `OPENAI_REALTIME_API_KEY` for voice audio bridge.

### P1
- WhatsApp templates manager (24h+ Meta session window).
- Customer-facing appointment confirmation email + BCC superadmin.
- Bing Webmaster verification meta tag (awaiting code).
- Edit IMAP/SMTP host post-connect (currently disconnect+reconnect).
- 24h-before appointment reminder email/SMS.
- **Sales Assistance — Phone calls module** (next phase: outbound marketing calls via Twilio + AI bridge).

### P2
- Vendor onboarding wizard.
- Superadmin vendor analytics drill-down.
- KB uploads, sentiment/intent analytics, team invites.

### Tech debt
- ✅ Email module extracted (`email_routes.py`).
- 🔜 Voice module extraction (~700 lines).
- 🔜 WhatsApp / Billing / Auth module extraction.
- 🔜 Idempotency fallback for emails without Message-ID header.
- 🔜 Concurrency cap in `_email_poll_once` when vendors > 50.

## Known items
- Stripe LIVE, Twilio paid, Meta App Review pending.
- Landing Reviews + TrustedBy are placeholders by legal design.
- Email connect requires **app passwords** (not regular login); Gmail walkthrough in-app.
- Kamal's email **reconnected** during iter-5 testing with fresh_start → cleaned 440 historical threads, fresh UID watermark at 105732.
