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

### Crawler SSR/prerendering + per-page canonical/og:url (2026-06 / this session)
- **Problem confirmed**: BotNira is a CRA (CRACO) client-side SPA — non-JS crawlers (GPTBot/ClaudeBot/PerplexityBot/etc.) received only the app shell + "enable JavaScript"; blog/use-case content invisible in raw HTML.
- **Fix**: added **react-snap** build-time prerendering (`postbuild: "react-snap || echo skipped"` — non-fatal so it never breaks deploy; `reactSnap` config with `--no-sandbox`, `skipThirdPartyRequests:false`, `crawl:true`). `index.js` now `hydrateRoot`s prerendered markup (else `createRoot`). Result: each public route ships **real static HTML** (home, /team, /privacy, /terms, /blog, every /use-case/*, and blog posts existing at build time). Verified via build artifacts: use-case/dental & a blog post contain full body text.
- **Per-page canonical + og:url**: added `src/lib/seo.js` `setCanonical(path)` used by Blog/Team/Privacy/Terms; BlogDetail sets canonical+og per post; UseCasePage already per-slug. Build artifacts confirm each page's canonical is self-referential (not homepage).
- **Verified**: testing_agent iteration_22 — 100% pass, no critical/minor issues (prerender build output + live SPA health + DOM meta). Canonical follow-up for /blog,/team,/privacy,/terms verified via build-output grep.
- **Caveats**: prerender only manifests in a production **build** (preview runs the dev server, so curling preview still shows the SPA shell — expected); takes effect after **redeploy**. Blog posts published after a deploy need a rebuild to be prerendered. react-snap needs headless Chromium in the deploy build (fallback is non-fatal).


### Voice fixes + Google-verification Privacy Policy (2026-06 / this session)
- **Voicemail wastes minutes → fixed**: outbound calls now use async AMD (`machine_detection='Enable'` + `async_amd` → `/api/sales/outbound/amd/{id}`). On a machine/fax we set `outcome='voicemail'` and **hang up immediately** via `cli.calls(sid).update(status='completed')` (call_sid now stored). The `/status` webhook **preserves** a prior 'voicemail' verdict (reads existing `campaign_calls.outcome`) instead of flipping it to 'answered', and AI summary only fires for 'answered'. Verified by testing_agent: **15/15 pass** (iteration_21.json).
- **~4s answer latency → fixed**: greeting `response.create` is now sent inside the Twilio `start` handler (was fired before `stream_sid` existed, so greeting audio was dropped); `server_vad silence_duration_ms` 600→500. (Real audio can't be auto-tested; verified by code inspection.)
- **Google OAuth verification stuck on Privacy Policy → fixed**: `Privacy.jsx` gained a dedicated **Section 6 'Google user data (Google Calendar integration)'** — lists scopes (`calendar`, `userinfo.email`, `openid`), and discloses how Google data is accessed/used/stored/shared, a **Limited Use** statement linking the Google API Services User Data Policy, and revocation/deletion (myaccount.google.com/permissions). Sections renumbered 6→13; footer compliance note updated. `CalendarsTab.jsx` now shows a Privacy Policy link + Limited Use note beside the Connect button (in-app prominence). Verified rendering + content by testing_agent (iteration_20.json).
- NOTE: two backend edits (silence_duration_ms, the voicemail-preserve block) silently reverted once mid-session; both re-applied and confirmed persisted via grep + passing tests.


### Outbound AI Sales Calling Engine — Phase 3 (2026-06 / this session)
- **Restart actions**: `POST /campaigns/{cid}/restart` (modes: failed / no_answer / busy / voicemail / all_incomplete / selected) — re-queues matching prospects (attempts reset) and re-opens completed campaigns.
- **Duplicate** (`/duplicate` → draft copy of config only), **Archive** (`/archive`, non-running), **Edit** (existing PUT, draft/paused), **Add-more-lists** (`/add-lists` merges lists + enqueues only new deduped prospects).
- **Do-Not-Call**: `dnc_numbers` collection + `GET/POST/DELETE /dnc`. Enqueue skips DNC numbers; a spoken "do not call" outcome auto-adds the number (source=call) and flags the prospect.
- **Audit logs**: `audit_logs` collection + `_audit()` helper wired into launch/pause/resume/cancel/delete/restart/duplicate/archive/add-lists/dnc; `GET /audit` feed.
- **Frontend** (`OutboundCalls.jsx`): campaign card **"More" menu** (Edit / Add lists / Restart / Duplicate / Archive / Cancel / Delete), edit-mode Wizard (PUT), **AddLists** & **Restart** modals, and a new **Compliance** sub-tab (DNC add/list/remove + read-only Audit log table).
- **Tested**: all endpoints via curl (200s) + UI (DNC add/remove + audit feed verified on screen).
- **Still open (not requested this phase)**: in-dashboard notifications (started/finished/out-of-minutes/hot-lead/appointment/daily-limit).


### Outbound AI Sales Calling Engine — Phase 2 (2026-06 / this session)
- **AI post-call analysis** (`_generate_call_summary`, Claude via Emergent LLM key): after an answered call, reads the transcript and stores in `call_ai_summaries` — summary, intent, sentiment, key questions, notes, next action, confidence, extracted entities (email/business/decision-maker/callback time/appointment date), and a **refined lead outcome** (interested/hot/warm/cold/appointment_booked/callback/transferred/etc.) that overrides the Twilio "answered" disposition on `campaign_calls` + `campaign_prospects`.
- **Call recording**: `_place_call` now records; `/sales/outbound/recording/{call_id}` stores the media URL; `/sales/outbound/calls/{id}/recording` proxies the audio (parent-account Twilio basic auth) for authenticated playback.
- **Filtered call list**: `GET /campaigns/{cid}/calls` supports outcome/status/search/date-range filters, sort, pagination.
- **Export**: `GET /campaigns/{cid}/calls/export?fmt=csv|xlsx` (xlsx via openpyxl — added to requirements).
- **Per-campaign analytics**: `GET /campaigns/{cid}/analytics` (outcome distribution, per-day, answer/interest/conversion/completion rates, retry count, minutes).
- **Individual call detail**: `GET /calls/{call_id}` (call meta, campaign, transcript, AI summary, prospect/retry, recording flag).
- **Frontend** (`OutboundCalls.jsx`): rich **Analytics** tab (recharts — rate bars, outcome pie, calls/day) with per-campaign selector; **Call History** with search/filters/sort/pagination + CSV & Excel export; row click opens **Call Detail modal** (customer info, recording player, AI summary w/ sentiment+entities, transcript, metadata, retry history).
- **Tested (curl)**: analytics/filtered-calls/CSV/XLSX all 200 with correct shapes + content-types; UI tabs render. NOTE: AI summaries + recordings populate only on real answered calls (needs live dialing with vendor's number + funded OPENAI_REALTIME_API_KEY).
- **Remaining — Phase 3**: retry-restart actions (failed/no-answer/busy/selected), duplicate/archive/edit campaign, add-more-lists, in-dashboard notifications (started/finished/out-of-minutes/hot-lead/appointment), Do-Not-Call management UI, audit/consent logs.


### Outbound AI Sales Calling Engine — Phase 1 (2026-06 / this session)
- **New module `backend/outbound_call_routes.py`** mounted at `/api/sales/outbound` (Growth/Pro gated via `_require_sales_vendor`). Collections: `campaign_out`, `campaign_prospects`, `campaign_calls` (indexed).
- **Campaign lifecycle**: create/update draft, launch (snapshots prospects from selected lists, dedupes by E.164, **blocks non-+1 international** numbers with clear error, skips invalid/DNC), pause, resume, cancel, delete, get detail, list, per-campaign call history.
- **Dialer background loop** (`_dialer_loop`, startup hook): for each RUNNING campaign respects business hours + timezone (zoneinfo), daily limit (per campaign-local day), per-campaign concurrency (2), retry rules (no-answer/busy/voicemail, max attempts, retry-after), Do-Not-Call. Places REAL Twilio outbound calls via vendor subaccount → TwiML `<Connect><Stream>` → shared voice bridge.
- **Voice-minute guard**: dialer + status-callback auto-pause ALL running campaigns at 0 minutes (`paused_reason=no_minutes`); resume/launch blocked until recharge. Never auto-charges. Minutes deducted on Twilio status callback (`/sales/outbound/status/{call_id}`).
- **Campaign-aware voice bridge** (`server.py` `voice_stream`): when `call_records.campaign_id` present, builds a sales-agent system prompt from industry/goal/script/language, maps voice gender+tone → OpenAI Realtime voice, uses prospect name/contact; call saved as a `conversations` thread (Inbox-visible).
- **Frontend `components/sales/OutboundCalls.jsx`** replaces the "coming soon" Calls tab: sub-tabs Dashboard (all summary counters + calls-per-day chart + no-minutes recharge banner), Campaigns (list + actions + **11-step Create Campaign wizard**), Call History (table), Analytics (rate bars). Verified via screenshots + curl.
- **Tested (curl)**: create→launch (queued 1, blocked_international 1)→pause→resume→cancel→delete all pass; guards enforced. **Live end-to-end dialing pending vendor's provisioned number + funded OPENAI_REALTIME_API_KEY.**
- **Deferred to Phase 2**: AI post-call summaries + AI-driven outcomes (interested/appointment/etc.), full analytics charts, call-list filters/search/export (CSV/Excel), individual call page. **Phase 3**: retry-restart actions, duplicate/archive/edit, in-dashboard notifications, audit/consent logs.


### Marketing site — Team page + Homepage trust overhaul (2026-06 / this session)
- **New `/team` page** (`pages/Team.jsx`): CEO story (Kamaljeet Singh Sidhu — Conestoga B.Tech → ImmiPRO → The DigiSparrow 135-member → BotNira), team story, values, stats strip, CEO + team photos, shared SiteNav/SiteFooter, mobile responsive. Linked in nav + footer.
- **Homepage (`pages/Landing.jsx`) upgrades** per founder conversion brief:
  - Hero: click-to-call `+1 (289) 778-4594`, embedded **real call recording** audio player (m4a hosted on customer-assets), loud risk-reversal chips (5-day trial · no card · cancel anytime · live in 3 min), "Hear a real call" CTA.
  - New **Reassurance band** ("It never guesses" — transfers/takes a message) above the fold.
  - New **IndustryTiles** (Salons/Clinics/Repair/Tutoring → use-case pages).
  - New **DataSecurity** section: TLS encryption, Canadian data residency, no AI training on data, PIPEDA & GDPR aligned (all confirmed true by owner).
  - New **Founder** section: CEO photo + quote + Hamilton ON + "Book a 15-min call" (WhatsApp) + "Read our story".
  - New **RiskReversal** black band before Pricing.
  - **Honesty fix**: removed legally-flagged FAKE reviews (`Reviews.jsx` now illustrative "Example scenario" cards, no fabricated named/photo Google reviews) and removed inflated `TrustedBy` stats (6,000+/47 countries/1.2M/4.9★ → 24-7/3-min/95+/Ontario; "trusted by" → "built for").
- **Deferred**: Point 8 (SSR / no-JS prerender) — skipped per owner, to be done later.


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
- **2026-06 — Inbox "Call back": in-browser calling (Twilio PSTN + WhatsApp), top-right widget**.
  Agents can now call a customer back straight from the Inbox thread.
  - **Twilio PSTN callback** (voice/SMS threads): `browser_call_routes.py` — `POST /api/voice/browser/token` mints a Twilio Voice access token (idempotently provisions a per-subaccount API Key + TwiML App), `POST /api/voice/browser/twiml` returns `<Dial callerId=vendor#>`, `POST /api/voice/browser/status` meters minutes + logs the call into the same conversation thread. Frontend uses `@twilio/voice-sdk`. Verified 6/6 (test_browser_call.py).
  - **WhatsApp calling** (Meta Cloud API, `whatsapp_call_routes.py`): `GET /api/voice/turn` (Twilio Network Traversal Service → ICE/TURN for WebRTC), `GET/POST /api/whatsapp/calling/status|enable`, inbound `calls` webhook handling wired into `whatsapp_webhook` → logs "📞 Incoming WhatsApp call" + duration into the SAME thread + `call_records`, and a signaling WebSocket `/api/ws/wa-call` (JWT-auth, relays SDP offer/answer + connect/accept/reject/terminate to Graph API). Frontend `CallWidget` does the browser WebRTC (outbound offer + inbound answer); Inbox opens a WS to ring the agent on inbound calls; Channels has an "Enable WhatsApp calling" panel.
  - **Routing**: outbound WhatsApp calls only where Meta allows them. Business-initiated calls are blocked by Meta for US/CA/EG/VN/NG numbers, so the Inbox callback button auto-falls back to a **Twilio PSTN** call for those numbers (`/whatsapp/calling/status.outbound_supported`, country-prefix check). Inbound WhatsApp calls are logged for everyone.
  - **Widget**: redesigned, anchored **top-right** (verified 24px inset on desktop 1920 + mobile 390 by the testing agent), avatar/pulse-ring/mute/hangup, provider-colored accent (blue Twilio / green WhatsApp).
  - Verified: WhatsApp webhook logging + US/UK routing (test_whatsapp_call.py 7/8; the 1 "fail" was an emoji exact-match assertion, feature confirmed working), TURN endpoint returns Twilio ICE servers, WS signaling connects + relays over BOTH localhost and external WSS (ingress forwards WebSocket upgrades), frontend smoke 100% (iteration_23).
  - ⚠️ **Production-only verification remaining**: actual two-way *audio* (both Twilio PSTN and WhatsApp) needs a live provisioned number + real device/mic + (for WhatsApp) a calling-enabled WABA number at ≥2,000 messaging limit with the `calls` webhook subscribed. Meta bills WhatsApp calls separately, so they log duration but do NOT deduct Twilio voice minutes.
  - Also added: **second Meta Pixel** (`1486120406893357`) alongside the existing pixel in `public/index.html`.
- **2026-06 — Public-page prerendering hardened (controlled allowlist, exclusions guaranteed)**. Replaced the react-snap package.json CLI config (`crawl:true` + 5 static includes) with a programmatic prerender script `frontend/scripts/prerender.js` invoked from `postbuild` (non-fatal). It runs react-snap with **`crawl:false`** and an **explicit public-route allowlist**: `/`, `/team`, `/privacy`, `/terms`, `/blog`, `/referrals`, all 8 `/use-case/*`, all 6 SEO landing pages, plus **every published blog post** (slugs fetched live from `${REACT_APP_BACKEND_URL}/api/blogs` at build time, wrapped in try/catch). `crawl:false` guarantees auth/authenticated routes are **never** prerendered. Fixed `/referrals` canonical + `/team`/`/referrals` unique title/description via `setPageSeo()`. NOTE: prerender only manifests in a production **build**; takes effect after redeploy.
- **2026-07-03 iter 19 — BUGFIX: "Plan price not provisioned yet" on upgrade/top-up**. Root cause: `startup_stripe()` (which calls `_ensure_stripe_prices()` to populate `STRIPE_PRICE_IDS` from Stripe at boot) was DEFINED but never REGISTERED as a FastAPI startup handler — likely dropped during the earlier "wrap startup events" 520-fix. So price IDs were empty at runtime and every `POST /api/billing/checkout/{subscription,topup}` raised 503 "Plan price not provisioned yet". Fix: `app.add_event_handler("startup", startup_stripe)` in server.py (~L5713). Verified: boot log "Stripe price provisioning complete", `/api/billing/plans` returns non-null price_id for all 4 plans + 6 topups, and subscription/topup checkout return live checkout.stripe.com URLs (no 503). Frontend upgrade + top-up buttons redirect to Stripe. 10/10 backend + frontend pass (iteration_19). ⚠️ Production still has the bug until redeployed.
- **2026-07-03 iter 18b — Phase 4 (email reminders) + Phase 5 (AI booking availability guard)**. Reminders: per-vendor `reminders={email_enabled, offsets_hours:[24,2,...]}` in scheduling settings + Availability-tab UI; background `reminder_loop` (5-min tick) emails customers N hours before (reuses confirmation emailer with `kind='reminder'`). AI guard: `is_ai_slot_bookable()` blocks bookings outside working hours / on closed days / vacation / conflicting with existing+Google events (buffers applied); `_maybe_book_appointment` now refuses to persist such bookings and posts a corrective reply with `suggest_slots()`; `availability_prompt()` injected into the receptionist system prompt so it only offers open times; successful AI bookings get UTC start_at/end_at/duration + Google push. Fixed a regression where `public_book()`'s tail (confirmation/vendor email + JSON return) was orphaned into `reminder_loop` → restored (public booking returns `{ok,appointment}` and sends emails again). Verified: 14/14 backend pytest + frontend reminders-UI persistence + public-booking fix (iteration_18). Known limitation [MED]: AI extractor doesn't pass customer tz — naive times interpreted in vendor tz.
- **2026-07-03 iter 18 — Phase 2: Google Calendar + Google Meet (per-vendor OAuth, two-way sync)**. New backend module `google_calendar_routes.py`: per-vendor OAuth (one BotNira Google client, many vendor authorizations), tokens in `gcal_connections` with auto-refresh. Endpoints: `GET /api/scheduling/google/status`, `GET /api/scheduling/google/connect?origin=` (returns Google auth URL, state=signed JWT with vendor_id+origin), public `GET /api/oauth/calendar/callback` (code exchange → store tokens → redirect `{origin}/app/appointments?gcal=connected|error`), `POST /api/scheduling/google/disconnect` (revoke+delete+purge imported events), `POST /api/scheduling/google/sync-now`. Redirect URI derived from request origin so it works on both preview + botnira.com. Two-way sync: PUSH on booking/reschedule/cancel (create/update/delete Google events, best-effort background tasks) + PULL background poller (every 90s) imports external Google events as `source='google_calendar'` blocking appts (feed into double-booking check). Google Meet: auto conferenceData when appointment type location contains meet/online/video → stores `meet_link`. Frontend: `CalendarsTab.jsx` (Connect/Disconnect/Sync-now/status, Meet hint, Calendly "coming soon"), added as "Calendars" tab in AppointmentsHub, handles `?gcal=` return toast. Env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET added. Verified via curl: configured=true, connect URL valid (client_id + redirect ok), bad-state→400, error→redirect, disconnect→ok. NOTE: live Google consent handshake requires a real Google login (cannot be automated) — awaiting user's manual connect test on preview. Libs: google-auth, google-auth-oauthlib, google-api-python-client.
- **2026-07-03 iter 17 — Phase 1: Native Scheduling Core + Booking Page**. `scheduling_routes.py` (availability settings, appointment-type CRUD, public booking slot computation with double-booking prevention + buffers + exceptions + vacation + min-notice + timezone, enhanced appointment ops: status/notes/reschedule/cancel + activity log). Frontend AppointmentsHub tabs (Appointments/Availability/Types/Booking Page) + public `/book/:slug` page + AppointmentDetailDrawer. 10/10 backend pytest + desktop UI pass (iteration_17). No regression to existing appointment channels.
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
