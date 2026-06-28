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

### Referral Program (v1 — 2026-05-24 iter 10-11)
- **Vendor side complete**. Every vendor gets a unique, immutable referral link `https://botnira.com/r/<slug-6hex>`. 15% recurring commission on every successful payment from referred vendors. Accrued per Stripe `invoice.paid` event and finalised end-of-month for USD bank payout.
- **New page** `/app/referrals` with 5 tabs: **Overview**, **My Referrals**, **Commissions**, **Payouts**, **Bank Account**. New nav item after Settings. **PaywallGuard bypasses /app/referrals** — vendors who joined just to earn referrals can keep using the page even when their trial expires (sidebar lifted to `z-[60]` so it stays clickable over the paywall overlay).
- **Admin side complete (iter 11)**. New `/admin/referrals` page (after Analytics). Two tabs: **Referrers** (lists ONLY vendors who have referred ≥1 customer or earned ≥1 commission, sortable by pending desc → lifetime desc, search by name/email/code) + **Pending Payouts** (queue grouped by vendor+month, oldest month first, with badge count + total amount banner). Clicking any row opens a **drill-down modal** showing: identity, full bank details (with copy-to-clipboard per field) or 'missing' warning, month-wise breakdown with "Mark paid" button per accrued month, referred-customer list, all commissions, payout history. **Mark Paid dialog** records a `referral_payouts` row, flips matching `referral_commissions` from `accrued→paid` (linked via `payout_id`), and is **idempotent** (second submit for same vendor+month returns 400 'No accrued commissions found').
- **Backend**: new module `backend/referral_routes.py` (~700 lines). Public router at `/api/referrals/*` + admin router at `/api/admin/referrals/*`. New mongo collections: `referral_codes`, `referrals`, `referral_commissions`, `referral_payouts`, `referral_bank_accounts`.
- **Attribution**: signup accepts `referral_code`. `/r/<code>` validates against backend before redirecting to `/signup?ref=<code>` — invalid codes are dropped. Self-referrals blocked when new vendor's email or signup IP matches the referrer.
- **Commission accrual** (`server.py` Stripe webhook): `invoice.paid` → 15% of `subtotal_excluding_tax` (so HST isn't paid out) → row in `referral_commissions` keyed/dedup'd on `stripe_invoice_id`, `commission_month=YYYY-MM`, status `accrued`. `customer.subscription.deleted` flips the matching `referrals` row to `status=cancelled`.
- **Bank fields**: Account holder, Account number, Bank name, SWIFT/BIC/Routing, IBAN, Country, Address. USD only.
- **Tests**: 17/17 vendor pytest + 7/7 vendor Playwright (iter_9/10) + 16/16 admin pytest + admin Playwright e2e (iter_11). Files: `/app/backend/tests/test_referrals.py` + `/app/backend/tests/test_admin_referrals.py`.

### Superadmin credentials rotated (2026-05-24 iter 11)
- New: `sidhuboys000@gmail.com / Kamala98@pamo`. Legacy `admin@botnira.com / admin123` retired (migrated in-place via idempotent startup hook — `legacy_admin` doc is renamed if found, so existing JWTs from the legacy account still work post-migration).

### Sales Assistance — multi-channel outbound (v3 — 2026-05-22 iter 10)
- **Three channels under one prospect pool**: Emails (live), WhatsApp (live — bulk approved-template broadcast), Calls (coming soon — Twilio + AI bridge planned).
- **Top-level tabs** in Sales Assistant: Prospects | Emails | WhatsApp | Calls.
- **WhatsApp bulk campaigns**: vendor selects an APPROVED Meta template + maps `{{1..N}}` placeholders to literal text or prospect tokens (`{{first_name}}`, `{{name}}`, `{{company}}`, `{{email}}`, `{{phone}}`), then targets one-or-more lists. Sender loop paces **30s–3min** per recipient (random jitter), skips prospects without phone, decrements vendor's message balance, auto-pauses on balance exhaustion or channel gate failure. Pause/resume/cancel state machine. Per-recipient drill-down table shows phone, status, sent_at, error.
- **WhatsApp templates manager** (Channels → WhatsApp → Message Templates panel): submit MARKETING/UTILITY/AUTHENTICATION templates with header/body/footer + `{{n}}` placeholders + per-variable example values; APPROVED templates immediately become available to bulk campaigns AND to the in-conversation send-template endpoint.
- **Reuses** `sales_prospects` + `sales_prospect_lists` from the email module — one prospect (vendor+email) belongs to many lists, has optional `phone` for WA campaigns. CSV upload, dedupe, unsubscribe, bounce detection all unchanged.

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
- **2026-06-28 iter 16** — **Google sign-in/sign-up (Emergent OAuth) + login/signup mobile responsiveness**. Added "Continue with Google" to /login and /signup (`GoogleAuthButton.jsx`) and a `/auth/callback` route (`AuthCallback.jsx`) that exchanges the OAuth `session_id` via new backend `POST /api/auth/google/session` (calls Emergent `session-data`, finds-or-creates a vendor workspace, issues our existing JWT). Refactored signup's vendor provisioning into shared `_create_vendor_workspace()` helper (now used by both password & Google signup). New users via Google: `auth_provider='google'`, `email_verified=true`, no password_hash. Conflict handling: `POST /auth/login` now rejects passwordless (Google) accounts with 400 "This account uses Google sign-in. Please continue with Google."; Google login on an existing password account links it (`google_linked`). Login/Signup pages tightened for mobile (`p-4 sm:p-8`, responsive OTP input). Verified: 3/3 backend pytest (`test_google_auth_iter16.py`) + frontend mobile/desktop e2e all pass (iteration_16).
- **2026-06-28 iter 15** — **Mobile responsiveness for ALL vendor /app pages (frontend-only, no backend changes)**. `VendorLayout` now renders a mobile top bar (hamburger `vendor-mobile-menu-btn` + brand + logout) with a slide-out drawer; desktop keeps the fixed grid sidebar with collapse/expand. `Inbox` converted to one-pane-at-a-time on mobile (list ↔ detail). `SalesAssistant` prospects stack on mobile + tables scroll. All page roots `p-8`→`p-4 sm:p-8`. Testing agent 100% pass at 390x844 + 1920x800. iteration_15.
- **2026-06-08 iter 14** — **Sales Assistant: Email vs WhatsApp list types**. Prospect lists now have a `list_type` (`email` default | `whatsapp`). **Email lists** keep email-as-identity (current behaviour). **WhatsApp lists** are strictly name + country_code + phone (NO email) — country code required per row, dedup by full E.164 phone (same number+CC = duplicate/rejected; same local number with a different CC = separate lead), non-10-digit numbers accepted but flagged as `warned`. CSV upload branches on the target list type (`_upload_whatsapp_rows`); `/sales/prospects/template.csv?list_type=whatsapp` returns the WA template. Email campaigns target ONLY email lists (prospect filter now excludes email-empty leads); WhatsApp campaigns can target BOTH email + WhatsApp lists (email lists carry phone too). Every vendor auto-gets a WhatsApp-type **'Inbox Leads'** list; inbound WhatsApp webhook calls `capture_inbox_lead()` to upsert the customer's number+name (deduped) for marketing reuse. DB: legacy non-partial unique `(vendor_id,email)` index dropped → replaced with partial unique `uniq_vendor_email` (email>"") + new partial unique `uniq_vendor_wa_phone` (list_type=whatsapp). Frontend: list-type selector + per-list EMAIL/WA badges, adaptive help/table/edit-modal/template per type, email composer filters to email lists, WA composer shows both with reach counts. 8/8 backend pytest + all frontend e2e flows pass (iteration_14).
- **2026-05-24 iter 13** — **Blog module shipped (full CMS + public reader)**. New mongo collections `blogs` + `blog_files`. **Public**: `/blog` list (hero featured card + tag filter + grid of post cards) and `/blog/:slug` detail (title/subtitle/featured image/share/markdown body with rich `.blog-body` styles + related-posts strip + SEO meta/title injected). Public image proxy `/api/blogs/files/{id}` (no auth, cache-control 24h) so search engines can index. Nav + footer get a Blog item on Landing, SiteNav, SiteFooter. **Admin** (`/admin/blogs` after Referrals): list/search/status-filter table + full editor (title, slug auto-gen + uniquifier, subtitle, excerpt, markdown body with live Preview toggle, featured image uploader + inline image uploader that appends `![image](URL)` to the body, tags chips, draft/active/inactive status, SEO meta fields). Toggle status + delete-with-confirm + view-public buttons in the table. **Backend**: new `blog_routes.py` with public + admin sub-routers; uses Emergent object storage via `EMERGENT_LLM_KEY` (init once at startup, retry on 403, soft-delete on `blog_files`). Image upload validates jpg/png/webp/gif + ≤6MB on both client and server. Markdown is rendered through `marked` + `DOMPurify` to keep XSS-safe HTML. **Tests**: 21/21 backend pytest + full frontend Playwright e2e pass. Iteration_13 report.
- **2026-05-24 iter 12** — Public Referrals marketing page + auto payout email. 18/18 backend + 56/57 frontend pass.
- **2026-05-24 iter 11** — Admin-side Referrals Management. 16/16 admin pytest + Playwright e2e pass.
- **2026-05-24 iter 10** — Referral Program (vendor side). 17/17 backend + 7/7 frontend pass.
- **2026-05-22 iter 10** — **WhatsApp Bulk Campaigns** integrated into Sales Assistant (a true broadcast channel, not just re-engagement). New collections `sales_wa_campaigns` + `sales_wa_campaign_recipients`. Endpoints under `/api/sales/wa/{campaigns, campaigns/{id}, campaigns/{id}/{pause|resume|cancel}, analytics}`. Pipeline: vendor picks an APPROVED WhatsApp template + maps each `{{n}}` placeholder to either a literal value or a prospect-field token (`{{first_name}}`, `{{company}}`, `{{email}}`, `{{phone}}`, `{{name}}`), then targets one-or-more prospect lists. Background `_sales_wa_sender_loop` runs alongside the email loop, sends one template at a time per campaign, **paces 30s–3min** per send (random jitter) to stay friendly with Meta's spam heuristics. Skips prospects without a phone. Mid-campaign auto-pauses on balance exhaustion or channel-gate failure. Decrements vendor's message balance. SalesAssistant.jsx restructured to **top-level channel tabs**: Prospects | Emails | WhatsApp | Calls (coming soon) — one prospect pool, three channels. `/sales/access` now also returns `channels.{email,whatsapp,calls}.connected` so the UI can route correctly. **25/25 new pytest cases pass.**
- **2026-05-22 iter 9** — **WhatsApp Message Templates manager** added (P1 done). Backend: 4 new endpoints under `/api/whatsapp/templates(*)` — list (GET), create (POST), delete (DELETE by name+hsm_id), and `/api/whatsapp/send-template` for re-engagement outside the 24h Meta session window. Templates support `MARKETING / UTILITY / AUTHENTICATION` categories with `{{1}}..{{N}}` variable placeholders, optional header (text), footer, and per-variable example values (auto-padded so Meta accepts the submission). Name auto-normalised to lowercase + underscores. `send-template` decrements vendor's message balance and respects channel access gate. Frontend: new `WhatsAppTemplatesPanel.jsx` (renders inside Channels page below the Profile editor, only when the WA number is fully registered). Features: live list with APPROVED/PENDING/REJECTED status pills, create form with placeholder detection + example inputs, delete, and "Send" modal that prompts for recipient + variable values per template. All payloads validated via curl (400/422 paths). Vendor's lint and pytest pass.
- **2026-05-22 iter 8** — **Basic plan ($29/mo)** added — chat-only entry tier. `PLANS["basic"]` has `voice_min=0`, `messages=1000`, `channels=["whatsapp","email","web"]`. `_plan_for_vendor` now sources `allowed_channels` from `PLANS[plan_key]["channels"]` instead of hard-coding all 5 — meaning Basic vendors get Voice/SMS panels **automatically hidden** in `Channels.jsx` and `_vendor_can_use_channel` rejects voice/sms with a clear "not included in your plan" message. Landing pricing grid switched to 4 cards (md:grid-cols-2 lg:grid-cols-4). Billing.jsx renders Basic with a "🔒 No voice minutes" badge + channel list. Stripe price auto-provisioned (`price_1TZnKCC8HSANh2JGwhzqV24y`). FAQ copy updated. `test_billing::test_plans_public` updated to expect 4 plans.
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
- Customer-facing appointment confirmation email + BCC superadmin.
- Bing Webmaster verification meta tag (awaiting code).
- Edit IMAP/SMTP host post-connect (currently disconnect+reconnect).
- 24h-before appointment reminder email/SMS.
- **Sales Assistance — Phone calls module** (next phase: outbound marketing calls via Twilio + AI bridge).
- **Referrals — admin side**: ✅ shipped 2026-05-24 iter 11 (Referrers tab + Pending Payouts queue + drill-down modal + Mark Paid dialog).
- **Referrals — admin enhancements**: CSV export of pending payouts (bulk wire upload), Stripe Connect upgrade for auto-payouts, email notification to vendor when payout is sent.

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
