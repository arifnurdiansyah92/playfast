"""Game request endpoints: user-facing submission/voting and admin moderation."""

import logging
import re
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from functools import wraps
from urllib.parse import urlparse

import requests as http_requests
from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.email_service import send_game_request_fulfilled_email
from app.extensions import db
from app.models import Game, GameRequest, GameRequestVote, User

logger = logging.getLogger(__name__)

game_requests_bp = Blueprint(
    "game_requests", __name__, url_prefix="/api/game-requests"
)
admin_game_requests_bp = Blueprint(
    "admin_game_requests", __name__, url_prefix="/api/admin/game-requests"
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
# Rate limit: max 10 new game submissions per user per day (existing votes
# don't count). In-memory, per-process.
# ---------------------------------------------------------------------------
_submit_rate_lock = threading.Lock()
_submit_rate_log: dict[int, list[float]] = defaultdict(list)
_SUBMIT_RATE_LIMIT = 10
_SUBMIT_RATE_WINDOW = 24 * 60 * 60  # 1 day in seconds


def _check_submit_rate_limit(user_id: int) -> bool:
    now = time.time()
    with _submit_rate_lock:
        timestamps = _submit_rate_log[user_id]
        _submit_rate_log[user_id] = [
            t for t in timestamps if now - t < _SUBMIT_RATE_WINDOW
        ]
        if len(_submit_rate_log[user_id]) >= _SUBMIT_RATE_LIMIT:
            return False
        return True


def _record_submission(user_id: int):
    with _submit_rate_lock:
        _submit_rate_log[user_id].append(time.time())


# ---------------------------------------------------------------------------
# Steam URL parsing + metadata fetch
# ---------------------------------------------------------------------------

_APPID_RE = re.compile(r"/app/(\d+)(?:/|$)")


def _extract_appid(url: str) -> int | None:
    """Extract Steam appid from a store URL.

    Accepted hosts: store.steampowered.com, steamcommunity.com.
    Path must contain /app/<id>.
    """
    if not url:
        return None
    url = url.strip()
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.hostname or "").lower()
    if host not in {"store.steampowered.com", "steamcommunity.com"}:
        return None
    m = _APPID_RE.search(parsed.path or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _fetch_steam_minimal(appid: int) -> dict | None:
    """Fetch minimal game info (name, header_image, original_price) from Steam.
    Returns None if the appid is unknown or the API fails.
    """
    try:
        resp = http_requests.get(
            f"https://store.steampowered.com/api/appdetails?appids={appid}&cc=us",
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        app_data = data.get(str(appid)) or {}
        if not app_data.get("success"):
            return None
        details = app_data.get("data") or {}
        name = (details.get("name") or "").strip()
        if not name:
            return None
        header_image = details.get("header_image") or None

        original_price = None
        price_overview = details.get("price_overview") or {}
        initial_cents = price_overview.get("initial")
        if initial_cents:
            usd_price = initial_cents / 100
            original_price = round(usd_price * 17000)

        return {
            "name": name,
            "header_image": header_image,
            "original_price": original_price,
        }
    except Exception as e:
        logger.warning("Steam fetch failed for appid %s: %s", appid, e)
        return None


# ---------------------------------------------------------------------------
# User-facing endpoints
# ---------------------------------------------------------------------------


@game_requests_bp.route("", methods=["POST"])
@jwt_required()
def submit_request():
    """Submit a game request via Steam store URL.

    Body: { steam_url: str }
    - If a request for this appid exists, just adds the user's vote.
    - Otherwise fetches Steam metadata and creates the request + vote.
    - Rejects if the game is already in the Playfast catalog.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    steam_url = (data.get("steam_url") or "").strip()

    if not steam_url:
        return jsonify({"error": "Link Steam tidak boleh kosong"}), 400

    appid = _extract_appid(steam_url)
    if not appid:
        return jsonify({
            "error": "Link Steam tidak valid. Contoh: https://store.steampowered.com/app/1091500/Cyberpunk_2077/"
        }), 400

    existing_game = Game.query.filter_by(appid=appid).first()
    catalog_in_stock = bool(
        existing_game and existing_game.available_account_count() > 0
    )

    if catalog_in_stock:
        return jsonify({
            "error": "Game ini sudah ada di katalog kami",
            "game_id": existing_game.id,
            "game_name": existing_game.custom_name or existing_game.name,
        }), 409

    existing_req = GameRequest.query.filter_by(appid=appid).first()

    if existing_req:
        if existing_req.status == "rejected":
            return jsonify({
                "error": "Request game ini sudah ditolak"
                + (f": {existing_req.admin_note}" if existing_req.admin_note else ""),
                "game_request": existing_req.to_dict(current_user_id=user_id),
            }), 409

        # Reopen previously-added requests when catalog is out of stock so admin
        # sees fresh demand and voters get notified again on the next restock.
        if existing_req.status == "added":
            existing_req.status = "pending"
            existing_req.resolved_at = None
            existing_req.resolved_by_user_id = None
            existing_req.notified_at = None
            existing_req.notified_count = 0

        # Already voted?
        existing_vote = GameRequestVote.query.filter_by(
            game_request_id=existing_req.id, user_id=user_id
        ).first()
        if existing_vote:
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
            return jsonify({
                "message": "Kamu sudah request game ini",
                "game_request": existing_req.to_dict(current_user_id=user_id),
            }), 200

        try:
            vote = GameRequestVote(game_request_id=existing_req.id, user_id=user_id)
            db.session.add(vote)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()

        return jsonify({
            "message": "Request kamu tercatat",
            "game_request": existing_req.to_dict(current_user_id=user_id),
        }), 200

    # New request — check rate limit before doing the Steam fetch
    if not _check_submit_rate_limit(user_id):
        return jsonify({
            "error": "Kamu sudah mencapai batas request hari ini (10 game baru per hari). Coba lagi besok."
        }), 429

    meta = _fetch_steam_minimal(appid)
    if not meta:
        return jsonify({
            "error": "Game tidak ditemukan di Steam Store. Pastikan link nya benar."
        }), 404

    canonical_url = f"https://store.steampowered.com/app/{appid}/"

    new_req = GameRequest(
        appid=appid,
        name=meta["name"],
        header_image=meta.get("header_image"),
        original_price=meta.get("original_price"),
        store_url=canonical_url,
        status="pending",
    )
    db.session.add(new_req)
    db.session.flush()  # get id without committing yet

    vote = GameRequestVote(game_request_id=new_req.id, user_id=user_id)
    db.session.add(vote)

    try:
        db.session.commit()
    except IntegrityError:
        # Race condition: another submission for the same appid landed first.
        db.session.rollback()
        new_req = GameRequest.query.filter_by(appid=appid).first()
        if new_req:
            existing_vote = GameRequestVote.query.filter_by(
                game_request_id=new_req.id, user_id=user_id
            ).first()
            if not existing_vote:
                vote = GameRequestVote(
                    game_request_id=new_req.id, user_id=user_id
                )
                db.session.add(vote)
                try:
                    db.session.commit()
                except IntegrityError:
                    db.session.rollback()
        return jsonify({
            "message": "Request kamu tercatat",
            "game_request": new_req.to_dict(current_user_id=user_id) if new_req else None,
        }), 200

    _record_submission(user_id)

    return jsonify({
        "message": "Request game kamu sudah masuk",
        "game_request": new_req.to_dict(current_user_id=user_id),
    }), 201


@game_requests_bp.route("/mine", methods=["GET"])
@jwt_required()
def list_my_requests():
    """List game requests the current user has voted on."""
    user_id = int(get_jwt_identity())
    votes = (
        GameRequestVote.query.filter_by(user_id=user_id)
        .order_by(GameRequestVote.created_at.desc())
        .all()
    )
    items = []
    for v in votes:
        if v.game_request:
            items.append(v.game_request.to_dict(current_user_id=user_id))
    return jsonify({"items": items}), 200


@game_requests_bp.route("", methods=["GET"])
@jwt_required()
def list_all_requests():
    """Game requests visible to signed-in users.

    Returns pending + added entries so the frontend can split them into
    separate tabs (community vote vs already-added history). Rejected
    entries stay hidden — nothing actionable to show.

    Sorted by status (pending first), then vote count desc, then date desc.
    Each item carries a `voted` flag so the UI can render vote affordances.
    """
    user_id = int(get_jwt_identity())
    items = GameRequest.query.filter(
        GameRequest.status.in_(["pending", "added"])
    ).all()
    items.sort(
        key=lambda r: (
            0 if r.status == "pending" else 1,
            -(r.request_count()),
            r.created_at,
        ),
    )
    return jsonify({
        "items": [r.to_dict(current_user_id=user_id) for r in items],
    }), 200


@game_requests_bp.route("/public", methods=["GET"])
def list_public_requests():
    """Public, unauthenticated feed for the landing page.

    Returns the top-voted pending requests (so visitors see what the
    community is asking for) plus the most recently-added requests (so
    they see we actually deliver). No `voted` flag — that needs a user.
    """
    pending = GameRequest.query.filter_by(status="pending").all()
    pending.sort(key=lambda r: (r.request_count(), r.created_at), reverse=True)

    added = (
        GameRequest.query.filter_by(status="added")
        .order_by(GameRequest.resolved_at.desc().nullslast())
        .limit(12)
        .all()
    )

    return jsonify({
        "pending": [r.to_dict() for r in pending[:6]],
        "added": [r.to_dict() for r in added[:6]],
        "pending_total": len(pending),
        "added_total": GameRequest.query.filter_by(status="added").count(),
    }), 200


@game_requests_bp.route("/<int:request_id>/vote", methods=["DELETE"])
@jwt_required()
def remove_my_vote(request_id: int):
    """Remove the current user's vote from a pending request."""
    user_id = int(get_jwt_identity())
    req = db.session.get(GameRequest, request_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404
    if req.status != "pending":
        return jsonify({
            "error": "Request ini sudah diproses, tidak bisa dibatalkan"
        }), 400

    vote = GameRequestVote.query.filter_by(
        game_request_id=request_id, user_id=user_id
    ).first()
    if not vote:
        return jsonify({"error": "Kamu belum request game ini"}), 404

    db.session.delete(vote)
    db.session.commit()
    return jsonify({
        "message": "Vote dibatalkan",
        "game_request": req.to_dict(current_user_id=user_id),
    }), 200


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@admin_game_requests_bp.route("", methods=["GET"])
@admin_required
def admin_list_requests():
    """List all game requests for admin moderation.

    Query params:
      - status: pending | added | rejected | all (default: all)
      - page, per_page: standard pagination (default 25, max 200)
      - q: optional case-insensitive search over game name + appid
    Sorted by request_count desc, then created_at desc — computed in SQL so
    pagination operates on the correctly-ordered window.
    Stats are computed against the unfiltered table so the chip counts
    stay stable as the user changes the active status filter.
    """
    status = (request.args.get("status") or "all").lower()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 25, type=int)
    per_page = min(max(per_page, 1), 200)
    q_search = (request.args.get("q") or "").strip()

    vote_count = (
        db.session.query(
            GameRequestVote.game_request_id.label("rid"),
            func.count(GameRequestVote.id).label("cnt"),
        )
        .group_by(GameRequestVote.game_request_id)
        .subquery()
    )

    query = (
        db.session.query(GameRequest)
        .outerjoin(vote_count, vote_count.c.rid == GameRequest.id)
    )

    if status in ("pending", "added", "rejected"):
        query = query.filter(GameRequest.status == status)

    if q_search:
        pattern = f"%{q_search}%"
        conditions = [GameRequest.name.ilike(pattern)]
        if q_search.isdigit():
            conditions.append(GameRequest.appid == int(q_search))
        query = query.filter(db.or_(*conditions))

    query = query.order_by(
        func.coalesce(vote_count.c.cnt, 0).desc(),
        GameRequest.created_at.desc(),
    )

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    pending_count = GameRequest.query.filter_by(status="pending").count()
    added_count = GameRequest.query.filter_by(status="added").count()
    rejected_count = GameRequest.query.filter_by(status="rejected").count()

    return jsonify({
        "items": [r.to_dict(include_voters=True) for r in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
        "stats": {
            "pending": pending_count,
            "added": added_count,
            "rejected": rejected_count,
        },
    }), 200


@admin_game_requests_bp.route("/<int:request_id>", methods=["PATCH"])
@admin_required
def admin_update_request(request_id: int):
    """Update a request's status and optional admin_note.

    Body: { status: pending|added|rejected, admin_note?: str }
    """
    admin_user_id = int(get_jwt_identity())
    req = db.session.get(GameRequest, request_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404

    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").lower()
    if new_status not in GameRequest.STATUS_CHOICES:
        return jsonify({
            "error": f"Invalid status. Must be one of: {', '.join(GameRequest.STATUS_CHOICES)}"
        }), 400

    # Block flip to "added" if the Game with this appid isn't in the catalog
    # yet — otherwise notification emails would link to a 404. Also block when
    # no active SteamAccount owns the game, since voters would get a "tersedia"
    # email pointing at a listing they can't actually buy.
    matched_game = None
    if new_status == "added":
        matched_game = Game.query.filter_by(appid=req.appid).first()
        if not matched_game:
            return jsonify({
                "error": "Game belum ada di katalog. Tambahin dulu game-nya, baru tandai request sebagai added.",
                "code": "game_not_in_catalog",
            }), 409
        if matched_game.available_account_count() == 0:
            return jsonify({
                "error": "Game ada di katalog tapi belum ada akun aktif yang punya. Aktifkan akun yang memiliki game ini dulu, baru tandai request sebagai added.",
                "code": "no_active_account",
            }), 409

    req.status = new_status
    if "admin_note" in data:
        note = (data.get("admin_note") or "").strip()
        req.admin_note = note or None

    if new_status == "pending":
        req.resolved_at = None
        req.resolved_by_user_id = None
    else:
        req.resolved_at = datetime.now(timezone.utc)
        req.resolved_by_user_id = admin_user_id

    # Notify voters once per request, only on the first flip to "added".
    # Both prerequisites (game in catalog + at least one active account) are
    # already enforced above, so we know the link in the email will work.
    notify_message = ""
    if (
        new_status == "added"
        and matched_game is not None
        and req.notified_at is None
    ):
        frontend_url = (current_app.config.get("FRONTEND_URL") or "").rstrip("/")
        game_url = f"{frontend_url}/game/{matched_game.appid}" if frontend_url else f"/game/{matched_game.appid}"
        display_name = (
            matched_game.custom_name
            or matched_game.name
            or req.name
        )
        header = matched_game.custom_header_image or matched_game.header_image or req.header_image

        # Collect recipient emails now (need an active session), then hand
        # the list off to a background thread. Sending inline would block
        # the admin for ~N * 0.4 s and risks gunicorn worker timeout on
        # large vote counts.
        recipients = [v.user.email for v in req.votes.all() if v.user and v.user.email]
        recipient_count = len(recipients)

        # Mark as notified immediately so a duplicate click can't re-fire
        # the notification. The actual sent_count is fixed up by the worker
        # once the burst completes.
        req.notified_at = datetime.now(timezone.utc)
        req.notified_count = recipient_count

        app = current_app._get_current_object()
        req_id = req.id

        def _notify_voters_async():
            with app.app_context():
                sent = 0
                for email in recipients:
                    try:
                        send_game_request_fulfilled_email(
                            to=email,
                            game_name=display_name,
                            game_url=game_url,
                            header_image=header,
                        )
                        sent += 1
                    except Exception:
                        logger.exception(
                            "Failed to send fulfilled email to %s for request %s",
                            email, req_id,
                        )
                    # Gentle pacing so SMTP / Brevo doesn't throttle us.
                    time.sleep(0.4)

                # Update with the real sent count once everyone's been
                # tried — useful when some addresses bounce.
                try:
                    fresh = db.session.get(GameRequest, req_id)
                    if fresh is not None:
                        fresh.notified_count = sent
                        db.session.commit()
                except Exception:
                    logger.exception("Failed to update notified_count for request %s", req_id)

        threading.Thread(target=_notify_voters_async, daemon=True).start()
        notify_message = f" · Notifikasi sedang dikirim ke {recipient_count} voter (background)."

    db.session.commit()
    return jsonify({
        "message": "Status diperbarui" + notify_message,
        "game_request": req.to_dict(include_voters=True),
    }), 200
