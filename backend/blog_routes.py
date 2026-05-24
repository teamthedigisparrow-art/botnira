"""BotNira Blog — SEO blog module with admin CMS + public reader. Featured
images and inline images live in Emergent object storage; the blog body itself
is stored as Markdown so it stays diff-friendly and easy to edit."""
from __future__ import annotations

import os
import re
import io
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from server import db, require_admin, new_id, now_iso, slugify, logger  # type: ignore

router = APIRouter()         # /api/blogs/*  (public + auth)
admin_router = APIRouter()   # /api/admin/blogs/*

APP_NAME = "botnira"
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

_storage_key: Optional[str] = None
MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
}
ALLOWED_IMG_EXT = set(MIME_TYPES.keys())
MAX_IMG_BYTES = 6 * 1024 * 1024  # 6 MB hard cap per upload


# ---------------------------------------------------------------------------
# Object storage helpers (session-scoped key, init once)
# ---------------------------------------------------------------------------
def init_storage() -> Optional[str]:
    """Idempotent. Returns the session storage_key, or None if EMERGENT_LLM_KEY
    is missing (graceful fallback so the app boots even in dev)."""
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set — blog image uploads disabled")
        return None
    try:
        r = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        logger.info("Blog object storage initialised")
        return _storage_key
    except Exception as e:
        logger.error("Storage init failed: %s", e)
        return None


def _put_object(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Image storage unavailable")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    # If the session key expired, re-init once and retry.
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        if key:
            r = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data, timeout=120,
            )
    r.raise_for_status()
    return r.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Image storage unavailable")
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = init_storage()
        if key:
            r = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key}, timeout=60,
            )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Image not found")
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class BlogCreateReq(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    slug: Optional[str] = None
    subtitle: str = Field(default="", max_length=400)
    excerpt: str = Field(default="", max_length=400)
    body_markdown: str = Field(default="", max_length=120_000)
    featured_image_url: str = Field(default="", max_length=600)
    author_name: str = Field(default="BotNira Team", max_length=120)
    tags: List[str] = []
    status: str = Field(default="draft", pattern="^(draft|active|inactive)$")
    seo_title: str = Field(default="", max_length=200)
    seo_description: str = Field(default="", max_length=400)
    seo_keywords: str = Field(default="", max_length=400)


class BlogUpdateReq(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=240)
    slug: Optional[str] = None
    subtitle: Optional[str] = Field(default=None, max_length=400)
    excerpt: Optional[str] = Field(default=None, max_length=400)
    body_markdown: Optional[str] = Field(default=None, max_length=120_000)
    featured_image_url: Optional[str] = None
    author_name: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = Field(default=None, pattern="^(draft|active|inactive)$")
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _unique_slug(base: str, current_id: Optional[str] = None) -> str:
    """Returns a unique slug. If `base` already exists on a different blog,
    appends a numeric suffix."""
    base = slugify(base) if base else "post"
    base = re.sub(r"-+", "-", base).strip("-") or "post"
    base = base[:80]
    candidate = base
    n = 2
    while True:
        clash = await db.blogs.find_one({"slug": candidate}, {"_id": 0, "id": 1})
        if not clash or (current_id and clash["id"] == current_id):
            return candidate
        candidate = f"{base}-{n}"
        n += 1


def _serialise(b: Dict[str, Any], with_body: bool = True) -> Dict[str, Any]:
    out = {
        "id": b.get("id"),
        "slug": b.get("slug"),
        "title": b.get("title", ""),
        "subtitle": b.get("subtitle", ""),
        "excerpt": b.get("excerpt", ""),
        "featured_image_url": b.get("featured_image_url", ""),
        "author_name": b.get("author_name", "BotNira Team"),
        "tags": b.get("tags") or [],
        "status": b.get("status", "draft"),
        "view_count": b.get("view_count", 0),
        "seo_title": b.get("seo_title", ""),
        "seo_description": b.get("seo_description", ""),
        "seo_keywords": b.get("seo_keywords", ""),
        "published_at": b.get("published_at"),
        "created_at": b.get("created_at"),
        "updated_at": b.get("updated_at"),
    }
    if with_body:
        out["body_markdown"] = b.get("body_markdown", "")
    return out


# ===========================================================================
# Public endpoints  (mounted at /api/blogs/*)
# ===========================================================================
@router.get("")
async def list_public_blogs(
    limit: int = Query(50, ge=1, le=100),
    tag: Optional[str] = None,
):
    """Returns active blogs only, newest first. Body is omitted from the list
    response to keep payloads small — fetch the slug endpoint for full body."""
    q: Dict[str, Any] = {"status": "active"}
    if tag:
        q["tags"] = tag
    rows = await db.blogs.find(q, {"_id": 0}).sort("published_at", -1).limit(limit).to_list(limit)
    return {"blogs": [_serialise(r, with_body=False) for r in rows]}


@router.get("/by-slug/{slug}")
async def get_public_blog(slug: str):
    """Public read for a single blog. Increments view_count atomically."""
    blog = await db.blogs.find_one({"slug": slug, "status": "active"}, {"_id": 0})
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")
    await db.blogs.update_one({"id": blog["id"]}, {"$inc": {"view_count": 1}})
    blog["view_count"] = (blog.get("view_count", 0) or 0) + 1
    return {"blog": _serialise(blog, with_body=True)}


@router.get("/files/{file_id}")
async def get_blog_file(file_id: str):
    """Public image proxy: serves blog images (featured + inline) so they can
    be embedded as <img src=...> without auth. SEO crawlers can index them."""
    rec = await db.blog_files.find_one({"id": file_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ctype = _get_object(rec["storage_path"])
    return StreamingResponse(
        io.BytesIO(data),
        media_type=rec.get("content_type") or ctype,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ===========================================================================
# Admin endpoints (mounted at /api/admin/blogs/*)
# ===========================================================================
@admin_router.get("")
async def admin_list_blogs(user: dict = Depends(require_admin),
                           status_filter: Optional[str] = Query(None, alias="status")):
    """Lists ALL blogs (draft + active + inactive)."""
    q: Dict[str, Any] = {}
    if status_filter and status_filter in ("draft", "active", "inactive"):
        q["status"] = status_filter
    rows = await db.blogs.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"blogs": [_serialise(r, with_body=False) for r in rows]}


@admin_router.get("/{blog_id}")
async def admin_get_blog(blog_id: str, user: dict = Depends(require_admin)):
    blog = await db.blogs.find_one({"id": blog_id}, {"_id": 0})
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"blog": _serialise(blog, with_body=True)}


@admin_router.post("")
async def admin_create_blog(req: BlogCreateReq, user: dict = Depends(require_admin)):
    slug = await _unique_slug(req.slug or req.title)
    bid = new_id()
    now = now_iso()
    doc = {
        "id": bid,
        "slug": slug,
        "title": req.title,
        "subtitle": req.subtitle,
        "excerpt": req.excerpt,
        "body_markdown": req.body_markdown,
        "featured_image_url": req.featured_image_url,
        "author_name": req.author_name,
        "tags": [t.strip() for t in (req.tags or []) if t.strip()],
        "status": req.status,
        "view_count": 0,
        "seo_title": req.seo_title,
        "seo_description": req.seo_description,
        "seo_keywords": req.seo_keywords,
        "published_at": now if req.status == "active" else None,
        "created_at": now,
        "updated_at": now,
        "created_by_admin_id": user.get("id"),
    }
    await db.blogs.insert_one(doc)
    return {"blog": _serialise(doc, with_body=True)}


@admin_router.patch("/{blog_id}")
async def admin_update_blog(blog_id: str, req: BlogUpdateReq, user: dict = Depends(require_admin)):
    blog = await db.blogs.find_one({"id": blog_id}, {"_id": 0})
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")
    upd: Dict[str, Any] = {}
    data = req.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] is not None:
        data["slug"] = await _unique_slug(data["slug"] or blog["title"], current_id=blog_id)
    if "tags" in data and data["tags"] is not None:
        data["tags"] = [t.strip() for t in data["tags"] if t.strip()]
    # If status flips draft/inactive → active and we don't have a published_at,
    # set it now (so listings sort correctly).
    if data.get("status") == "active" and not blog.get("published_at"):
        upd["published_at"] = now_iso()
    upd.update(data)
    upd["updated_at"] = now_iso()
    await db.blogs.update_one({"id": blog_id}, {"$set": upd})
    fresh = await db.blogs.find_one({"id": blog_id}, {"_id": 0})
    return {"blog": _serialise(fresh, with_body=True)}


@admin_router.post("/{blog_id}/toggle-status")
async def admin_toggle_status(blog_id: str, user: dict = Depends(require_admin)):
    """Active ↔ inactive shortcut for the list table."""
    blog = await db.blogs.find_one({"id": blog_id}, {"_id": 0, "status": 1, "published_at": 1})
    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")
    new_status = "inactive" if blog.get("status") == "active" else "active"
    upd: Dict[str, Any] = {"status": new_status, "updated_at": now_iso()}
    if new_status == "active" and not blog.get("published_at"):
        upd["published_at"] = now_iso()
    await db.blogs.update_one({"id": blog_id}, {"$set": upd})
    return {"ok": True, "status": new_status}


@admin_router.delete("/{blog_id}")
async def admin_delete_blog(blog_id: str, user: dict = Depends(require_admin)):
    res = await db.blogs.delete_one({"id": blog_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blog not found")
    return {"ok": True}


@admin_router.post("/upload-image")
async def admin_upload_image(file: UploadFile = File(...),
                             user: dict = Depends(require_admin)):
    """Uploads an image to object storage. Returns the public URL the admin
    can paste straight into the markdown body, OR use as featured image."""
    name = file.filename or "upload.bin"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_IMG_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type .{ext}")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_IMG_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_IMG_BYTES // (1024*1024)}MB)")
    content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    file_id = new_id()
    path = f"{APP_NAME}/blog/{datetime.now(timezone.utc).strftime('%Y%m')}/{file_id}.{ext}"
    result = _put_object(path, data, content_type)
    record = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": name,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "uploaded_by_admin_id": user.get("id"),
        "created_at": now_iso(),
    }
    await db.blog_files.insert_one(record)
    # Public URL the frontend should use — proxied through our API so
    # crawlers can index without auth and we keep the storage key private.
    public_url = f"/api/blogs/files/{file_id}"
    return {
        "id": file_id,
        "url": public_url,
        "filename": name,
        "size": record["size"],
        "content_type": content_type,
    }
