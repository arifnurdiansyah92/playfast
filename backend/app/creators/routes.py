"""Endpoints for the Playfast Creator program.

- POST /api/creator-applications        public submission (no auth)
- GET  /api/admin/creator-applications  admin list + counts
- PATCH /api/admin/creator-applications/<id>  admin update (status, note)
- DELETE /api/admin/creator-applications/<id>  admin delete
"""

import logging
import threading
import time
import re
from collections import defaultdict
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import CreatorApplication, User

logger = logging.getLogger(__name__)

creator_applications_bp = Blueprint(
    "creator_applications", __name__, url_prefix="/api/creator-applications"
)
admin_creator_applications_bp = Blueprint(
    "admin_creator_applications", __name__, url_prefix="/api/admin/creator-applications"
)


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user or not user.is_admin:
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Light rate limit on public submission (per IP, in-memory).
# Generous enough that legit creators won't hit it; blocks naive spam loops.
# ---------------------------------------------------------------------------
_submit_rate_lock = threading.Lock()
_submit_rate_log: dict[str, list[float]] = defaultdict(list)
_SUBMIT_RATE_LIMIT = 5         # max submissions per IP
_SUBMIT_RATE_WINDOW = 60 * 60   # per 1 hour


def _check_submit_rate(ip: str) -> bool:
    now = time.time()
    with _submit_rate_lock:
        recent = [t for t in _submit_rate_log[ip] if now - t < _SUBMIT_RATE_WINDOW]
        _submit_rate_log[ip] = recent
        if len(recent) >= _SUBMIT_RATE_LIMIT:
            return False
        recent.append(now)
        _submit_rate_log[ip] = recent
        return True


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _validate(payload: dict) -> str | None:
    name = (payload.get("name") or "").strip()
    if not name or len(name) > 200:
        return "Nama wajib diisi (max 200 karakter)"

    email = (payload.get("email") or "").strip()
    if not email or not _EMAIL_RE.match(email) or len(email) > 255:
        return "Email tidak valid"

    whatsapp = (payload.get("whatsapp") or "").strip()
    if not whatsapp or len(whatsapp) > 50:
        return "Nomor WhatsApp wajib diisi"
    if not re.match(r"^[\d+\-\s()]{6,}$", whatsapp):
        return "Format WhatsApp tidak valid"

    platform = (payload.get("platform") or "").strip().lower()
    if platform not in CreatorApplication.PLATFORM_CHOICES:
        return f"Platform tidak valid (pilihan: {', '.join(CreatorApplication.PLATFORM_CHOICES)})"

    handle = (payload.get("handle") or "").strip()
    if not handle or len(handle) > 200:
        return "Username/handle wajib diisi"

    bucket = (payload.get("follower_bucket") or "").strip()
    if bucket and bucket not in CreatorApplication.FOLLOWER_BUCKETS:
        return "Follower bucket tidak valid"

    links = payload.get("content_links") or []
    if not isinstance(links, list):
        return "content_links harus berupa list"
    # Filter empty, validate URLs
    cleaned: list[str] = []
    for raw in links:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        if not _URL_RE.match(s) or len(s) > 500:
            return f"Link konten tidak valid: {s[:60]}"
        cleaned.append(s)
    if len(cleaned) < 1:
        return "Minimal 1 link konten wajib diisi"
    if len(cleaned) > 5:
        return "Maksimal 5 link konten"
    payload["content_links"] = cleaned  # normalize back

    niche = (payload.get("niche") or "").strip()
    if len(niche) > 200:
        return "Niche terlalu panjang (max 200 karakter)"

    pitch = (payload.get("pitch") or "").strip()
    if len(pitch) > 1000:
        return "Pitch terlalu panjang (max 1000 karakter)"

    return None


# ---------------------------------------------------------------------------
# Public submission
# ---------------------------------------------------------------------------


@creator_applications_bp.route("", methods=["POST"])
def submit_application():
    """Public endpoint — anyone can apply. No auth required.

    Rate-limited per IP to stop trivial automated spam. Doesn't try to be
    a CAPTCHA — the admin queue is the real filter.
    """
    ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "unknown").split(",")[0].strip()
    if not _check_submit_rate(ip):
        return jsonify({
            "error": "Terlalu banyak submission dalam 1 jam terakhir. Coba lagi nanti."
        }), 429

    data = request.get_json(silent=True) or {}
    err = _validate(data)
    if err:
        return jsonify({"error": err}), 400

    application = CreatorApplication(
        name=data["name"].strip(),
        email=data["email"].strip().lower(),
        whatsapp=data["whatsapp"].strip(),
        platform=data["platform"].strip().lower(),
        handle=data["handle"].strip(),
        follower_bucket=(data.get("follower_bucket") or "").strip() or None,
        content_links=data["content_links"],
        niche=(data.get("niche") or "").strip() or None,
        pitch=(data.get("pitch") or "").strip() or None,
        status="pending",
    )
    db.session.add(application)
    db.session.commit()

    logger.info(
        "Creator application submitted: id=%s email=%s platform=%s",
        application.id, application.email, application.platform,
    )

    return jsonify({
        "message": (
            "Aplikasi terkirim. Tim Playfast akan kontak via WhatsApp/email "
            "biasanya dalam 1-2 hari kerja. Pantau inbox kamu ya!"
        ),
        "application": application.to_dict(),
    }), 201


# ---------------------------------------------------------------------------
# Admin moderation
# ---------------------------------------------------------------------------


@admin_creator_applications_bp.route("", methods=["GET"])
@admin_required
def list_applications():
    """Paginated list with status filter + counts per status."""
    status = (request.args.get("status") or "all").strip().lower()
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 50))))

    q = CreatorApplication.query
    if status in CreatorApplication.STATUS_CHOICES:
        q = q.filter_by(status=status)
    q = q.order_by(CreatorApplication.created_at.desc())

    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1

    counts = {
        s: CreatorApplication.query.filter_by(status=s).count()
        for s in CreatorApplication.STATUS_CHOICES
    }
    counts["all"] = sum(counts.values())

    return jsonify({
        "items": [a.to_dict(admin=True) for a in items],
        "counts": counts,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }), 200


@admin_creator_applications_bp.route("/<int:app_id>", methods=["PATCH"])
@admin_required
def update_application(app_id: int):
    """Update status and/or admin_note. Tracks reviewer + timestamp."""
    application = db.session.get(CreatorApplication, app_id)
    if not application:
        return jsonify({"error": "Application not found"}), 404

    data = request.get_json(silent=True) or {}
    touched_status = False

    if "status" in data:
        new_status = (data["status"] or "").strip().lower()
        if new_status not in CreatorApplication.STATUS_CHOICES:
            return jsonify({
                "error": f"Status harus salah satu: {', '.join(CreatorApplication.STATUS_CHOICES)}"
            }), 400
        application.status = new_status
        touched_status = True

    if "admin_note" in data:
        note = (data["admin_note"] or "").strip()
        application.admin_note = note or None

    if touched_status:
        application.reviewed_by_user_id = int(get_jwt_identity())
        application.reviewed_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({
        "message": "Application updated",
        "application": application.to_dict(admin=True),
    }), 200


@admin_creator_applications_bp.route("/<int:app_id>", methods=["DELETE"])
@admin_required
def delete_application(app_id: int):
    application = db.session.get(CreatorApplication, app_id)
    if not application:
        return jsonify({"error": "Application not found"}), 404
    db.session.delete(application)
    db.session.commit()
    return jsonify({"message": "Application deleted"}), 200
