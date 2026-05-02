"""BotNira — Email channel routes (IMAP poll + SMTP outbound).

Extracted from server.py on 2026-04-27 to start splitting the monolith.
The module exposes:
  • `router`              — APIRouter with all `/email/...` endpoints (mounted under /api).
  • `_start_email_poller` — coroutine to register on FastAPI startup.

Vendor pastes their own email + app password (Gmail/Outlook/Zoho/IMAP).
We poll their inbox every 60 s, drop new messages into the unified inbox
under channel="email", and (if AI auto-reply is on) reply via SMTP from
the vendor's own address — preserving threading via In-Reply-To headers.

Constraints:
  - Text-only at MVP (attachments skipped).
  - One inbox per vendor.
  - Replies always go from the vendor's own address (customer trust).
  - 1 outbound email = 1 message debited from messages_balance.
"""
import os
import asyncio
import imaplib
import smtplib
import re as _re_email
import base64 as _b64
import hashlib as _hashlib
import email as _email_lib
import email.policy as _email_policy
from email.header import decode_header, make_header
from email.utils import parseaddr, formataddr, make_msgid, formatdate
from email.message import EmailMessage
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from cryptography.fernet import Fernet, InvalidToken

# Server-level helpers / globals are imported lazily inside functions to
# avoid the circular import (server.py imports this module at the bottom).
import server as _s


router = APIRouter()


EMAIL_POLL_INTERVAL_SEC = int(os.environ.get("EMAIL_POLL_INTERVAL_SEC", "60"))
EMAIL_FETCH_BATCH = 25  # max emails fetched per poll per vendor

# Common provider auto-detect — saves the vendor from typing IMAP/SMTP hosts.
EMAIL_PROVIDER_PRESETS = {
    "gmail.com":     {"imap": ("imap.gmail.com", 993), "smtp": ("smtp.gmail.com", 587)},
    "googlemail.com":{"imap": ("imap.gmail.com", 993), "smtp": ("smtp.gmail.com", 587)},
    "outlook.com":   {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587)},
    "hotmail.com":   {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587)},
    "live.com":      {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587)},
    "office365.com": {"imap": ("outlook.office365.com", 993), "smtp": ("smtp.office365.com", 587)},
    "yahoo.com":     {"imap": ("imap.mail.yahoo.com", 993), "smtp": ("smtp.mail.yahoo.com", 587)},
    "zoho.com":      {"imap": ("imap.zoho.com", 993), "smtp": ("smtp.zoho.com", 587)},
    "icloud.com":    {"imap": ("imap.mail.me.com", 993), "smtp": ("smtp.mail.me.com", 587)},
    "me.com":        {"imap": ("imap.mail.me.com", 993), "smtp": ("smtp.mail.me.com", 587)},
}


# ----- Crypto helpers -----
def _email_fernet() -> Fernet:
    """Stable Fernet key derived from JWT_SECRET — no new env var required."""
    digest = _hashlib.sha256(_s.JWT_SECRET.encode("utf-8")).digest()
    return Fernet(_b64.urlsafe_b64encode(digest))


def _enc_password(plaintext: str) -> str:
    return _email_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def _dec_password(ciphertext: str) -> str:
    try:
        return _email_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""


def _email_provider_for(addr: str) -> Optional[dict]:
    """Return preset hosts for known providers, else None."""
    domain = (addr.split("@", 1)[-1] or "").lower().strip()
    return EMAIL_PROVIDER_PRESETS.get(domain)


def _decode_header_str(raw) -> str:
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        return str(raw)


def _strip_html(html: str) -> str:
    """Cheap HTML→text: drop tags, collapse whitespace. Used as fallback when no text/plain part."""
    text = _re_email.sub(r"<\s*br\s*/?\s*>", "\n", html, flags=_re_email.I)
    text = _re_email.sub(r"<\s*/p\s*>", "\n\n", text, flags=_re_email.I)
    text = _re_email.sub(r"<[^>]+>", "", text)
    for ent, ch in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")]:
        text = text.replace(ent, ch)
    return _re_email.sub(r"\n{3,}", "\n\n", text).strip()


def _extract_bodies(msg):
    """Returns (plain_text, html_or_None). Prefers a clean text/plain part, but also
    captures the raw HTML body when present so the frontend can render it."""
    plain = ""
    html = None
    if msg.is_multipart():
        for part in msg.walk():
            disp = str(part.get("Content-Disposition", ""))
            if "attachment" in disp:
                continue
            ctype = part.get_content_type()
            if ctype == "text/plain" and not plain:
                try:
                    plain = (part.get_content() or "").strip()
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    plain = payload.decode(part.get_content_charset() or "utf-8", errors="replace").strip()
            elif ctype == "text/html" and not html:
                try:
                    html = part.get_content()
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    html = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        ctype = msg.get_content_type()
        try:
            content = msg.get_content()
        except Exception:
            payload = msg.get_payload(decode=True) or b""
            content = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
        if ctype == "text/html":
            html = content
        else:
            plain = (content or "").strip()
    if not plain and html:
        plain = _strip_html(html)
    return plain, html


def _strip_quoted_reply(body: str) -> str:
    """Trim the customer's quoted history so AI doesn't re-ingest its own previous replies."""
    if not body:
        return ""
    lines = body.splitlines()
    cut = len(lines)
    markers = ("On ", "Le ", "El ", "Am ", "在 ")  # locale-specific reply headers
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith(">"):
            cut = i; break
        if s.startswith("-----Original Message-----"):
            cut = i; break
        if "wrote:" in s and any(s.startswith(m) for m in markers):
            cut = i; break
        if i > 0 and s.lower().startswith("from:") and "@" in s:
            cut = i; break
    return "\n".join(lines[:cut]).strip()


# ----- DB helpers -----
async def _get_email_connection(vendor_id: str) -> Optional[dict]:
    return await _s.db.email_connections.find_one({"vendor_id": vendor_id}, {"_id": 0})


def _public_conn(conn: dict) -> dict:
    """Strip the encrypted password from API responses."""
    if not conn:
        return {}
    return {k: v for k, v in conn.items() if k != "password_encrypted"}


# ----- IMAP poller -----
def _imap_fetch_unseen(conn: dict) -> List[dict]:
    """Synchronous IMAP fetch — runs in a worker thread.

    **UID-based watermark**: we only ever fetch messages whose UID is STRICTLY
    GREATER than `conn['last_uid']` (the INBOX's UIDNEXT captured on connect).
    This is bulletproof — unlike \\Seen flags, UIDs never change and are only
    ever assigned in increasing order as new mail arrives, so we can never
    accidentally re-ingest historical emails even if:
      - Gmail re-marks an old message unread
      - a label/archive move changes the \\Seen state
      - IMAP server races our mark-as-read on a previous poll

    Returns up to EMAIL_FETCH_BATCH new messages. Advances last_uid on success.
    """
    pwd = _dec_password(conn["password_encrypted"])
    if not pwd:
        return []
    out: List[dict] = []
    new_high_uid = conn.get("last_uid") or 0
    try:
        M = imaplib.IMAP4_SSL(conn["imap_host"], conn.get("imap_port", 993), timeout=20)
        M.login(conn["email_address"], pwd)
        try:
            M.select("INBOX", readonly=False)
            since_uid = int(conn.get("last_uid") or 0)
            # UID SEARCH UID {since+1}:* → every message with UID > since
            search_range = f"{since_uid + 1}:*".encode() if since_uid else b"1:*"
            typ, data = M.uid("SEARCH", None, "UID", search_range)
            if typ != "OK" or not data or not data[0]:
                return []
            uids = data[0].split()
            if not uids:
                return []
            # IMAP servers reply with at least one result even when the range
            # matches nothing — discard UIDs at/below the watermark.
            uids = [u for u in uids if int(u) > since_uid][:EMAIL_FETCH_BATCH]
            if not uids:
                return []
            for uid in uids:
                typ, msg_data = M.uid("FETCH", uid, "(RFC822)")
                if typ != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                msg = _email_lib.message_from_bytes(raw, policy=_email_policy.default)
                from_name, from_email = parseaddr(_decode_header_str(msg.get("From", "")))
                subject = _decode_header_str(msg.get("Subject", ""))
                message_id = (msg.get("Message-ID") or "").strip()
                in_reply_to = (msg.get("In-Reply-To") or "").strip()
                references = (msg.get("References") or "").strip()
                body, html_body = _extract_bodies(msg)
                trimmed = _strip_quoted_reply(body)
                uid_int = int(uid)
                if uid_int > new_high_uid:
                    new_high_uid = uid_int
                out.append({
                    "uid": uid.decode() if isinstance(uid, bytes) else str(uid),
                    "uid_int": uid_int,
                    "from_email": (from_email or "").lower().strip(),
                    "from_name": (from_name or "").strip() or (from_email or ""),
                    "subject": subject,
                    "body": trimmed or body,
                    "body_html": html_body,
                    "message_id": message_id,
                    "in_reply_to": in_reply_to,
                    "references": references,
                })
                # Also mark \Seen so the mailbox UI looks clean, but this is
                # cosmetic — watermark above is what prevents re-ingestion.
                try:
                    M.uid("STORE", uid, "+FLAGS", "(\\Seen)")
                except Exception:
                    pass
        finally:
            try: M.close()
            except Exception: pass
            try: M.logout()
            except Exception: pass
    except Exception as e:
        _s.logger.warning("[email poll] IMAP error for %s: %s", conn.get("email_address"), e)
        return []
    # Stamp the new watermark (outside the M ctx) only when we actually
    # consumed something — lets the caller know the high-water mark.
    if new_high_uid > (conn.get("last_uid") or 0):
        # Mutate the dict so _email_poll_once can persist it
        conn["_new_last_uid"] = new_high_uid
    return out


def _smtp_send_email_sync(conn: dict, to_email: str, subject: str, body_text: str,
                          in_reply_to: Optional[str], references: Optional[str]) -> Optional[str]:
    """Synchronous SMTP send. Returns the new Message-ID on success."""
    pwd = _dec_password(conn["password_encrypted"])
    if not pwd:
        return None
    try:
        msg = EmailMessage()
        msg["From"] = formataddr((_s.SMTP_FROM_NAME, conn["email_address"]))
        msg["To"] = to_email
        msg["Subject"] = subject or "Re: your message"
        new_mid = make_msgid(domain=conn["email_address"].split("@", 1)[-1])
        msg["Message-ID"] = new_mid
        msg["Date"] = formatdate(localtime=True)
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
            msg["References"] = (references + " " + in_reply_to).strip() if references else in_reply_to
        msg.set_content(body_text or "")
        
        # Use SSL (port 465) or TLS (port 587) based on port
        smtp_port = conn.get("smtp_port", 587)
        if smtp_port == 465:
            # Port 465 requires direct SSL connection
            with smtplib.SMTP_SSL(conn["smtp_host"], smtp_port, timeout=20) as s:
                s.login(conn["email_address"], pwd)
                s.send_message(msg)
        else:
            # Port 587 (or others) use STARTTLS
            with smtplib.SMTP(conn["smtp_host"], smtp_port, timeout=20) as s:
                s.starttls()
                s.login(conn["email_address"], pwd)
                s.send_message(msg)
        return new_mid
    except Exception as e:
        _s.logger.warning("[email send] SMTP error for %s → %s: %s", conn.get("email_address"), to_email, e)
        return None


async def _email_send_async(conn: dict, to_email: str, subject: str, body_text: str,
                            in_reply_to: Optional[str], references: Optional[str]) -> Optional[str]:
    return await asyncio.to_thread(
        _smtp_send_email_sync, conn, to_email, subject, body_text, in_reply_to, references
    )


_BOUNCE_FROM_RE = _re_email.compile(r"(mailer-daemon|postmaster|mail-daemon)", _re_email.I)
_BOUNCE_SUBJECT_RE = _re_email.compile(
    r"(mail delivery failed|undeliver|delivery status notification|"
    r"returned mail|failure notice|could not be delivered|rejected)",
    _re_email.I,
)
_FAILED_ADDR_RE = _re_email.compile(
    r"(?:failed(?:\s+address)?|rcpt\s*to|recipient(?:\s+address)?|"
    r"could not be delivered to|bounced address)[:\s<]*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})",
    _re_email.I,
)
_ANY_EMAIL_RE = _re_email.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", _re_email.I)


async def _maybe_record_sales_bounce(vendor_id: str, parsed: dict) -> bool:
    """Detect a DSN bounce from the inbound email, flag the matching
    sales campaign recipient as 'bounced', and return True if handled
    (so the caller skips persisting it in the vendor inbox).

    Matching is best-effort: find the most recent sent recipient for
    this vendor whose email appears in the bounce body within the last
    14 days."""
    from_email = (parsed.get("from_email") or "").lower()
    subject = parsed.get("subject") or ""
    body = parsed.get("body") or parsed.get("body_html") or ""
    looks_like_bounce = (
        _BOUNCE_FROM_RE.search(from_email) is not None
        or _BOUNCE_SUBJECT_RE.search(subject) is not None
    )
    if not looks_like_bounce:
        return False

    # Try to extract the failed recipient
    failed = None
    m = _FAILED_ADDR_RE.search(body)
    if m:
        failed = m.group(1).lower()
    else:
        # Fallback — any email address in the body that isn't the vendor's own
        from_parts = [a.lower() for a in _ANY_EMAIL_RE.findall(body)]
        vendor_conn = await _s.db.email_connections.find_one(
            {"vendor_id": vendor_id}, {"_id": 0, "email_address": 1}
        )
        own = (vendor_conn or {}).get("email_address", "").lower()
        for a in from_parts:
            if a != own and not a.endswith(".example") and "noreply" not in a:
                failed = a
                break

    if not failed:
        _s.logger.info("[sales bounce] detected DSN but no target email extracted (vendor=%s)", vendor_id)
        return True  # still consume it — vendor doesn't need bounce notices in inbox

    # Flag recent campaign recipient
    from datetime import datetime, timedelta, timezone
    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    recent = await _s.db.sales_campaign_recipients.find_one(
        {"vendor_id": vendor_id, "email": failed, "status": {"$in": ["sent", "opened"]},
         "sent_at": {"$gte": since}},
        {"_id": 0}, sort=[("sent_at", -1)],
    )
    if recent:
        await _s.db.sales_campaign_recipients.update_one(
            {"id": recent["id"]},
            {"$set": {"status": "bounced", "bounced_at": _s.now_iso(),
                      "bounce_reason": (subject[:200] or "DSN received")}},
        )
        await _s.db.sales_campaigns.update_one(
            {"id": recent["campaign_id"]},
            {"$inc": {"sent_count": -1, "failed_count": 1},
             "$set": {"updated_at": _s.now_iso()}},
        )
    # Always mark the prospect itself as bounced going forward
    await _s.db.sales_prospects.update_one(
        {"vendor_id": vendor_id, "email": failed},
        {"$set": {"status": "bounced", "updated_at": _s.now_iso()}},
    )
    _s.logger.info("[sales bounce] vendor=%s flagged %s as bounced", vendor_id, failed)
    return True


async def _process_inbound_email(conn: dict, parsed: dict):
    """Persist one inbound email + optionally generate AI reply."""
    vendor_id = conn["vendor_id"]
    from_email = parsed["from_email"]
    if not from_email or from_email == conn["email_address"].lower():
        return  # ignore self-sends / bounces with no sender
    msg_id = parsed.get("message_id") or ""

    # If this is a Delivery Status Notification (bounce), flag the
    # corresponding sales-campaign recipient and DO NOT surface it in the
    # vendor's inbox (reduces noise).
    if await _maybe_record_sales_bounce(vendor_id, parsed):
        return

    # Idempotency — already saved this Message-ID for this vendor?
    if msg_id:
        existing = await _s.db.messages.find_one(
            {"vendor_id": vendor_id, "external_id": msg_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return

    # Find or create conversation by sender email + channel
    conv = await _s.db.conversations.find_one(
        {"vendor_id": vendor_id, "channel": "email", "customer_contact": from_email},
        {"_id": 0},
    )
    conv = conv or await _s._ensure_conversation(
        vendor_id, None, "email", parsed["from_name"] or from_email, from_email
    )
    if parsed.get("subject") and not conv.get("subject"):
        await _s.db.conversations.update_one(
            {"id": conv["id"]}, {"$set": {"subject": parsed["subject"]}}
        )

    body = (parsed.get("body") or "").strip()
    if not body:
        body = parsed.get("subject") or "(empty email)"
    extra = {}
    if parsed.get("body_html"):
        extra["body_html"] = parsed["body_html"]
    if parsed.get("subject"):
        extra["subject"] = parsed["subject"]
    await _s._push_message(conv["id"], vendor_id, "user", body, external_id=msg_id or None, extra=extra)

    await _s.db.email_connections.update_one(
        {"vendor_id": vendor_id},
        {"$inc": {"total_received": 1}, "$set": {"last_polled_at": _s.now_iso()}},
    )

    if not conn.get("ai_auto_reply", True):
        return
    ok, reason = await _s._vendor_can_use_channel(vendor_id, "email")
    if not ok:
        _s.logger.info("[email] auto-reply skipped for vendor=%s — %s", vendor_id, reason)
        return
    try:
        reply = await _s.get_ai_reply(vendor_id, conv["id"], body)
    except Exception as e:
        _s.logger.exception("[email] AI reply failed: %s", e)
        return

    subject = parsed.get("subject") or "Re: your message"
    if not subject.lower().startswith("re:"):
        subject = "Re: " + subject

    new_mid = await _email_send_async(
        conn, from_email, subject, reply,
        in_reply_to=msg_id or None,
        references=parsed.get("references") or msg_id or None,
    )
    if new_mid:
        await _s._push_message(conv["id"], vendor_id, "bot", reply, external_id=new_mid)
        await _s.db.email_connections.update_one(
            {"vendor_id": vendor_id}, {"$inc": {"total_sent": 1}}
        )
        await _s._decrement_message_balance(vendor_id)
        try:
            await _s._maybe_book_appointment(vendor_id, conv["id"], reply)
        except Exception:
            pass
    else:
        _s.logger.warning("[email] AI reply could not be sent (vendor=%s)", vendor_id)


async def _email_poll_once():
    """Single pass over all enabled email connections."""
    cursor = _s.db.email_connections.find({"enabled": True}, {"_id": 0})
    async for conn in cursor:
        try:
            messages = await asyncio.to_thread(_imap_fetch_unseen, conn)
            for parsed in messages:
                await _process_inbound_email(conn, parsed)
            updates = {"last_polled_at": _s.now_iso()}
            # Persist the new UID watermark (set by _imap_fetch_unseen when it
            # consumed one or more messages). This is the canonical
            # "don't-re-ingest-past-this-point" pointer.
            if conn.get("_new_last_uid"):
                updates["last_uid"] = int(conn["_new_last_uid"])
            await _s.db.email_connections.update_one(
                {"vendor_id": conn["vendor_id"]},
                {"$set": updates},
            )
        except Exception as e:
            _s.logger.warning("[email poll] vendor=%s error: %s", conn.get("vendor_id"), e)


async def _email_poller_loop():
    """Background task. Started on app startup."""
    await asyncio.sleep(10)  # let startup settle
    while True:
        try:
            await _email_poll_once()
        except Exception as e:
            _s.logger.exception("[email poll loop] %s", e)
        await asyncio.sleep(EMAIL_POLL_INTERVAL_SEC)


async def _start_email_poller():
    """Registered on app startup by server.py."""
    if os.environ.get("EMAIL_POLLER_DISABLED") == "1":
        _s.logger.info("[email] poller disabled by env")
        return
    asyncio.create_task(_email_poller_loop())
    _s.logger.info("[email] poller started (every %ss)", EMAIL_POLL_INTERVAL_SEC)


# ----- Endpoints -----
class EmailConnectReq(BaseModel):
    email_address: EmailStr
    password: str
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    # Default OFF so vendors review what BotNira drafts before going hands-off.
    ai_auto_reply: Optional[bool] = False
    # When True, wipes any previously-ingested email conversations for this
    # vendor before arming the new UID watermark. Useful when reconnecting
    # after the old SEARCH-UNSEEN poller had pulled historical mail.
    fresh_start: Optional[bool] = False


def _verify_imap_smtp_sync(email_address: str, password: str,
                           imap_host: str, imap_port: int,
                           smtp_host: str, smtp_port: int,
                           skip_existing: bool = True) -> Dict[str, Any]:
    """Hits both IMAP + SMTP. Returns {ok, error?, imap_ok, smtp_ok, marked_seen, initial_uidnext}.

    `initial_uidnext` is the INBOX's UIDNEXT at connect time — stored as the
    watermark so the poller only ever fetches messages whose UID >= that
    number. Emails already in the inbox (historical mail) are untouched and
    never ingested — the bulletproof "new-mail-only" guarantee.
    """
    out = {"ok": False, "imap_ok": False, "smtp_ok": False, "error": None, "marked_seen": 0, "initial_uidnext": 0}
    try:
        M = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=15)
        M.login(email_address, password)
        try:
            # Capture UIDNEXT BEFORE selecting the mailbox — STATUS is safe on
            # unselected folders and some servers reject STATUS on the currently
            # selected folder. This is the MOST RELIABLE path.
            uid_next = 0
            try:
                typ0, st = M.status("INBOX", "(UIDNEXT)")
                if typ0 == "OK" and st and st[0]:
                    import re as _re
                    m = _re.search(rb"UIDNEXT\s+(\d+)", st[0])
                    if m:
                        uid_next = int(m.group(1))
            except Exception:
                pass

            M.select("INBOX", readonly=False)
            # Fallback #1: pull UIDNEXT from SELECT's untagged response.
            if not uid_next:
                try:
                    typ1, data1 = M.response("UIDNEXT")
                    if data1 and data1[0]:
                        uid_next = int(data1[0])
                except Exception:
                    pass
            # Fallback #2: SEARCH ALL and take max UID. Guarantees a watermark
            # even if UIDNEXT is unavailable on the server.
            if not uid_next:
                try:
                    typ2, data2 = M.uid("SEARCH", None, "ALL")
                    if typ2 == "OK" and data2 and data2[0]:
                        uids = [int(u) for u in data2[0].split() if u.isdigit()]
                        if uids:
                            uid_next = max(uids) + 1
                except Exception:
                    pass

            # UIDNEXT is "the next UID that WILL be assigned" — anything
            # already in the mailbox has UID < UIDNEXT. So we subtract 1 so
            # that the poller's `UID > watermark` search picks up anything
            # arriving from UIDNEXT onwards. If we still have 0, the mailbox
            # might be empty OR the server is exotic — either way a 0
            # watermark is safe because any new email gets UID >= 1.
            out["initial_uidnext"] = max(0, uid_next - 1) if uid_next else 0

            if skip_existing:
                # Cosmetic: flag all current UNSEEN as Seen so the vendor's
                # Gmail inbox doesn't keep showing a huge unread count. This
                # is NOT what prevents re-ingestion (UID watermark does).
                typ, data = M.search(None, "UNSEEN")
                if typ == "OK" and data and data[0]:
                    uids = data[0].split()
                    if uids:
                        uid_set = b",".join(uids)
                        try:
                            M.store(uid_set, "+FLAGS", "(\\Seen)")
                            out["marked_seen"] = len(uids)
                        except Exception:
                            pass
        finally:
            try: M.logout()
            except Exception: pass
        out["imap_ok"] = True
    except imaplib.IMAP4.error as e:
        out["error"] = f"IMAP login failed: {e}"
        return out
    except Exception as e:
        out["error"] = f"IMAP connection error: {e}"
        return out
    
    # SMTP verification - use SSL for port 465, STARTTLS for others
    try:
        if smtp_port == 465:
            # Port 465 requires direct SSL connection
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as s:
                s.login(email_address, password)
        else:
            # Port 587 (or others) use STARTTLS
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
                s.starttls()
                s.login(email_address, password)
        out["smtp_ok"] = True
    except smtplib.SMTPAuthenticationError as e:
        out["error"] = f"SMTP login failed: {e.smtp_error.decode('utf-8', errors='replace') if isinstance(e.smtp_error, bytes) else e}"
        return out
    except Exception as e:
        out["error"] = f"SMTP connection error: {e}"
        return out
    out["ok"] = True
    return out


def _resolve_email_hosts(req: EmailConnectReq) -> Dict[str, Any]:
    preset = _email_provider_for(req.email_address) or {}
    imap_host = req.imap_host or preset.get("imap", (None, None))[0]
    imap_port = req.imap_port or preset.get("imap", (None, 993))[1] or 993
    smtp_host = req.smtp_host or preset.get("smtp", (None, None))[0]
    smtp_port = req.smtp_port or preset.get("smtp", (None, 587))[1] or 587
    return {"imap_host": imap_host, "imap_port": imap_port, "smtp_host": smtp_host, "smtp_port": smtp_port}


@router.post("/connect")
async def email_connect(req: EmailConnectReq, user: dict = Depends(_s.require_vendor)):
    """Vendor saves their email + app password. We test IMAP + SMTP before saving."""
    hosts = _resolve_email_hosts(req)
    if not hosts["imap_host"] or not hosts["smtp_host"]:
        raise HTTPException(
            status_code=400,
            detail="Couldn't auto-detect IMAP/SMTP hosts for this domain. Please enter them manually under Advanced.",
        )
    verify = await asyncio.to_thread(
        _verify_imap_smtp_sync,
        req.email_address, req.password,
        hosts["imap_host"], hosts["imap_port"],
        hosts["smtp_host"], hosts["smtp_port"],
        True,  # skip_existing
    )
    if not verify["ok"]:
        raise HTTPException(status_code=400, detail=verify.get("error") or "Email login failed")

    record = {
        "id": _s.new_id(),
        "vendor_id": user["vendor_id"],
        "email_address": req.email_address.lower(),
        "imap_host": hosts["imap_host"],
        "imap_port": hosts["imap_port"],
        "smtp_host": hosts["smtp_host"],
        "smtp_port": hosts["smtp_port"],
        "password_encrypted": _enc_password(req.password),
        "ai_auto_reply": bool(req.ai_auto_reply if req.ai_auto_reply is not None else False),
        "enabled": True,
        "total_received": 0,
        "total_sent": 0,
        "last_polled_at": None,
        # UID watermark — poller never fetches mail at/below this value.
        # `initial_uidnext` is (server UIDNEXT - 1), i.e. the highest UID
        # currently in the mailbox. Anything new gets a higher UID.
        "last_uid": int(verify.get("initial_uidnext") or 0),
        "connected_at": _s.now_iso(),
        "created_at": _s.now_iso(),
    }
    await _s.db.email_connections.update_one(
        {"vendor_id": user["vendor_id"]}, {"$set": record}, upsert=True,
    )
    await _s.db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "email"},
        {"$set": {"status": "connected", "updated_at": _s.now_iso()}},
        upsert=True,
    )
    # Optional fresh-start wipe — the vendor can explicitly ask the reconnect
    # to also wipe any stale email threads ingested from a previous connect.
    # Triggered via payload.fresh_start=True (frontend sends this on "Reconnect
    # fresh" action). Non-destructive by default.
    cleared = 0
    if req.fresh_start:
        email_convs = await _s.db.conversations.find(
            {"vendor_id": user["vendor_id"], "channel": "email"}, {"_id": 0, "id": 1}
        ).to_list(10000)
        conv_ids = [c["id"] for c in email_convs]
        if conv_ids:
            await _s.db.messages.delete_many({"conversation_id": {"$in": conv_ids}})
            await _s.db.appointments.delete_many({"conversation_id": {"$in": conv_ids}})
        r = await _s.db.conversations.delete_many(
            {"vendor_id": user["vendor_id"], "channel": "email"}
        )
        cleared = r.deleted_count
    return {
        "ok": True,
        "connection": _public_conn(record),
        "skipped_old": verify.get("marked_seen", 0),
        "cleared_history": cleared,
        "initial_uid": record["last_uid"],
    }


@router.get("/status")
async def email_status(user: dict = Depends(_s.require_vendor)):
    conn = await _get_email_connection(user["vendor_id"])
    if not conn:
        return {"connected": False}
    return {"connected": True, "connection": _public_conn(conn)}


@router.put("/settings")
async def email_settings(payload: Dict[str, Any], user: dict = Depends(_s.require_vendor)):
    updates: Dict[str, Any] = {}
    if "ai_auto_reply" in payload:
        updates["ai_auto_reply"] = bool(payload["ai_auto_reply"])
    if "enabled" in payload:
        updates["enabled"] = bool(payload["enabled"])
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await _s.db.email_connections.update_one(
        {"vendor_id": user["vendor_id"]}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No email connection found")
    return {"ok": True, "updates": updates}


@router.post("/disconnect")
async def email_disconnect(user: dict = Depends(_s.require_vendor)):
    await _s.db.email_connections.delete_one({"vendor_id": user["vendor_id"]})
    await _s.db.channels.update_one(
        {"vendor_id": user["vendor_id"], "channel": "email"},
        {"$set": {"status": "disconnected", "updated_at": _s.now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/clear-history")
async def email_clear_history(user: dict = Depends(_s.require_vendor)):
    """Wipe all email conversations + messages for this vendor. Useful when
    switching from the old SEARCH-UNSEEN poller to UID-based polling — lets
    the vendor start from a clean inbox without the historical ingested mail.

    Destructive: deletes email conversations, their messages, and any
    appointments created from them. Other channels untouched."""
    vid = user["vendor_id"]
    # Find all email conversations for this vendor.
    email_convs = await _s.db.conversations.find(
        {"vendor_id": vid, "channel": "email"}, {"_id": 0, "id": 1}
    ).to_list(10000)
    conv_ids = [c["id"] for c in email_convs]
    msg_deleted = 0
    appt_deleted = 0
    if conv_ids:
        r1 = await _s.db.messages.delete_many({"conversation_id": {"$in": conv_ids}})
        msg_deleted = r1.deleted_count
        # Best-effort appointment cleanup (only email-sourced ones).
        r2 = await _s.db.appointments.delete_many({"conversation_id": {"$in": conv_ids}})
        appt_deleted = r2.deleted_count
    r3 = await _s.db.conversations.delete_many({"vendor_id": vid, "channel": "email"})
    # Reset received/sent counters so the panel doesn't keep the stale totals.
    await _s.db.email_connections.update_one(
        {"vendor_id": vid},
        {"$set": {"total_received": 0, "total_sent": 0}},
    )
    _s.logger.info(
        "[email] cleared history vendor=%s convs=%s msgs=%s appts=%s",
        vid, r3.deleted_count, msg_deleted, appt_deleted,
    )
    return {
        "ok": True,
        "deleted": {
            "conversations": r3.deleted_count,
            "messages": msg_deleted,
            "appointments": appt_deleted,
        },
    }


@router.post("/draft-reply")
async def email_draft_reply(payload: Dict[str, str], user: dict = Depends(_s.require_vendor)):
    """Generate an AI reply for an email conversation WITHOUT sending it."""
    conv_id = payload.get("conversation_id")
    if not conv_id:
        raise HTTPException(status_code=400, detail="conversation_id required")
    conv = await _s.db.conversations.find_one(
        {"id": conv_id, "vendor_id": user["vendor_id"], "channel": "email"}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Email conversation not found")
    last_user = await _s.db.messages.find_one(
        {"conversation_id": conv_id, "role": "user"},
        sort=[("created_at", -1)], projection={"_id": 0, "content": 1},
    )
    if not last_user:
        raise HTTPException(status_code=400, detail="No customer message to reply to.")
    try:
        reply = await _s.get_ai_reply(user["vendor_id"], conv_id, last_user.get("content", ""))
    except Exception as e:
        _s.logger.exception("[email] draft-reply failed: %s", e)
        raise HTTPException(status_code=502, detail="AI couldn't generate a reply right now.")
    return {"ok": True, "draft": reply}


@router.post("/poll-now")
async def email_poll_now(user: dict = Depends(_s.require_vendor)):
    conn = await _get_email_connection(user["vendor_id"])
    if not conn or not conn.get("enabled"):
        raise HTTPException(status_code=400, detail="Email is not connected")
    messages = await asyncio.to_thread(_imap_fetch_unseen, conn)
    for parsed in messages:
        await _process_inbound_email(conn, parsed)
    updates: Dict[str, Any] = {"last_polled_at": _s.now_iso()}
    if conn.get("_new_last_uid"):
        updates["last_uid"] = int(conn["_new_last_uid"])
    await _s.db.email_connections.update_one(
        {"vendor_id": user["vendor_id"]}, {"$set": updates}
    )
    return {"ok": True, "fetched": len(messages)}


@router.post("/send")
async def email_send(payload: Dict[str, str], user: dict = Depends(_s.require_vendor)):
    """Live-agent override: vendor types a reply in the inbox, we send it via SMTP."""
    conv_id = payload.get("conversation_id")
    text = (payload.get("text") or "").strip()
    if not conv_id or not text:
        raise HTTPException(status_code=400, detail="conversation_id and text required")
    conv = await _s.db.conversations.find_one(
        {"id": conv_id, "vendor_id": user["vendor_id"], "channel": "email"}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Email conversation not found")
    conn = await _get_email_connection(user["vendor_id"])
    if not conn or not conn.get("enabled"):
        raise HTTPException(status_code=400, detail="Email channel not connected")
    ok, reason = await _s._vendor_can_use_channel(user["vendor_id"], "email")
    if not ok:
        raise HTTPException(status_code=402, detail=reason or "Email not available on your plan")
    last_user = await _s.db.messages.find_one(
        {"conversation_id": conv_id, "role": "user", "external_id": {"$ne": None}},
        sort=[("created_at", -1)], projection={"_id": 0, "external_id": 1},
    )
    in_reply_to = last_user.get("external_id") if last_user else None
    subject = conv.get("subject") or "Re: your message"
    if not subject.lower().startswith("re:"):
        subject = "Re: " + subject

    new_mid = await _email_send_async(
        conn, conv["customer_contact"], subject, text,
        in_reply_to=in_reply_to, references=in_reply_to,
    )
    if not new_mid:
        raise HTTPException(status_code=502, detail="Email could not be sent — check your IMAP/SMTP credentials.")
    await _s._push_message(conv_id, user["vendor_id"], "agent", text, external_id=new_mid)
    await _s.db.email_connections.update_one(
        {"vendor_id": user["vendor_id"]}, {"$inc": {"total_sent": 1}}
    )
    await _s._decrement_message_balance(user["vendor_id"])
    return {"ok": True}


