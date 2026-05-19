"""Redeem code campaigns — admin CRUD + generation + user redemption.

A RedeemCode (giveaway) is distinct from a PromoCode (checkout discount):
redeeming grants direct access to a Subscription or a Game's Assignment
without any payment flow. One code = one successful redemption.
"""

from __future__ import annotations

import csv
import io
import logging
import secrets
from datetime import datetime, timezone, timedelta
from functools import wraps

from flask import Blueprint, jsonify, make_response, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import (
    Assignment,
    Game,
    GameAccount,
    Order,
    RedeemCampaign,
    RedeemCode,
    SteamAccount,
    Subscription,
    User,
)

logger = logging.getLogger(__name__)

admin_redeem_bp = Blueprint("admin_redeem", __name__, url_prefix="/api/admin/redeem")
redeem_bp = Blueprint("redeem", __name__, url_prefix="/api/redeem")


# ---------------------------------------------------------------------------
# Auth helper (matches pattern in other blueprints)
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
# Code generation — friendly alphabet (no 0/O/I/1/L) formatted XXXX-XXXX-XXXX
# ---------------------------------------------------------------------------

_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _gen_code() -> str:
    parts = []
    for _ in range(3):
        parts.append("".join(secrets.choice(_ALPHABET) for _ in range(4)))
    return "-".join(parts)


def _parse_iso(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False  # sentinel for invalid


# ---------------------------------------------------------------------------
# Admin: campaigns CRUD
# ---------------------------------------------------------------------------


@admin_redeem_bp.route("/campaigns", methods=["GET"])
@admin_required
def list_campaigns():
    page = request.args.get("page", 1, type=int)
    per_page = min(max(request.args.get("per_page", 25, type=int), 1), 200)
    q = (request.args.get("q") or "").strip()

    query = RedeemCampaign.query
    if q:
        query = query.filter(RedeemCampaign.name.ilike(f"%{q}%"))
    query = query.order_by(RedeemCampaign.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "campaigns": [c.to_dict(include_counts=True) for c in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


@admin_redeem_bp.route("/campaigns/<int:campaign_id>", methods=["GET"])
@admin_required
def get_campaign(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404
    return jsonify({"campaign": c.to_dict(include_counts=True)}), 200


@admin_redeem_bp.route("/campaigns", methods=["POST"])
@admin_required
def create_campaign():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    reward_type = data.get("reward_type")
    if reward_type not in RedeemCampaign.REWARD_TYPES:
        return jsonify({"error": "reward_type must be 'subscription' or 'game'"}), 400

    sub_plan = None
    sub_duration = None
    game_id = None

    if reward_type == "subscription":
        sub_plan = (data.get("reward_subscription_plan") or "").strip() or None
        if sub_plan and sub_plan not in Subscription.PLAN_DURATIONS:
            return jsonify({"error": f"Unknown plan '{sub_plan}'"}), 400
        if data.get("reward_subscription_duration_days") not in (None, ""):
            try:
                sub_duration = int(data["reward_subscription_duration_days"])
                if sub_duration <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"error": "reward_subscription_duration_days must be positive int"}), 400
        if not sub_plan and not sub_duration:
            return jsonify({"error": "Provide reward_subscription_plan or reward_subscription_duration_days"}), 400
    else:  # game
        game_id = data.get("reward_game_id")
        if not game_id:
            return jsonify({"error": "reward_game_id is required for game reward"}), 400
        game = db.session.get(Game, int(game_id))
        if not game:
            return jsonify({"error": "Game not found"}), 404
        game_id = game.id

    starts_at = _parse_iso(data.get("starts_at"))
    if starts_at is False:
        return jsonify({"error": "starts_at must be ISO datetime"}), 400
    expires_at = _parse_iso(data.get("expires_at"))
    if expires_at is False:
        return jsonify({"error": "expires_at must be ISO datetime"}), 400

    current_user_id = int(get_jwt_identity())
    campaign = RedeemCampaign(
        name=name,
        description=(data.get("description") or None),
        reward_type=reward_type,
        reward_subscription_plan=sub_plan,
        reward_subscription_duration_days=sub_duration,
        reward_game_id=game_id,
        max_redemptions_per_user=int(data.get("max_redemptions_per_user") or 1),
        starts_at=starts_at,
        expires_at=expires_at,
        is_active=bool(data.get("is_active", True)),
        created_by_user_id=current_user_id,
    )
    db.session.add(campaign)
    db.session.commit()
    return jsonify({
        "message": "Campaign created",
        "campaign": campaign.to_dict(include_counts=True),
    }), 201


@admin_redeem_bp.route("/campaigns/<int:campaign_id>", methods=["PATCH"])
@admin_required
def update_campaign(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404
    data = request.get_json() or {}

    if "name" in data:
        n = (data["name"] or "").strip()
        if not n:
            return jsonify({"error": "name cannot be empty"}), 400
        c.name = n
    if "description" in data:
        c.description = data["description"] or None
    if "max_redemptions_per_user" in data:
        c.max_redemptions_per_user = int(data["max_redemptions_per_user"] or 1)
    if "is_active" in data:
        c.is_active = bool(data["is_active"])
    if "starts_at" in data:
        v = _parse_iso(data["starts_at"])
        if v is False:
            return jsonify({"error": "starts_at must be ISO datetime"}), 400
        c.starts_at = v
    if "expires_at" in data:
        v = _parse_iso(data["expires_at"])
        if v is False:
            return jsonify({"error": "expires_at must be ISO datetime"}), 400
        c.expires_at = v
    # reward_type / reward target intentionally NOT editable after creation —
    # mixing semantics on existing codes would corrupt redemption history.

    db.session.commit()
    return jsonify({"message": "Campaign updated", "campaign": c.to_dict(include_counts=True)}), 200


@admin_redeem_bp.route("/campaigns/<int:campaign_id>", methods=["DELETE"])
@admin_required
def delete_campaign(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404
    redeemed = c.codes.filter(RedeemCode.redeemed_at.isnot(None)).count()
    if redeemed > 0:
        return jsonify({
            "error": "Cannot delete a campaign with redeemed codes. Deactivate it instead."
        }), 409
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message": "Campaign deleted"}), 200


# ---------------------------------------------------------------------------
# Admin: generate codes
# ---------------------------------------------------------------------------


_GEN_CAP = 10000


@admin_redeem_bp.route("/campaigns/<int:campaign_id>/generate", methods=["POST"])
@admin_required
def generate_codes(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404

    data = request.get_json() or {}
    try:
        count = int(data.get("count") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "count must be a positive integer"}), 400
    if count <= 0:
        return jsonify({"error": "count must be a positive integer"}), 400
    if count > _GEN_CAP:
        return jsonify({"error": f"count cannot exceed {_GEN_CAP} per request"}), 400

    created: list[str] = []
    # Generate-and-insert with a small retry on collision (the alphabet is
    # 31^12 ≈ 7.9e17 — collisions are vanishingly rare but possible).
    attempts = 0
    max_attempts = count * 3 + 50
    while len(created) < count and attempts < max_attempts:
        attempts += 1
        code = _gen_code()
        rc = RedeemCode(code=code, campaign_id=c.id)
        db.session.add(rc)
        try:
            db.session.flush()
            created.append(code)
        except IntegrityError:
            db.session.rollback()
            continue

    db.session.commit()
    return jsonify({
        "message": f"Generated {len(created)} codes",
        "generated": len(created),
        "requested": count,
        "codes": created,
    }), 201


# ---------------------------------------------------------------------------
# Admin: list/export codes for a campaign
# ---------------------------------------------------------------------------


@admin_redeem_bp.route("/campaigns/<int:campaign_id>/codes", methods=["GET"])
@admin_required
def list_codes(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = min(max(request.args.get("per_page", 50, type=int), 1), 500)
    status = (request.args.get("status") or "all").lower()

    query = RedeemCode.query.filter_by(campaign_id=c.id)
    if status == "redeemed":
        query = query.filter(RedeemCode.redeemed_at.isnot(None))
    elif status == "unredeemed":
        query = query.filter(RedeemCode.redeemed_at.is_(None))
    query = query.order_by(RedeemCode.id.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "codes": [code.to_dict() for code in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
        "campaign": c.to_dict(include_counts=True),
    }), 200


@admin_redeem_bp.route("/campaigns/<int:campaign_id>/codes.csv", methods=["GET"])
@admin_required
def export_codes_csv(campaign_id: int):
    c = db.session.get(RedeemCampaign, campaign_id)
    if not c:
        return jsonify({"error": "Campaign not found"}), 404

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "code", "share_url", "redeemed", "redeemed_at", "redeemed_by_email", "created_at",
    ])

    # Build share-URL base from request host (admins typically run this in
    # the same browser session so origin matches the live frontend).
    origin = request.host_url.rstrip("/")
    # If the API is served under the same domain as the SPA, this is fine;
    # admins can also strip the /api host if they prefer.

    rows = RedeemCode.query.filter_by(campaign_id=c.id).order_by(RedeemCode.id.asc()).all()
    for r in rows:
        writer.writerow([
            r.code,
            f"{origin}/redeem?code={r.code}",
            "yes" if r.redeemed_at else "no",
            r.redeemed_at.isoformat() if r.redeemed_at else "",
            r.redeemed_by.email if r.redeemed_by else "",
            r.created_at.isoformat(),
        ])

    safe_name = "".join(ch if ch.isalnum() else "_" for ch in c.name)[:60] or f"campaign_{c.id}"
    resp = make_response(buf.getvalue())
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = (
        f'attachment; filename="redeem_codes_{c.id}_{safe_name}.csv"'
    )
    return resp


# ---------------------------------------------------------------------------
# User: redeem
# ---------------------------------------------------------------------------


def _grant_subscription(user: User, campaign: RedeemCampaign) -> Subscription:
    """Create an active Subscription row for the user. No payment, amount=0."""
    plan = campaign.reward_subscription_plan or "custom"
    duration = (
        Subscription.PLAN_DURATIONS.get(plan)
        if plan in Subscription.PLAN_DURATIONS
        else campaign.reward_subscription_duration_days
    ) or campaign.reward_subscription_duration_days or 30

    now = datetime.now(timezone.utc)
    sub = Subscription(
        user_id=user.id,
        plan=plan if plan in Subscription.PLAN_DURATIONS else "monthly",
        amount=0,
        amount_subtotal=0,
        promo_discount=0,
        credit_applied=0,
        status="active",
        payment_type="redeem_code",
        paid_at=now,
        starts_at=now,
        expires_at=now + timedelta(days=int(duration)),
    )
    db.session.add(sub)
    db.session.flush()
    return sub


def _grant_game(user: User, campaign: RedeemCampaign) -> tuple[Order, Assignment] | tuple[None, None]:
    """Create a free Order + Assignment for the campaign's game.

    Returns (order, assignment) on success, (None, None) if no GameAccount
    row exists for the game.
    """
    game = campaign.reward_game
    if not game:
        return None, None

    # Pick an active account that owns this game (per project_fulfillment_model,
    # no hard stock cap — fail only when no GameAccount row exists at all).
    assignment_count = (
        func.coalesce(
            db.session.query(func.count(Assignment.id))
            .filter(
                Assignment.steam_account_id == GameAccount.steam_account_id,
                Assignment.game_id == game.id,
                Assignment.is_revoked == False,  # noqa: E712
            )
            .correlate(GameAccount)
            .scalar_subquery(),
            0,
        )
    )
    total_game_count = (
        func.coalesce(
            db.session.query(func.count(GameAccount.id))
            .filter(GameAccount.steam_account_id == SteamAccount.id)
            .correlate(SteamAccount)
            .scalar_subquery(),
            0,
        )
    )
    best = (
        GameAccount.query.join(SteamAccount)
        .filter(
            GameAccount.game_id == game.id,
            SteamAccount.is_active == True,  # noqa: E712
        )
        .order_by(
            GameAccount.is_shared.asc(),
            assignment_count.asc(),
            total_game_count.asc(),
            GameAccount.id.asc(),
        )
        .with_for_update()
        .first()
    )
    if not best:
        return None, None

    now = datetime.now(timezone.utc)
    order = Order(
        user_id=user.id,
        game_id=game.id,
        status="fulfilled",
        type="purchase",
        amount=0,
        amount_subtotal=0,
        promo_discount=0,
        credit_applied=0,
        paid_at=now,
        payment_type="redeem_code",
    )
    db.session.add(order)
    db.session.flush()

    assignment = Assignment(
        order_id=order.id,
        user_id=user.id,
        steam_account_id=best.steam_account_id,
        game_id=game.id,
    )
    db.session.add(assignment)
    db.session.flush()
    order.assignment_id = assignment.id
    return order, assignment


@redeem_bp.route("/redeem", methods=["POST"])
@jwt_required()
def redeem():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    raw_code = (data.get("code") or "").strip().upper()
    if not raw_code:
        return jsonify({"error": "Kode redeem wajib diisi"}), 400

    # Accept input with or without dashes/spaces; normalize to stored format
    # by uppercasing and dashing every 4 chars if no dash present.
    cleaned = raw_code.replace(" ", "").replace("-", "")
    if cleaned.isalnum() and len(cleaned) == 12:
        normalized = f"{cleaned[0:4]}-{cleaned[4:8]}-{cleaned[8:12]}"
    else:
        normalized = raw_code

    now = datetime.now(timezone.utc)

    # Atomic redemption: lock the RedeemCode row, validate, mutate.
    try:
        rc = (
            RedeemCode.query
            .filter(db.or_(RedeemCode.code == normalized, RedeemCode.code == raw_code))
            .with_for_update()
            .first()
        )
        if not rc:
            return jsonify({"error": "Kode tidak ditemukan"}), 404

        if rc.redeemed_at is not None:
            return jsonify({"error": "Kode ini sudah pernah ditukar"}), 409

        campaign = db.session.get(RedeemCampaign, rc.campaign_id)
        if not campaign or not campaign.is_active:
            return jsonify({"error": "Campaign tidak aktif"}), 410
        if not campaign.is_within_window(now):
            return jsonify({"error": "Campaign sudah berakhir atau belum dimulai"}), 410

        # Enforce per-user limit on the same campaign.
        used_by_user = (
            RedeemCode.query
            .filter_by(campaign_id=campaign.id, redeemed_by_user_id=user.id)
            .filter(RedeemCode.redeemed_at.isnot(None))
            .count()
        )
        if used_by_user >= campaign.max_redemptions_per_user:
            return jsonify({
                "error": f"Kamu sudah mencapai batas {campaign.max_redemptions_per_user} kali redeem untuk campaign ini"
            }), 409

        granted_sub_id = None
        granted_order_id = None
        redirect_to = "/my-games"
        reward_label = campaign.reward_label()

        if campaign.reward_type == "subscription":
            sub = _grant_subscription(user, campaign)
            granted_sub_id = sub.id
            redirect_to = "/subscription"
        elif campaign.reward_type == "game":
            order, assignment = _grant_game(user, campaign)
            if not order:
                db.session.rollback()
                return jsonify({
                    "error": "Maaf, akun untuk game ini sedang habis. Hubungi admin."
                }), 503
            granted_order_id = order.id
            redirect_to = "/my-games"
        else:
            db.session.rollback()
            return jsonify({"error": "Tipe reward tidak dikenal"}), 500

        rc.redeemed_by_user_id = user.id
        rc.redeemed_at = now
        rc.granted_subscription_id = granted_sub_id
        rc.granted_order_id = granted_order_id

        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Redeem failed for code=%s user=%s", raw_code, user_id)
        return jsonify({"error": "Terjadi kesalahan saat redeem"}), 500

    return jsonify({
        "message": "Kode berhasil ditukar!",
        "reward_label": reward_label,
        "reward_type": campaign.reward_type,
        "redirect_to": redirect_to,
        "granted_subscription_id": granted_sub_id,
        "granted_order_id": granted_order_id,
    }), 200
