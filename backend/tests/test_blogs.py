"""Iteration 13 — Blog module end-to-end backend tests.

Covers:
  * Public list / by-slug / file proxy
  * Admin CRUD + status workflow + slug uniqueness
  * Admin image upload (jpg/png/webp, size + ext + empty)
  * Auth gating (superadmin vs vendor vs anon)
"""
from __future__ import annotations

import io
import os
import struct
import time
import uuid
import zlib
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_EMAIL = "sidhuboys000@gmail.com"
SUPER_PASS = "Kamala98@pamo"
VENDOR_EMAIL = "demo@botnira.com"
VENDOR_PASS = "demo123"


# ---------------------------------------------------------------------------
# tiny PNG generator (8x8 red) — avoids pillow dep
# ---------------------------------------------------------------------------
def _tiny_png() -> bytes:
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data
                + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))
    ihdr = struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * 8 for _ in range(8))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def vendor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": VENDOR_EMAIL, "password": VENDOR_PASS}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Vendor login failed: {r.status_code}")
    return r.json()["token"]


@pytest.fixture
def admin_h(super_token):
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture
def vendor_h(vendor_token):
    return {"Authorization": f"Bearer {vendor_token}"}


@pytest.fixture
def created_blogs():
    """Tracks blog ids to delete in teardown."""
    ids = []
    yield ids
    # cleanup
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        for bid in ids:
            try:
                requests.delete(f"{BASE_URL}/api/admin/blogs/{bid}", headers=h, timeout=15)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# AUTH gating
# ---------------------------------------------------------------------------
class TestAuthGating:
    def test_anon_admin_list_is_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/blogs", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_vendor_admin_list_is_403(self, vendor_h):
        r = requests.get(f"{BASE_URL}/api/admin/blogs", headers=vendor_h, timeout=15)
        assert r.status_code == 403, r.text

    def test_anon_create_is_401(self):
        r = requests.post(f"{BASE_URL}/api/admin/blogs",
                          json={"title": "TEST anon should fail"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_vendor_create_is_403(self, vendor_h):
        r = requests.post(f"{BASE_URL}/api/admin/blogs", headers=vendor_h,
                          json={"title": "TEST vendor should fail"}, timeout=15)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Public listing & detail
# ---------------------------------------------------------------------------
class TestPublicEndpoints:
    def test_public_list_ok_active_only_no_body(self):
        r = requests.get(f"{BASE_URL}/api/blogs", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "blogs" in data and isinstance(data["blogs"], list)
        for b in data["blogs"]:
            assert b["status"] == "active"
            assert "body_markdown" not in b, "list payload must omit body"
            assert "excerpt" in b
            assert "featured_image_url" in b
            assert "tags" in b

    def test_public_by_slug_unknown_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/blogs/by-slug/this-slug-does-not-exist-xyz-123", timeout=15)
        assert r.status_code == 404

    def test_public_by_slug_returns_body(self):
        # Use the seeded blog from context note
        r = requests.get(
            f"{BASE_URL}/api/blogs/by-slug/ai-receptionists-in-2026-why-your-front-desk-needs-one",
            timeout=15)
        assert r.status_code == 200
        blog = r.json()["blog"]
        assert blog["status"] == "active"
        assert "body_markdown" in blog

    def test_public_by_slug_increments_view_count(self):
        slug = "ai-receptionists-in-2026-why-your-front-desk-needs-one"
        b1 = requests.get(f"{BASE_URL}/api/blogs/by-slug/{slug}", timeout=15).json()["blog"]
        b2 = requests.get(f"{BASE_URL}/api/blogs/by-slug/{slug}", timeout=15).json()["blog"]
        assert b2["view_count"] > b1["view_count"]

    def test_public_file_unknown_id_404(self):
        r = requests.get(f"{BASE_URL}/api/blogs/files/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Admin CRUD + status workflow
# ---------------------------------------------------------------------------
class TestAdminCRUD:
    def test_create_blog_with_auto_slug(self, admin_h, created_blogs):
        unique = f"TEST Iter13 Auto Slug {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                          json={"title": unique, "body_markdown": "# Hello\n\nBody."}, timeout=20)
        assert r.status_code == 200, r.text
        blog = r.json()["blog"]
        created_blogs.append(blog["id"])
        assert blog["slug"]
        assert "test-iter13-auto-slug" in blog["slug"]
        assert blog["status"] == "draft"
        assert blog["published_at"] is None
        assert blog["body_markdown"] == "# Hello\n\nBody."

    def test_draft_not_in_public_list_or_by_slug(self, admin_h, created_blogs):
        unique = f"TEST Iter13 Draft Hidden {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                          json={"title": unique}, timeout=20)
        assert r.status_code == 200
        blog = r.json()["blog"]
        created_blogs.append(blog["id"])

        # Not in public list
        pl = requests.get(f"{BASE_URL}/api/blogs", timeout=15).json()["blogs"]
        assert not any(b["slug"] == blog["slug"] for b in pl)

        # by-slug returns 404 for draft
        r = requests.get(f"{BASE_URL}/api/blogs/by-slug/{blog['slug']}", timeout=15)
        assert r.status_code == 404

    def test_slug_uniqueness_suffix_on_collision(self, admin_h, created_blogs):
        title = f"TEST Iter13 Slug Collision {uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                           json={"title": title}, timeout=20)
        assert r1.status_code == 200
        b1 = r1.json()["blog"]
        created_blogs.append(b1["id"])

        r2 = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                           json={"title": title}, timeout=20)
        assert r2.status_code == 200
        b2 = r2.json()["blog"]
        created_blogs.append(b2["id"])
        assert b1["slug"] != b2["slug"]
        assert b2["slug"].startswith(b1["slug"])
        assert b2["slug"].endswith("-2")

    def test_patch_slug_to_existing_appends_suffix(self, admin_h, created_blogs):
        t1 = f"TEST Iter13 PatchA {uuid.uuid4().hex[:6]}"
        t2 = f"TEST Iter13 PatchB {uuid.uuid4().hex[:6]}"
        b1 = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                           json={"title": t1}, timeout=20).json()["blog"]
        created_blogs.append(b1["id"])
        b2 = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                           json={"title": t2}, timeout=20).json()["blog"]
        created_blogs.append(b2["id"])

        # Try to rename b2.slug → b1.slug — backend should append -2
        r = requests.patch(f"{BASE_URL}/api/admin/blogs/{b2['id']}", headers=admin_h,
                           json={"slug": b1["slug"]}, timeout=20)
        assert r.status_code == 200
        new_slug = r.json()["blog"]["slug"]
        assert new_slug != b1["slug"]
        assert new_slug.startswith(b1["slug"])

    def test_toggle_status_active_sets_published_at_and_back(self, admin_h, created_blogs):
        unique = f"TEST Iter13 Toggle {uuid.uuid4().hex[:6]}"
        b = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                          json={"title": unique}, timeout=20).json()["blog"]
        created_blogs.append(b["id"])
        assert b["status"] == "draft" and b["published_at"] is None

        # Toggle 1: draft -> active (sets published_at)
        r = requests.post(f"{BASE_URL}/api/admin/blogs/{b['id']}/toggle-status",
                          headers=admin_h, timeout=20)
        assert r.status_code == 200 and r.json()["status"] == "active"

        full = requests.get(f"{BASE_URL}/api/admin/blogs/{b['id']}", headers=admin_h,
                            timeout=15).json()["blog"]
        assert full["status"] == "active"
        assert full["published_at"] is not None
        pub_at = full["published_at"]

        # Public list now contains it
        pl = requests.get(f"{BASE_URL}/api/blogs", timeout=15).json()["blogs"]
        assert any(x["slug"] == b["slug"] for x in pl)

        # Toggle 2: active -> inactive — keep published_at
        r = requests.post(f"{BASE_URL}/api/admin/blogs/{b['id']}/toggle-status",
                          headers=admin_h, timeout=20)
        assert r.status_code == 200 and r.json()["status"] == "inactive"
        full = requests.get(f"{BASE_URL}/api/admin/blogs/{b['id']}", headers=admin_h,
                            timeout=15).json()["blog"]
        assert full["status"] == "inactive"
        assert full["published_at"] == pub_at, "published_at must be preserved on deactivate"

        # Inactive hidden from public again
        r = requests.get(f"{BASE_URL}/api/blogs/by-slug/{b['slug']}", timeout=15)
        assert r.status_code == 404

    def test_admin_list_status_filter(self, admin_h, created_blogs):
        unique = f"TEST Iter13 Filter {uuid.uuid4().hex[:6]}"
        b = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                          json={"title": unique}, timeout=20).json()["blog"]
        created_blogs.append(b["id"])
        r = requests.get(f"{BASE_URL}/api/admin/blogs?status=draft", headers=admin_h, timeout=15)
        assert r.status_code == 200
        rows = r.json()["blogs"]
        assert any(x["id"] == b["id"] for x in rows)
        for x in rows:
            assert x["status"] == "draft"

    def test_patch_update_then_delete(self, admin_h, created_blogs):
        unique = f"TEST Iter13 UpdDel {uuid.uuid4().hex[:6]}"
        b = requests.post(f"{BASE_URL}/api/admin/blogs", headers=admin_h,
                          json={"title": unique}, timeout=20).json()["blog"]
        created_blogs.append(b["id"])

        r = requests.patch(f"{BASE_URL}/api/admin/blogs/{b['id']}", headers=admin_h,
                           json={"subtitle": "new-sub", "tags": ["a", "b"],
                                 "status": "active"}, timeout=20)
        assert r.status_code == 200
        upd = r.json()["blog"]
        assert upd["subtitle"] == "new-sub"
        assert upd["tags"] == ["a", "b"]
        assert upd["status"] == "active"
        assert upd["published_at"] is not None

        # delete and verify 404
        r = requests.delete(f"{BASE_URL}/api/admin/blogs/{b['id']}", headers=admin_h, timeout=20)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/admin/blogs/{b['id']}", headers=admin_h, timeout=15)
        assert r.status_code == 404
        created_blogs.remove(b["id"])  # already deleted


# ---------------------------------------------------------------------------
# Image upload + public retrieval
# ---------------------------------------------------------------------------
class TestImageUpload:
    def test_upload_png_then_fetch_public(self, admin_h):
        data = _tiny_png()
        files = {"file": ("tiny.png", data, "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image",
                          headers=admin_h, files=files, timeout=30)
        if r.status_code == 503:
            pytest.skip("Object storage unavailable in this env")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["url"].startswith("/api/blogs/files/")
        assert j["content_type"] == "image/png"
        assert j["size"] == len(data)

        # Fetch publicly (no auth)
        url = f"{BASE_URL}{j['url']}"
        r2 = requests.get(url, timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("Content-Type", "").startswith("image/")
        assert len(r2.content) == len(data)

    def test_upload_bad_extension_400(self, admin_h):
        files = {"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")}
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image",
                          headers=admin_h, files=files, timeout=20)
        assert r.status_code == 400

    def test_upload_empty_400(self, admin_h):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image",
                          headers=admin_h, files=files, timeout=20)
        assert r.status_code == 400

    def test_upload_too_large_413(self, admin_h):
        # 7 MB blob
        big = b"\x00" * (7 * 1024 * 1024)
        files = {"file": ("huge.png", big, "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image",
                          headers=admin_h, files=files, timeout=60)
        assert r.status_code == 413

    def test_upload_anon_401_and_vendor_403(self, vendor_h):
        files = {"file": ("tiny.png", _tiny_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image", files=files, timeout=20)
        assert r.status_code in (401, 403)
        r = requests.post(f"{BASE_URL}/api/admin/blogs/upload-image",
                          headers=vendor_h, files=files, timeout=20)
        assert r.status_code == 403
