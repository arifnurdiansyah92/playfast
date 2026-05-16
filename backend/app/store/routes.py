"""Store endpoints: public catalog, ordering, credentials, code generation."""

import hashlib
import logging
import os
import secrets
import time
import threading
from collections import defaultdict
from datetime import datetime, timezone

import midtransclient
from flask import Blueprint, current_app, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

logger = logging.getLogger(__name__)

from app.extensions import db
from app.models import (
    AccountFlag,
    Assignment,
    CartItem,
    CodeRequestLog,
    Game,
    GameAccount,
    Order,
    PlayInstruction,
    PromoCode,
    PromoCodeUsage,
    ReferralReward,
    SiteSetting,
    SteamAccount,
    Subscription,
    User,
)
from app.steam.service import get_guard_code
from app.store.pricing import compute_final_amount, validate_promo_code

store_bp = Blueprint("store", __name__, url_prefix="/api/store")

# ---------------------------------------------------------------------------
# Midtrans Configuration
# ---------------------------------------------------------------------------

def _get_snap():
    """Create Midtrans Snap client using settings from DB."""
    payment_mode = SiteSetting.get("payment_mode")
    if payment_mode == "midtrans_production":
        server_key = SiteSetting.get("midtrans_production_server_key")
        client_key = SiteSetting.get("midtrans_production_client_key")
        is_production = True
    else:
        server_key = SiteSetting.get("midtrans_sandbox_server_key")
        client_key = SiteSetting.get("midtrans_sandbox_client_key")
        is_production = False

    # Fall back to env vars if DB settings are empty
    if not server_key:
        server_key = os.getenv("MIDTRANS_SERVER_KEY", "")
    if not client_key:
        client_key = os.getenv("MIDTRANS_CLIENT_KEY", "")

    return midtransclient.Snap(
        is_production=is_production,
        server_key=server_key,
        client_key=client_key,
    )


def _get_midtrans_server_key():
    """Get current Midtrans server key for webhook verification."""
    payment_mode = SiteSetting.get("payment_mode")
    if payment_mode == "midtrans_production":
        key = SiteSetting.get("midtrans_production_server_key")
    else:
        key = SiteSetting.get("midtrans_sandbox_server_key")
    return key or os.getenv("MIDTRANS_SERVER_KEY", "")

# ---------------------------------------------------------------------------
# In-memory rate limiter for code generation (per-user, 10 req/min)
# ---------------------------------------------------------------------------
_code_rate_lock = threading.Lock()
_code_rate_log: dict[int, list[float]] = defaultdict(list)
_CODE_RATE_LIMIT = 10
_CODE_RATE_WINDOW = 60  # seconds


def _check_code_rate_limit(user_id: int) -> bool:
    """Return True if the request is allowed, False if rate-limited."""
    now = time.time()
    with _code_rate_lock:
        timestamps = _code_rate_log[user_id]
        # Prune old entries outside the window
        _code_rate_log[user_id] = [t for t in timestamps if now - t < _CODE_RATE_WINDOW]
        if len(_code_rate_log[user_id]) >= _CODE_RATE_LIMIT:
            return False
        _code_rate_log[user_id].append(now)
        return True


# Per-user rate limiter for promo validation — tighter since this is the
# enumeration-attack surface. 10 attempts / minute is plenty for legit typos.
_promo_rate_lock = threading.Lock()
_promo_rate_log: dict[int, list[float]] = defaultdict(list)
_PROMO_RATE_LIMIT = 10
_PROMO_RATE_WINDOW = 60  # seconds


def _check_promo_rate_limit(user_id: int) -> bool:
    now = time.time()
    with _promo_rate_lock:
        timestamps = _promo_rate_log[user_id]
        _promo_rate_log[user_id] = [t for t in timestamps if now - t < _PROMO_RATE_WINDOW]
        if len(_promo_rate_log[user_id]) >= _PROMO_RATE_LIMIT:
            return False
        _promo_rate_log[user_id].append(now)
        return True

DEFAULT_PLAY_INSTRUCTIONS = """## Cara Main (Mode Offline)

1. Buka Steam dan klik "Login"
2. Masukkan username dan password yang tertera di atas
3. Saat diminta kode Steam Guard, klik "Buat Kode" di halaman ini dan masukkan kodenya
4. Setelah login, buka Library dan install/download game-nya
5. Setelah download selesai, klik menu Steam → Go Offline
6. Jalankan dan mainkan game dalam mode offline

**Penting:**
- Selalu main dalam mode OFFLINE untuk menghindari konflik dengan pengguna lain
- Jangan ubah password akun
- Jangan tambah teman atau ubah pengaturan akun"""


def _catalog_visible_game_ids():
    """Subquery of game_ids that should appear in the public catalog.

    Includes games owned by active accounts AND games owned by inactive
    accounts the admin has marked as `show_in_catalog_when_disabled`.

    Use this for catalog/browse/genres/featured/showcase/claimable queries.
    Do NOT use it for order fulfillment, the buy availability check, or
    round-robin assignment — those must filter by is_active=True only to
    avoid taking money for unfulfillable orders or assigning a disabled
    account to a real order.
    """
    return (
        db.session.query(GameAccount.game_id)
        .join(SteamAccount)
        .filter(
            or_(
                SteamAccount.is_active == True,  # noqa: E712
                SteamAccount.show_in_catalog_when_disabled == True,  # noqa: E712
            )
        )
        .group_by(GameAccount.game_id)
        .subquery()
    )


def _get_active_subscription(user_id: int):
    """Return the user's active subscription, or None. Expires stale subscriptions."""
    sub = (
        Subscription.query
        .filter_by(user_id=user_id, status="active")
        .order_by(Subscription.expires_at.desc())
        .first()
    )
    if sub and not sub.is_active:
        sub.status = "expired"
        # Revoke all subscription-type assignments for this user
        sub_orders = Order.query.filter_by(user_id=user_id, type="subscription", status="fulfilled").all()
        for order in sub_orders:
            if order.assignment and not order.assignment.is_revoked:
                order.assignment.is_revoked = True
                order.assignment.revoked_at = datetime.now(timezone.utc)
        db.session.commit()
        return None
    return sub


@store_bp.route("/site/discord-url", methods=["GET"])
def site_discord_url():
    """Public endpoint: returns the configured Discord invite URL.

    Powers the /discord route on the site, which redirects visitors to the
    current invite. Returns an empty string when the admin hasn't set one
    yet — the route handler falls back to homepage in that case.
    """
    return jsonify({"url": SiteSetting.get("discord_invite_url") or ""}), 200


@store_bp.route("/site/tutorial-url", methods=["GET"])
def site_tutorial_url():
    """Public: YouTube tutorial video URL shown on the landing page.

    Empty string when the admin hasn't set one — the landing hides the
    section entirely in that case so we don't render a broken iframe.
    """
    return jsonify({"url": SiteSetting.get("tutorial_youtube_url") or ""}), 200


@store_bp.route("/payment-config", methods=["GET"])
def payment_config():
    """Public endpoint: returns payment mode + the WA contact number, plus
    Midtrans/manual-mode specifics. WhatsApp number is always returned because
    several public pages (contact, terms, privacy, forgot-password, play page,
    landing promo banner) link to wa.me/<number> regardless of payment mode.
    """
    mode = SiteSetting.get("payment_mode")
    result = {
        "payment_mode": mode,
        "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
    }
    if mode == "manual":
        result["qris_image_url"] = SiteSetting.get("manual_qris_image_url")
        result["instructions"] = SiteSetting.get("manual_payment_instructions")
    elif mode == "tripay":
        # Tripay hosts its own checkout, so the frontend only needs to know
        # the mode — it gets the checkout URL when it actually creates a tx.
        result["tripay_method"] = SiteSetting.get("tripay_payment_method") or "QRIS2"
    elif mode == "midtrans_production":
        result["client_key"] = SiteSetting.get("midtrans_production_client_key")
        result["snap_url"] = "https://app.midtrans.com/snap/snap.js"
    else:
        result["client_key"] = SiteSetting.get("midtrans_sandbox_client_key")
        result["snap_url"] = "https://app.sandbox.midtrans.com/snap/snap.js"
    return jsonify(result), 200


@store_bp.route("/subscription/plans", methods=["GET"])
def subscription_plans():
    """Return available subscription plans with prices."""
    plans = []
    for plan_key, duration in Subscription.PLAN_DURATIONS.items():
        price_str = SiteSetting.get(f"sub_price_{plan_key}")
        price = int(price_str) if price_str else 0
        if price > 0:
            plans.append({
                "plan": plan_key,
                "label": Subscription.PLAN_LABELS.get(plan_key, plan_key),
                "price": price,
                "duration_days": duration,
            })
    return jsonify({"plans": plans}), 200


@store_bp.route("/promo-banner-config", methods=["GET"])
def promo_banner_config():
    """Public endpoint for landing promo banner config. Returns enabled state,
    date-range check, and resolved promo price from target plan."""
    enabled = (SiteSetting.get("promo_banner_enabled") or "false").lower() == "true"
    start_str = SiteSetting.get("promo_banner_start_date") or ""
    end_str = SiteSetting.get("promo_banner_end_date") or ""
    target_plan = SiteSetting.get("promo_banner_target_plan") or "lifetime"

    now = datetime.now(timezone.utc)

    def _parse(s):
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    start_dt = _parse(start_str)
    end_dt = _parse(end_str)
    now_in_range = bool(start_dt and end_dt and start_dt <= now <= end_dt)

    price_str = SiteSetting.get(f"sub_price_{target_plan}")
    promo_price = int(price_str) if price_str and price_str.isdigit() else 0
    plan_label = Subscription.PLAN_LABELS.get(target_plan, target_plan)

    regular_price_str = SiteSetting.get("promo_banner_regular_price") or "0"
    features_str = SiteSetting.get("promo_banner_features") or ""
    features = [f.strip() for f in features_str.split("|") if f.strip()]

    return jsonify({
        "enabled": enabled,
        "now_in_range": now_in_range,
        "start_date": start_str,
        "end_date": end_str,
        "target_plan": target_plan,
        "plan_label": plan_label,
        "promo_price": promo_price,
        "regular_price": int(regular_price_str) if regular_price_str.isdigit() else 0,
        "eyebrow": SiteSetting.get("promo_banner_eyebrow") or "",
        "headline": SiteSetting.get("promo_banner_headline") or "",
        "subhead": SiteSetting.get("promo_banner_subhead") or "",
        "features": features,
        "cta_text": SiteSetting.get("promo_banner_cta_text") or "",
        "wa_message_template": SiteSetting.get("promo_banner_wa_message") or "",
        "session_key_suffix": SiteSetting.get("promo_banner_session_key_suffix") or "v1",
    }), 200


@store_bp.route("/subscription/subscribe", methods=["POST"])
@jwt_required()
def subscribe():
    """Create a new subscription with pending_payment status."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    plan = data.get("plan", "")

    if plan not in Subscription.PLAN_DURATIONS:
        return jsonify({"error": "Invalid plan. Choose: monthly, 3monthly, 6monthly, yearly, lifetime"}), 400

    # Check for existing active subscription
    active_sub = _get_active_subscription(user_id)
    if active_sub:
        return jsonify({"error": "You already have an active subscription", "subscription": active_sub.to_dict(include_snap_token=True)}), 409

    # Check for existing pending subscription
    pending_sub = Subscription.query.filter_by(
        user_id=user_id, status="pending_payment"
    ).first()
    if pending_sub and pending_sub.snap_token:
        return jsonify({
            "message": "Existing pending subscription found",
            "subscription": pending_sub.to_dict(include_snap_token=True),
            "snap_token": pending_sub.snap_token,
        }), 200

    price_str = SiteSetting.get(f"sub_price_{plan}")
    price = int(price_str) if price_str else 0
    if price <= 0:
        return jsonify({"error": "Subscription plan not available"}), 400

    # ----- Compute pricing with promo + referral credit -----
    subtotal = price
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    pricing = compute_final_amount(
        subtotal=subtotal,
        user_id=user_id,
        promo_code=promo_code_input,
        apply_credit=apply_credit,
        order_type="subscription",
        plan=plan,
    )
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["total"]

    user = db.session.get(User, user_id)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"SUB-{user_id}-{plan}-{timestamp}"

    sub = Subscription(
        user_id=user_id,
        plan=plan,
        amount=final_amount,
        amount_subtotal=subtotal,
        promo_discount=pricing["promo_discount"],
        credit_applied=pricing["credit_applied"],
        promo_code_id=pricing["promo_code_id"],
        midtrans_order_id=midtrans_order_id,
    )
    db.session.add(sub)
    db.session.flush()

    user_obj = db.session.get(User, user_id)
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            subscription_id=sub.id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)

    if final_amount == 0:
        sub.payment_type = "credit"
        sub.paid_at = datetime.now(timezone.utc)
        sub.activate()
        _maybe_award_referrer(sub, is_subscription=True)
        db.session.commit()
        _send_subscription_welcome(sub)
        return jsonify({
            "message": "Subscription activated via credit/discount",
            "subscription": sub.to_dict(include_snap_token=True),
            "payment_mode": "credit",
        }), 201

    payment_mode = SiteSetting.get("payment_mode")

    if payment_mode == "manual":
        db.session.commit()
        return jsonify({
            "message": "Subscription created, awaiting manual payment",
            "subscription": sub.to_dict(include_snap_token=True),
            "payment_mode": "manual",
            "manual_info": {
                "qris_image_url": SiteSetting.get("manual_qris_image_url"),
                "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
                "instructions": SiteSetting.get("manual_payment_instructions"),
            },
        }), 201
    elif payment_mode == "tripay":
        from app.tripay import service as tripay
        if not tripay.is_configured():
            db.session.rollback()
            return jsonify({"error": "Tripay belum dikonfigurasi. Hubungi admin."}), 503

        try:
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            tx = tripay.create_transaction(
                merchant_ref=midtrans_order_id,
                amount=final_amount,
                customer_email=user.email if user else "",
                customer_name=(user.email.split("@")[0] if user and user.email else "Customer"),
                item_name=f"Playfast {Subscription.PLAN_LABELS.get(plan, plan)} Subscription",
                callback_url=f"{frontend_url}/callback/tripay",
                return_url=f"{frontend_url}/subscription/{sub.id}",
            )
            sub.tripay_reference = tx.get("reference")
            # Stash checkout_url in snap_token so the confirm page can
            # re-link to Tripay if the customer closed the tab and came
            # back — single nullable string column already exists.
            sub.snap_token = tx.get("checkout_url")
            db.session.commit()
            return jsonify({
                "message": "Subscription created, awaiting payment",
                "subscription": sub.to_dict(include_snap_token=True),
                "payment_mode": "tripay",
                "checkout_url": tx.get("checkout_url"),
                "tripay_reference": tx.get("reference"),
            }), 201
        except RuntimeError as e:
            db.session.rollback()
            logger.exception("Tripay create failed for subscription: %s", e)
            # Surface Tripay's own message — usually "Invalid signature",
            # "Method not available", etc. — so admin can fix the config.
            return jsonify({"error": f"Tripay: {e}"}), 502
        except Exception as e:  # noqa: BLE001 — last-ditch so the worker never dies silently
            db.session.rollback()
            logger.exception("Unexpected error in Tripay subscription path: %s", e)
            return jsonify({"error": f"Internal error: {type(e).__name__}: {e}"}), 500
    else:
        try:
            snap = _get_snap()
            transaction = snap.create_transaction({
                "transaction_details": {
                    "order_id": midtrans_order_id,
                    "gross_amount": final_amount,
                },
                "item_details": [{
                    "id": f"sub_{plan}",
                    "price": final_amount,
                    "quantity": 1,
                    "name": f"Playfast {Subscription.PLAN_LABELS.get(plan, plan)} Subscription",
                }],
                "customer_details": {
                    "email": user.email if user else "",
                },
            })
            snap_token = transaction["token"]
            sub.snap_token = snap_token
            db.session.commit()

            return jsonify({
                "message": "Subscription created, awaiting payment",
                "subscription": sub.to_dict(include_snap_token=True),
                "payment_mode": "midtrans",
                "snap_token": snap_token,
            }), 201
        except Exception as e:
            db.session.rollback()
            logger.exception("Failed to create Midtrans transaction for subscription: %s", e)
            return jsonify({"error": "Payment service unavailable, please try again later"}), 502


@store_bp.route("/subscription/status", methods=["GET"])
@jwt_required()
def subscription_status():
    """Return the current user's subscription status."""
    user_id = int(get_jwt_identity())
    active_sub = _get_active_subscription(user_id)

    if active_sub:
        return jsonify({
            "is_subscribed": True,
            "subscription": active_sub.to_dict(include_snap_token=True),
        }), 200

    # Check for pending subscription
    pending_sub = Subscription.query.filter_by(
        user_id=user_id, status="pending_payment"
    ).first()

    return jsonify({
        "is_subscribed": False,
        "subscription": pending_sub.to_dict(include_snap_token=True) if pending_sub else None,
    }), 200


@store_bp.route("/subscription/<int:sub_id>", methods=["GET"])
@jwt_required()
def subscription_detail(sub_id: int):
    """Return full detail for a single subscription owned by the current user."""
    user_id = int(get_jwt_identity())
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404
    if sub.user_id != user_id:
        # Return 403 with the same message as 404 to avoid leaking existence
        # of other users' subscriptions via ID probing.
        return jsonify({"error": "Subscription not found"}), 403

    payment_mode = SiteSetting.get("payment_mode")
    response = {
        "subscription": sub.to_dict(include_snap_token=True),
        "payment_mode": payment_mode,
    }
    if payment_mode == "manual":
        response["manual_info"] = {
            "qris_image_url": SiteSetting.get("manual_qris_image_url"),
            "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
            "instructions": SiteSetting.get("manual_payment_instructions"),
        }
    return jsonify(response), 200


@store_bp.route("/subscription/<int:sub_id>/status", methods=["GET"])
@jwt_required()
def subscription_poll_status(sub_id: int):
    """Lightweight status poll for the detail page. Auth-checked."""
    user_id = int(get_jwt_identity())
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404
    if sub.user_id != user_id:
        # Return 403 with the same message as 404 to avoid leaking existence
        # of other users' subscriptions via ID probing.
        return jsonify({"error": "Subscription not found"}), 403

    return jsonify({
        "status": sub.status,
        "paid_at": sub.paid_at.isoformat() if sub.paid_at else None,
        "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
    }), 200


@store_bp.route("/my-subscriptions", methods=["GET"])
@jwt_required()
def my_subscriptions():
    """Return all subscriptions for the current user, newest first."""
    user_id = int(get_jwt_identity())
    subs = (
        Subscription.query
        .filter_by(user_id=user_id)
        .order_by(Subscription.created_at.desc())
        .all()
    )
    return jsonify({"subscriptions": [s.to_dict() for s in subs]}), 200


@store_bp.route("/promo-codes/validate", methods=["POST"])
@jwt_required()
def validate_promo():
    """Validate a promo code without persisting a usage.

    Body: { code, order_type: 'game'|'subscription', game_id?, plan?, subtotal }
    Returns: { valid: bool, discount_amount?: int, error?: str }
    """
    user_id = int(get_jwt_identity())

    if not _check_promo_rate_limit(user_id):
        return jsonify({"valid": False, "error": "Terlalu banyak percobaan. Coba lagi dalam 1 menit."}), 429

    data = request.get_json() or {}
    code = (data.get("code") or "").strip()
    order_type = data.get("order_type")
    subtotal = data.get("subtotal")

    if not code:
        return jsonify({"valid": False, "error": "Kode promo kosong"}), 400
    if order_type not in ("game", "subscription"):
        return jsonify({"valid": False, "error": "order_type must be 'game' or 'subscription'"}), 400
    if not isinstance(subtotal, int) or subtotal <= 0:
        return jsonify({"valid": False, "error": "subtotal must be a positive integer"}), 400

    promo, discount, err = validate_promo_code(
        code, user_id, subtotal, order_type,
        game_id=data.get("game_id"),
        plan=data.get("plan"),
    )
    if err:
        return jsonify({"valid": False, "error": err}), 200

    return jsonify({
        "valid": True,
        "discount_amount": discount,
        "code": promo.code,
        "discount_type": promo.discount_type,
        "discount_value": promo.discount_value,
    }), 200


@store_bp.route("/games", methods=["GET"])
def list_games():
    """List enabled games with optional search, genre filter, sorting, and pagination."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 100)

    # Only show enabled games that have at least one catalog-visible account
    available_game_ids = _catalog_visible_game_ids()
    query = Game.query.filter(
        Game.is_enabled == True,  # noqa: E712
        Game.id.in_(db.session.query(available_game_ids.c.game_id)),
    )

    # Search by name
    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(Game.name.ilike(f"%{q}%"))

    # Filter by genre (case-insensitive, checks if the comma-separated genres column contains the value)
    genre = request.args.get("genre", "").strip()
    if genre:
        query = query.filter(func.lower(Game.genres).contains(genre.lower()))

    # Sorting
    sort = request.args.get("sort", "").strip()
    if sort == "price_asc":
        query = query.order_by(Game.price.asc(), Game.name.asc())
    elif sort == "price_desc":
        query = query.order_by(Game.price.desc(), Game.name.asc())
    elif sort == "name":
        query = query.order_by(Game.name.asc())
    elif sort == "newest":
        # "Newest" = newest Steam release date, not catalog add date.
        # Falls back alphabetically when release_date isn't known.
        query = query.order_by(
            Game.release_date.desc().nullslast(),
            Game.name.asc(),
        )
    elif sort == "popular":
        # Sort by order count descending
        order_count = (
            db.session.query(func.count(Order.id))
            .filter(Order.game_id == Game.id)
            .correlate(Game)
            .scalar_subquery()
        )
        query = query.order_by(order_count.desc(), Game.name.asc())
    else:
        # Default (no explicit sort) = newest release first, then most
        # expensive at Steam first. Surfaces the headline value prop —
        # recent AAA at Playfast pricing — at the top of the catalog
        # without the user having to pick a sort.
        query = query.order_by(
            Game.release_date.desc().nullslast(),
            Game.original_price.desc().nullslast(),
            Game.name.asc(),
        )

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # User-facing: no availability/slot info
    games = [g.to_dict() for g in pagination.items]
    return jsonify({
        "games": games,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


@store_bp.route("/genres", methods=["GET"])
def list_genres():
    """Return a sorted list of unique genres across all enabled games."""
    available_game_ids = _catalog_visible_game_ids()
    rows = (
        db.session.query(Game.genres)
        .filter(
            Game.is_enabled == True,  # noqa: E712
            Game.id.in_(db.session.query(available_game_ids.c.game_id)),
            Game.genres.isnot(None),
            Game.genres != "",
        )
        .all()
    )
    genre_set: set[str] = set()
    for (genres_str,) in rows:
        for g in genres_str.split(","):
            stripped = g.strip()
            if stripped:
                genre_set.add(stripped)

    return jsonify({"genres": sorted(genre_set)}), 200


@store_bp.route("/games/featured", methods=["GET"])
def featured_games():
    """Return featured games (flagged by admin)."""
    available_game_ids = _catalog_visible_game_ids()
    games = (
        Game.query.filter(
            Game.is_enabled == True,  # noqa: E712
            Game.is_featured == True,  # noqa: E712
            Game.id.in_(db.session.query(available_game_ids.c.game_id)),
        )
        .order_by(Game.name.asc())
        .limit(12)
        .all()
    )
    return jsonify({"games": [g.to_dict() for g in games]}), 200


@store_bp.route("/games/catalog", methods=["GET"])
def catalog_showcase():
    """Public catalog page: all enabled games with stats for sharing."""
    available_game_ids = _catalog_visible_game_ids()
    games = (
        Game.query.filter(
            Game.is_enabled == True,  # noqa: E712
            Game.id.in_(db.session.query(available_game_ids.c.game_id)),
        )
        # Newest first by release_date, then most expensive (Steam list price)
        # first; games without a known release date sink to the bottom so the
        # ones with real metadata lead the list. is_(None) returns False(0)
        # before True(1) under .asc(), so non-null rows come first regardless
        # of dialect's default NULL ordering.
        .order_by(
            Game.release_date.is_(None).asc(),
            Game.release_date.desc(),
            Game.original_price.is_(None).asc(),
            Game.original_price.desc(),
            Game.price.desc(),
            Game.name.asc(),
        )
        .all()
    )

    games_data = [g.to_dict() for g in games]
    total_value = sum(g.original_price or 0 for g in games)

    # Price tier breakdown based on original Steam price
    tiers = [
        {"label": "> Rp 500K", "min": 500000},
        {"label": "> Rp 200K", "min": 200000},
        {"label": "> Rp 100K", "min": 100000},
        {"label": "> Rp 50K", "min": 50000},
    ]
    tier_counts = []
    for tier in tiers:
        count = sum(1 for g in games if (g.original_price or 0) >= tier["min"])
        if count > 0:
            tier_counts.append({"label": tier["label"], "count": count})

    return jsonify({
        "games": games_data,
        "total_games": len(games),
        "total_value": total_value,
        "tiers": tier_counts,
    }), 200


@store_bp.route("/games/<int:appid>", methods=["GET"])
def game_detail(appid: int):
    """Get a single game's details by Steam appid."""
    game = Game.query.filter_by(appid=appid, is_enabled=True).first()
    if not game:
        return jsonify({"error": "Game not found"}), 404

    return jsonify({"game": game.to_dict()}), 200


def _maybe_award_referrer(order_or_sub, is_subscription=False):
    """If the order's user was referred AND this is their first fulfilled
    payment above the min threshold, award the referrer.
    """
    user = db.session.get(User, order_or_sub.user_id)
    if not user or not user.referred_by_user_id:
        return

    existing = ReferralReward.query.filter_by(referee_user_id=user.id).first()
    if existing:
        return

    min_order = int(SiteSetting.get("referral_min_order") or "50000")
    paid_amount = order_or_sub.amount_subtotal or order_or_sub.amount or 0
    if paid_amount < min_order:
        return

    has_prior_order = Order.query.filter(
        Order.user_id == user.id,
        Order.status == "fulfilled",
        Order.id != (order_or_sub.id if not is_subscription else -1),
    ).first()
    has_prior_sub = Subscription.query.filter(
        Subscription.user_id == user.id,
        Subscription.status == "active",
        Subscription.id != (order_or_sub.id if is_subscription else -1),
    ).first()
    if has_prior_order or has_prior_sub:
        return

    credit_amount = int(SiteSetting.get("referral_referrer_credit") or "10000")
    referrer = db.session.get(User, user.referred_by_user_id)
    if not referrer:
        return

    referrer.referral_credit = (referrer.referral_credit or 0) + credit_amount
    reward = ReferralReward(
        referrer_user_id=referrer.id,
        referee_user_id=user.id,
        trigger_order_id=order_or_sub.id if not is_subscription else None,
        trigger_subscription_id=order_or_sub.id if is_subscription else None,
        credit_awarded=credit_amount,
    )
    db.session.add(reward)


def _send_subscription_welcome(sub):
    """Send the post-activation welcome email with Mode Offline rules.

    Called after every Subscription.activate() success. Failure is logged
    but never raised — the subscription is already active and usable.
    """
    try:
        from app.email_service import send_subscription_welcome_email
        if not sub or not sub.user or not sub.user.email:
            return
        frontend_url = (current_app.config.get("FRONTEND_URL") or "").rstrip("/")
        store_url = f"{frontend_url}/store" if frontend_url else "/store"
        plan_label = (
            sub.PLAN_LABELS.get(sub.plan, sub.plan)
            if hasattr(sub, "PLAN_LABELS")
            else (sub.plan or "Premium")
        )
        send_subscription_welcome_email(
            to=sub.user.email,
            plan_label=plan_label,
            store_url=store_url,
            user_id=sub.user.id,
            subscription_id=sub.id,
        )
    except Exception:
        logger.exception(
            "Failed to send subscription welcome email for sub %s",
            getattr(sub, "id", "?"),
        )


def _fulfill_order(order):
    """Assign a Steam account to a paid order using smart round-robin.

    Picks the active account with the fewest current assignments for the
    ordered game, preferring accounts with fewer total games (burn small
    accounts first, preserve valuable ones).

    Returns True on success, False if no account is available.
    """
    game = order.game

    # Smart assignment: pick the best account for this game.
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
            .filter(
                GameAccount.steam_account_id == SteamAccount.id,
            )
            .correlate(SteamAccount)
            .scalar_subquery(),
            0,
        )
    )

    best_game_account = (
        GameAccount.query.join(SteamAccount)
        .filter(
            GameAccount.game_id == game.id,
            SteamAccount.is_active == True,  # noqa: E712
        )
        .order_by(
            # Direct-owned (is_shared=False) wins over family-shared (True),
            # since shared games inherit Steam Families' single-player-at-a-time
            # constraint and the family owner can kick our customer.
            GameAccount.is_shared.asc(),
            assignment_count.asc(),
            total_game_count.asc(),
            GameAccount.id.asc(),
        )
        .with_for_update()
        .first()
    )

    if not best_game_account:
        logger.error("No accounts available for game %s (order %s)", game.id, order.id)
        return False

    steam_account = best_game_account.steam_account

    # Create assignment
    assignment = Assignment(
        order_id=order.id,
        user_id=order.user_id,
        steam_account_id=steam_account.id,
        game_id=game.id,
    )
    db.session.add(assignment)
    db.session.flush()

    # Link assignment to order and mark fulfilled
    order.assignment_id = assignment.id
    order.status = "fulfilled"
    db.session.commit()

    logger.info(
        "Order %s fulfilled: assigned account %s to user %s for game %s",
        order.id, steam_account.id, order.user_id, game.id,
    )
    _maybe_award_referrer(order, is_subscription=False)

    # Send onboarding email with Mode Offline workflow + safety rules — but
    # ONLY on the user's first ever fulfilled purchase. The Mode Offline
    # rules apply to every Steam access regardless of source, so once the
    # user has been onboarded we don't repeat it for every subsequent game.
    #
    # Skip cases:
    #   - order.type == "subscription": subscriber claims from catalog,
    #     they already received the subscription welcome email.
    #   - prior fulfilled purchase exists: user has been onboarded before.
    #
    # Transactional, sent regardless of email_opted_out. Failure here is
    # non-fatal — the order is already committed and accessible.
    try:
        if order.type == "purchase":
            prior_purchase_count = (
                Order.query.filter(
                    Order.user_id == order.user_id,
                    Order.type == "purchase",
                    Order.status == "fulfilled",
                    Order.id != order.id,
                )
                .count()
            )
            if prior_purchase_count == 0 and order.user and order.user.email:
                from app.email_service import send_order_welcome_email
                frontend_url = (current_app.config.get("FRONTEND_URL") or "").rstrip("/")
                play_url = f"{frontend_url}/play/{order.id}" if frontend_url else f"/play/{order.id}"
                display_name = (
                    game.custom_name
                    or game.name
                    or "Game-mu"
                )
                send_order_welcome_email(
                    to=order.user.email,
                    game_name=display_name,
                    play_url=play_url,
                    user_id=order.user_id,
                    order_id=order.id,
                )
    except Exception:
        logger.exception("Failed to send order welcome email for order %s", order.id)

    return True


@store_bp.route("/orders", methods=["POST"])
@jwt_required()
def create_order():
    """
    Create a new order with pending_payment status, generate a Midtrans
    snap token, and return it to the frontend for payment.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    # Accept either game_id or appid
    game_id = data.get("game_id")
    appid = data.get("appid")

    if not game_id and not appid:
        return jsonify({"error": "game_id or appid is required"}), 400

    if game_id:
        game = db.session.get(Game, game_id)
    else:
        game = Game.query.filter_by(appid=appid).first()

    if not game or not game.is_enabled:
        return jsonify({"error": "Game not found or not available"}), 404

    # Check if user already has an active (non-revoked) order for this game
    existing_order = (
        Order.query.join(Assignment, Order.assignment_id == Assignment.id)
        .filter(
            Order.user_id == user_id,
            Order.game_id == game.id,
            Order.status == "fulfilled",
            Assignment.is_revoked == False,  # noqa: E712
        )
        .first()
    )
    if existing_order:
        # User already has access to this game — don't create a duplicate order,
        # return the existing one so the frontend can route them to it.
        return jsonify({
            "message": "Kamu sudah punya akses ke game ini",
            "order": existing_order.to_dict(),
            "already_owned": True,
        }), 200

    # Also check for an existing pending_payment order for this game
    existing_pending = Order.query.filter_by(
        user_id=user_id,
        game_id=game.id,
        status="pending_payment",
    ).first()
    if existing_pending and existing_pending.snap_token:
        return jsonify({
            "message": "Existing pending order found",
            "order": existing_pending.to_dict(),
            "snap_token": existing_pending.snap_token,
        }), 200

    # Check availability before creating order
    available = (
        GameAccount.query.join(SteamAccount)
        .filter(
            GameAccount.game_id == game.id,
            SteamAccount.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not available:
        return jsonify({"error": "No accounts available for this game"}), 409

    # Check if user has active subscription — auto-fulfill without payment
    active_sub = _get_active_subscription(user_id)
    if active_sub:
        order = Order(
            user_id=user_id,
            game_id=game.id,
            status="pending_payment",
            type="subscription",
            amount=0,
        )
        db.session.add(order)
        db.session.flush()

        order.payment_type = "subscription"
        order.paid_at = datetime.now(timezone.utc)
        success = _fulfill_order(order)
        if not success:
            # No Steam account is available for this game right now. Roll back
            # the order we just staged so we don't leave a fulfilled-without-
            # assignment zombie — the frontend has nothing to show for those
            # (username renders as "N/A"). User can retry later.
            db.session.rollback()
            return jsonify({"error": "No accounts available for this game. Silakan coba lagi nanti."}), 503

        return jsonify({
            "message": "Game access granted via subscription",
            "order": order.to_dict(),
            "payment_mode": "subscription",
        }), 201

    # ----- Compute pricing with promo + referral credit -----
    subtotal = game.price
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    # First-order referee auto-discount (applied before promo)
    user_obj = db.session.get(User, user_id)
    first_order_discount = 0
    if user_obj and user_obj.referred_by_user_id and not Order.query.filter_by(user_id=user_id, status="fulfilled").first():
        referee_pct = int(SiteSetting.get("referral_referee_discount_pct") or "10")
        first_order_discount = int(subtotal * referee_pct / 100)

    subtotal_after_first_order = subtotal - first_order_discount

    pricing = compute_final_amount(
        subtotal=subtotal_after_first_order,
        user_id=user_id,
        promo_code=promo_code_input,
        apply_credit=apply_credit,
        order_type="game",
        game_id=game.id,
    )
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["total"]

    # Fetch user for Midtrans customer details
    user = user_obj

    # Generate unique Midtrans order ID
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"PF-{user_id}-{game.id}-{timestamp}"

    # Create order with pending_payment status
    order = Order(
        user_id=user_id,
        game_id=game.id,
        status="pending_payment",
        type="purchase",
        midtrans_order_id=midtrans_order_id,
        amount_subtotal=subtotal,
        promo_discount=pricing["promo_discount"] + first_order_discount,
        credit_applied=pricing["credit_applied"],
        amount=final_amount,
        promo_code_id=pricing["promo_code_id"],
    )
    db.session.add(order)
    db.session.flush()

    # Deduct credit from user + insert PromoCodeUsage row (if promo applied)
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            order_id=order.id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)

    # If credit + discounts cover the full price, auto-fulfill without payment
    if final_amount == 0:
        order.payment_type = "credit"
        order.paid_at = datetime.now(timezone.utc)
        success = _fulfill_order(order)
        if not success:
            # See note in the subscription branch — no zombie orders.
            db.session.rollback()
            return jsonify({"error": "No accounts available for this game. Silakan coba lagi nanti."}), 503
        db.session.commit()
        return jsonify({
            "message": "Order fulfilled via credit/discount",
            "order": order.to_dict(),
            "payment_mode": "credit",
        }), 201

    payment_mode = SiteSetting.get("payment_mode")

    if payment_mode == "manual":
        # Manual mode: return order with QRIS/WA instructions, admin confirms later
        db.session.commit()
        return jsonify({
            "message": "Order created, awaiting manual payment",
            "order": order.to_dict(),
            "payment_mode": "manual",
            "manual_info": {
                "qris_image_url": SiteSetting.get("manual_qris_image_url"),
                "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
                "instructions": SiteSetting.get("manual_payment_instructions"),
            },
        }), 201
    elif payment_mode == "tripay":
        from app.tripay import service as tripay
        if not tripay.is_configured():
            db.session.rollback()
            return jsonify({"error": "Tripay belum dikonfigurasi. Hubungi admin."}), 503

        logger.info(
            "Tripay order start: order_id=%s amount=%s promo=%s credit=%s",
            order.id, final_amount, pricing["promo_code_id"], pricing["credit_applied"],
        )
        try:
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            tx = tripay.create_transaction(
                merchant_ref=midtrans_order_id,
                amount=final_amount,
                customer_email=user_obj.email if user_obj else "",
                customer_name=(user_obj.email.split("@")[0] if user_obj and user_obj.email else "Customer"),
                item_name=game.name[:50],
                callback_url=f"{frontend_url}/callback/tripay",
                return_url=f"{frontend_url}/order/{order.id}",
            )
            logger.info("Tripay order: create OK ref=%s", tx.get("reference"))
            order.tripay_reference = tx.get("reference")
            # Same dual-purpose-snap-token trick as the subscription branch
            # so the order page can re-link to Tripay later.
            order.snap_token = tx.get("checkout_url")
            db.session.commit()
            logger.info("Tripay order: commit OK order_id=%s", order.id)
            return jsonify({
                "message": "Order created, awaiting payment",
                "order": order.to_dict(),
                "payment_mode": "tripay",
                "checkout_url": tx.get("checkout_url"),
                "tripay_reference": tx.get("reference"),
            }), 201
        except RuntimeError as e:
            db.session.rollback()
            logger.exception("Tripay create failed for order: %s", e)
            return jsonify({"error": f"Tripay: {e}"}), 502
        except Exception as e:  # noqa: BLE001 — last-ditch so the worker never dies silently
            db.session.rollback()
            logger.exception("Unexpected error in Tripay order path: %s", e)
            return jsonify({"error": f"Internal error: {type(e).__name__}: {e}"}), 500
    else:
        # Midtrans mode (sandbox or production)
        try:
            snap = _get_snap()
            transaction = snap.create_transaction({
                "transaction_details": {
                    "order_id": midtrans_order_id,
                    "gross_amount": final_amount,
                },
                "item_details": [{
                    "id": str(game.id),
                    "price": final_amount,
                    "quantity": 1,
                    "name": game.name[:50],
                }],
                "customer_details": {
                    "email": user.email if user else "",
                },
            })
            snap_token = transaction["token"]
            order.snap_token = snap_token
            db.session.commit()

            return jsonify({
                "message": "Order created, awaiting payment",
                "order": order.to_dict(),
                "payment_mode": "midtrans",
                "snap_token": snap_token,
            }), 201

        except Exception as e:
            db.session.rollback()
            logger.exception("Failed to create Midtrans transaction: %s", e)
            return jsonify({"error": "Payment service unavailable, please try again later"}), 502


# ---------------------------------------------------------------------------
# Midtrans Webhook (server-to-server, NO auth)
# ---------------------------------------------------------------------------

@store_bp.route("/webhook/midtrans", methods=["POST"])
def midtrans_webhook():
    """Handle Midtrans payment notification callback.

    This endpoint is called by Midtrans servers -- no JWT required.
    The notification is verified using SHA-512 signature.
    """
    notification = request.get_json(silent=True) or {}

    order_id = notification.get("order_id", "")
    status_code = notification.get("status_code", "")
    gross_amount = notification.get("gross_amount", "")
    transaction_status = notification.get("transaction_status", "")
    fraud_status = notification.get("fraud_status", "")
    payment_type = notification.get("payment_type", "")
    signature_key = notification.get("signature_key", "")

    # Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
    server_key = _get_midtrans_server_key()
    raw = order_id + status_code + gross_amount + server_key
    expected_signature = hashlib.sha512(raw.encode("utf-8")).hexdigest()

    if signature_key != expected_signature:
        logger.warning("Midtrans webhook signature mismatch for order %s", order_id)
        return jsonify({"error": "Invalid signature"}), 403

    # Handle subscription payments (SUB- prefix)
    if order_id.startswith("SUB-"):
        sub = Subscription.query.filter_by(midtrans_order_id=order_id).first()
        if not sub:
            logger.warning("Midtrans webhook: subscription not found for %s", order_id)
            return jsonify({"error": "Subscription not found"}), 404

        if transaction_status in ("capture", "settlement"):
            if transaction_status == "capture" and fraud_status not in ("accept", ""):
                sub.status = "cancelled"
                db.session.commit()
                return jsonify({"status": "cancelled"}), 200

            if sub.status == "pending_payment":
                sub.payment_type = payment_type
                sub.paid_at = datetime.now(timezone.utc)
                sub.activate()
                db.session.commit()
                logger.info("Subscription %s activated for user %s", sub.id, sub.user_id)
                _send_subscription_welcome(sub)

            return jsonify({"status": "ok"}), 200

        elif transaction_status in ("cancel", "deny", "expire"):
            if sub.status == "pending_payment":
                sub.status = "cancelled"
                db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        elif transaction_status == "pending":
            return jsonify({"status": "pending"}), 200

        return jsonify({"status": "ignored"}), 200

    # Look up orders by midtrans_order_id (could be 1 single-buy order or N cart orders)
    orders = Order.query.filter_by(midtrans_order_id=order_id).all()
    if not orders:
        logger.warning("Midtrans webhook: order not found for %s", order_id)
        return jsonify({"error": "Order not found"}), 404

    is_cart = orders[0].checkout_group_id is not None
    logger.info(
        "Midtrans webhook: order=%s status=%s fraud=%s payment_type=%s order_count=%d cart=%s",
        order_id, transaction_status, fraud_status, payment_type, len(orders), is_cart,
    )

    if transaction_status in ("capture", "settlement"):
        if transaction_status == "capture" and fraud_status not in ("accept", ""):
            logger.warning(
                "Midtrans webhook: fraud detected for %s (fraud_status=%s)",
                order_id, fraud_status,
            )
            for o in orders:
                if o.status == "pending_payment":
                    o.status = "cancelled"
            db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        pending_orders = [o for o in orders if o.status == "pending_payment"]
        for o in pending_orders:
            o.payment_type = payment_type
            o.paid_at = datetime.now(timezone.utc)
        db.session.flush()

        fulfilled_orders = []
        for o in pending_orders:
            success = _fulfill_order(o)
            if not success:
                logger.error(
                    "Midtrans webhook: payment received but fulfillment failed for order %s",
                    o.id,
                )
                o.status = "fulfilled"  # mark fulfilled so admin sees + can rotate
            fulfilled_orders.append(o)
        db.session.commit()

        if is_cart and fulfilled_orders:
            _send_cart_welcome(fulfilled_orders)

        return jsonify({"status": "ok"}), 200

    elif transaction_status in ("cancel", "deny", "expire"):
        for o in orders:
            if o.status == "pending_payment":
                o.status = "cancelled"
        db.session.commit()
        logger.info("Midtrans webhook: orders for %s cancelled (%s)", order_id, transaction_status)
        return jsonify({"status": "cancelled"}), 200

    elif transaction_status == "pending":
        # Payment is pending (e.g. bank transfer) -- do nothing
        return jsonify({"status": "pending"}), 200

    else:
        logger.info("Midtrans webhook: unhandled status %s for %s", transaction_status, order_id)
        return jsonify({"status": "ignored"}), 200


@store_bp.route("/callback/tripay", methods=["POST"])
def tripay_callback():
    """Handle Tripay payment callback.

    Public endpoint — no JWT. Authenticity is verified via HMAC-SHA256 of
    the raw request body using the merchant's private key, sent in the
    `X-Callback-Signature` header. Tripay also includes `X-Callback-Event`
    (usually `payment_status`) which we don't currently switch on.

    Idempotent: rerunning the callback on an already-fulfilled order is a
    no-op so duplicate webhooks don't cause double fulfillment.
    """
    from app.tripay import service as tripay

    raw_body = request.get_data() or b""
    sig = request.headers.get("X-Callback-Signature", "")

    if not tripay.verify_callback_signature(raw_body, sig):
        logger.warning("Tripay callback signature mismatch")
        return jsonify({"success": False, "message": "Invalid signature"}), 403

    payload = request.get_json(silent=True) or {}
    reference = payload.get("reference", "")
    merchant_ref = payload.get("merchant_ref", "")
    status = (payload.get("status") or "").upper()
    paid_amount = int(payload.get("total_amount") or payload.get("amount_received") or 0)
    payment_method = payload.get("payment_method") or payload.get("payment_method_code") or "tripay"

    logger.info(
        "Tripay callback: ref=%s merchant_ref=%s status=%s amount=%s",
        reference, merchant_ref, status, paid_amount,
    )

    # Subscription path — merchant_ref starts with SUB-
    if merchant_ref.startswith("SUB-"):
        sub = (
            Subscription.query.filter_by(tripay_reference=reference).first()
            or Subscription.query.filter_by(midtrans_order_id=merchant_ref).first()
        )
        if not sub:
            logger.warning("Tripay callback: subscription not found ref=%s merchant_ref=%s", reference, merchant_ref)
            return jsonify({"success": False, "message": "Subscription not found"}), 404

        if status == tripay.STATUS_PAID:
            if sub.status == "pending_payment":
                # Refuse to fulfill if Tripay says they collected less than
                # we asked for — defensive against tampering / partial pay.
                if paid_amount and paid_amount < sub.amount:
                    logger.warning(
                        "Tripay callback amount mismatch sub %s: expected %s got %s",
                        sub.id, sub.amount, paid_amount,
                    )
                    return jsonify({"success": False, "message": "Amount mismatch"}), 400

                sub.payment_type = f"tripay:{payment_method}"
                sub.paid_at = datetime.now(timezone.utc)
                sub.activate()
                _maybe_award_referrer(sub, is_subscription=True)
                db.session.commit()
                _send_subscription_welcome(sub)
                logger.info("Subscription %s activated via Tripay", sub.id)
            return jsonify({"success": True}), 200

        if status in (tripay.STATUS_EXPIRED, tripay.STATUS_FAILED):
            if sub.status == "pending_payment":
                sub.status = "cancelled"
                db.session.commit()
            return jsonify({"success": True}), 200

        return jsonify({"success": True, "status": "ignored"}), 200

    # Look up order(s) — Tripay returns to single-buy by reference,
    # cart-checkout by merchant_ref. Take all matches in case of cart.
    orders = (
        Order.query.filter_by(tripay_reference=reference).all()
        or Order.query.filter_by(midtrans_order_id=merchant_ref).all()
    )
    if not orders:
        logger.warning("Tripay callback: order not found ref=%s merchant_ref=%s", reference, merchant_ref)
        return jsonify({"success": False, "message": "Order not found"}), 404

    is_cart = orders[0].checkout_group_id is not None
    expected_total = sum(o.amount or 0 for o in orders)

    if status == tripay.STATUS_PAID:
        pending = [o for o in orders if o.status == "pending_payment"]
        if not pending:
            return jsonify({"success": True, "status": "already_processed"}), 200

        if paid_amount and expected_total and paid_amount < expected_total:
            logger.warning(
                "Tripay callback amount mismatch group %s: expected %s got %s",
                merchant_ref, expected_total, paid_amount,
            )
            return jsonify({"success": False, "message": "Amount mismatch"}), 400

        for o in pending:
            o.payment_type = f"tripay:{payment_method}"
            o.paid_at = datetime.now(timezone.utc)
        db.session.flush()

        fulfilled = []
        for o in pending:
            success = _fulfill_order(o)
            if not success:
                logger.error("Tripay callback: paid but fulfillment failed for order %s", o.id)
                o.status = "fulfilled"
            fulfilled.append(o)
        db.session.commit()

        if is_cart and fulfilled:
            _send_cart_welcome(fulfilled)

        return jsonify({"success": True}), 200

    if status in (tripay.STATUS_EXPIRED, tripay.STATUS_FAILED):
        for o in orders:
            if o.status == "pending_payment":
                o.status = "cancelled"
        db.session.commit()
        return jsonify({"success": True}), 200

    return jsonify({"success": True, "status": "ignored"}), 200


# ---------------------------------------------------------------------------
# Order pay / status endpoints
# ---------------------------------------------------------------------------

@store_bp.route("/orders/<int:order_id>/pay", methods=["POST"])
@jwt_required()
def order_pay(order_id: int):
    """Return existing snap_token for a pending_payment order (retry payment)."""
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if order.status != "pending_payment":
        return jsonify({"error": "Order is not awaiting payment", "status": order.status}), 400

    if not order.snap_token:
        return jsonify({"error": "No payment token available for this order"}), 400

    return jsonify({
        "snap_token": order.snap_token,
        "order": order.to_dict(),
    }), 200


@store_bp.route("/orders/<int:order_id>/status", methods=["GET"])
@jwt_required()
def order_status(order_id: int):
    """Return just the order status (for frontend polling after payment)."""
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    return jsonify({
        "order_id": order.id,
        "status": order.status,
        "payment_type": order.payment_type,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
    }), 200


@store_bp.route("/orders", methods=["GET"])
@jwt_required()
def list_orders():
    """List the current user's orders."""
    user_id = int(get_jwt_identity())
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 100)

    # Include subscription-typed orders too: those are per-game claims by
    # Premium subscribers (amount=0, payment_type='subscription'). Users
    # want them visible in /pesanan so they can track which games they've
    # actually played. Subscription *plan* purchases live in the separate
    # Subscription table and are surfaced via the Subscription tab.
    pagination = (
        Order.query.filter_by(user_id=user_id)
        .order_by(Order.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    orders = [o.to_dict(include_credentials=True) for o in pagination.items]
    return jsonify({
        "orders": orders,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


@store_bp.route("/my-games", methods=["GET"])
@jwt_required()
def my_games():
    """
    List all games the user has access to, including bonus games.
    For each fulfilled order with an assigned account, find ALL games
    that account owns and return them — purchased ones marked as 'purchased',
    others as 'bonus'. For active premium subscribers, also append every
    other enabled game in the catalog as 'subscription' with no order_id
    yet — the frontend claims those on click (creates an order + assignment
    via POST /orders, which auto-fulfills because the sub is active).
    """
    user_id = int(get_jwt_identity())
    # Trigger lazy expiry check for subscription
    active_sub = _get_active_subscription(user_id)

    # Get all active (non-revoked) assignments for this user
    assignments = (
        Assignment.query
        .filter_by(user_id=user_id, is_revoked=False)
        .join(Order, Assignment.order_id == Order.id)
        .filter(Order.status == "fulfilled")
        .all()
    )

    # Track purchased game IDs and which account serves them
    purchased_game_ids = {}  # game_id -> assignment
    account_ids = set()

    for a in assignments:
        purchased_game_ids[a.game_id] = a
        account_ids.add(a.steam_account_id)

    # For each assigned account, find ALL games it owns
    games_result = []
    seen_game_ids = set()

    for a in assignments:
        # The purchased game itself
        game = db.session.get(Game, a.game_id)
        if game and game.id not in seen_game_ids:
            seen_game_ids.add(game.id)
            gd = game.to_dict()
            source_order = db.session.get(Order, a.order_id)
            gd["type"] = "subscription" if (source_order and source_order.type == "subscription") else "purchased"
            gd["order_id"] = a.order_id
            gd["account_name"] = a.steam_account.account_name if a.steam_account else None
            gd["assignment_id"] = a.id
            games_result.append(gd)

        # All OTHER games on the same account = bonus (skip free games)
        bonus_links = (
            GameAccount.query
            .filter_by(steam_account_id=a.steam_account_id)
            .join(Game)
            .filter(
                Game.is_enabled == True,  # noqa: E712
                Game.price > 0,
            )
            .all()
        )
        for link in bonus_links:
            if link.game_id not in seen_game_ids and link.game_id not in purchased_game_ids:
                seen_game_ids.add(link.game_id)
                bg = link.game.to_dict()
                bg["type"] = "bonus"
                bg["order_id"] = a.order_id  # from the purchase that gave access to this account
                bg["account_name"] = a.steam_account.account_name if a.steam_account else None
                bg["assignment_id"] = a.id
                games_result.append(bg)

    # Premium subscribers: show every other enabled game in the catalog as
    # claimable. Includes catalog-visible accounts (active + show-when-
    # disabled). Subscribers clicking a show-when-disabled-only game hit
    # the existing "no account assigned" path at assignment time.
    if active_sub:
        available_game_ids = {
            gid for (gid,) in (
                db.session.query(GameAccount.game_id)
                .join(SteamAccount)
                .filter(
                    or_(
                        SteamAccount.is_active == True,  # noqa: E712
                        SteamAccount.show_in_catalog_when_disabled == True,  # noqa: E712
                    )
                )
                .group_by(GameAccount.game_id)
                .all()
            )
        }
        if available_game_ids:
            claimable_query = (
                Game.query.filter(
                    Game.is_enabled == True,  # noqa: E712
                    Game.price > 0,
                    Game.id.in_(available_game_ids),
                )
            )
            if seen_game_ids:
                claimable_query = claimable_query.filter(~Game.id.in_(seen_game_ids))
            for game in claimable_query.all():
                gd = game.to_dict()
                gd["type"] = "subscription"
                gd["order_id"] = None
                gd["account_name"] = None
                gd["assignment_id"] = None
                gd["claimable"] = True
                games_result.append(gd)

    # Sort: claimed games first (purchased / already-claimed subscription /
    # bonus), then claimable subscription entries last.
    def _sort_key(g):
        claimable_flag = 1 if g.get("claimable") else 0
        type_order = 0 if g["type"] == "purchased" else 1
        return (claimable_flag, type_order, g["name"].lower())

    games_result.sort(key=_sort_key)

    return jsonify({"games": games_result}), 200


@store_bp.route("/orders/<int:order_id>", methods=["GET"])
@jwt_required()
def order_detail(order_id: int):
    """Get order details including credentials."""
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    return jsonify({"order": order.to_dict(include_credentials=True)}), 200


@store_bp.route("/orders/<int:order_id>/code", methods=["POST"])
@jwt_required()
def generate_code(order_id: int):
    """Generate a Steam Guard code for the assigned account."""
    user_id = int(get_jwt_identity())

    if not _check_code_rate_limit(user_id):
        return jsonify({
            "error": "Rate limit exceeded. Maximum 10 code requests per minute. Please wait before trying again."
        }), 429

    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not order.assignment:
        return jsonify({"error": "No account assigned to this order"}), 400

    if order.assignment.is_revoked:
        return jsonify({"error": "Access to this account has been revoked"}), 403

    steam_account = order.assignment.steam_account
    mafile_data = steam_account.mafile_data
    shared_secret = mafile_data.get("shared_secret", "")

    if not shared_secret:
        return jsonify({"error": "No shared_secret available for this account"}), 500

    result = get_guard_code(shared_secret)

    # Log the code request
    log_entry = CodeRequestLog(
        user_id=user_id,
        steam_account_id=steam_account.id,
        assignment_id=order.assignment.id,
        code=result["code"],
        ip_address=request.remote_addr,
    )
    db.session.add(log_entry)
    db.session.commit()

    return jsonify({
        "code": result["code"],
        "remaining": result["remaining"],
    }), 200


@store_bp.route("/orders/<int:order_id>/flag", methods=["POST"])
@jwt_required()
def flag_account_from_order(order_id: int):
    """User reports an issue with the Steam account assigned to this order.

    Body: { reason: str, description?: str }
    """
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if not order.assignment:
        return jsonify({"error": "No account assigned to this order"}), 400

    data = request.get_json() or {}
    reason = (data.get("reason") or "").strip().lower()
    description = (data.get("description") or "").strip() or None

    if reason not in AccountFlag.REASON_CHOICES:
        return jsonify({
            "error": f"Invalid reason. Must be one of: {', '.join(AccountFlag.REASON_CHOICES)}"
        }), 400

    # Avoid duplicate spam: if the same user already has a 'new' flag for this
    # account, just append the description to the existing one rather than
    # creating a new row.
    existing = AccountFlag.query.filter_by(
        user_id=user_id,
        steam_account_id=order.assignment.steam_account_id,
        status="new",
    ).first()
    if existing:
        if description and (not existing.description or description not in existing.description):
            existing.description = (existing.description + "\n\n— " + description) if existing.description else description
        existing.reason = reason
        db.session.commit()
        return jsonify({
            "message": "Existing flag updated",
            "flag": existing.to_dict(),
        }), 200

    flag = AccountFlag(
        user_id=user_id,
        steam_account_id=order.assignment.steam_account_id,
        assignment_id=order.assignment.id,
        order_id=order.id,
        reason=reason,
        description=description,
        status="new",
    )
    db.session.add(flag)
    db.session.commit()

    try:
        from app.email_service import send_account_flag_notification
        send_account_flag_notification(
            flag_id=flag.id,
            user_email=order.user.email if order.user else f"user#{user_id}",
            account_name=order.assignment.steam_account.account_name,
            game_name=order.game.name if order.game else None,
            reason=reason,
            description=description,
            order_id=order.id,
            reporter_user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to send account flag notification email")

    return jsonify({"message": "Flag submitted", "flag": flag.to_dict()}), 201


@store_bp.route("/orders/<int:order_id>/instructions", methods=["GET"])
@jwt_required()
def get_instructions(order_id: int):
    """Get play instructions for the game in this order.

    Optional ?appid=<x>: bonus games on the same account share the source
    purchase's order_id; pass the bonus game's appid to fetch instructions
    for that game instead of the order's primary game. The override is only
    honored when the requested game is actually owned by the same account
    that backs this order.
    """
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    target_game_id = order.game_id
    appid_override = request.args.get("appid", type=int)
    if appid_override and order.assignment is not None:
        candidate = (
            Game.query
            .join(GameAccount, GameAccount.game_id == Game.id)
            .filter(
                Game.appid == appid_override,
                GameAccount.steam_account_id == order.assignment.steam_account_id,
            )
            .first()
        )
        if candidate:
            target_game_id = candidate.id

    instruction = PlayInstruction.query.filter_by(game_id=target_game_id).first()
    if instruction:
        return jsonify({"instructions": instruction.to_dict()}), 200

    # Return default
    return jsonify({
        "instructions": {
            "game_id": target_game_id,
            "content": DEFAULT_PLAY_INSTRUCTIONS,
            "is_custom": False,
        }
    }), 200


# ---------------------------------------------------------------------------
# Referral (user-facing)
# ---------------------------------------------------------------------------


@store_bp.route("/referral/validate", methods=["POST"])
def validate_referral():
    """Validate a referral code at registration time. Does not require auth.

    Body: { code }
    Returns: { valid: bool, referrer_name?: str, error?: str }
    """
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"valid": False, "error": "Kode referral kosong"}), 400

    referrer = User.query.filter_by(referral_code=code).first()
    if not referrer:
        return jsonify({"valid": False, "error": "Kode referral tidak ditemukan"}), 200

    email = referrer.email
    at_idx = email.find("@")
    masked = email[0] + "***" + email[at_idx:] if at_idx > 1 else email

    return jsonify({"valid": True, "referrer_name": masked}), 200


@store_bp.route("/my-referral", methods=["GET"])
@jwt_required()
def my_referral():
    """Return the current user's referral code, credit, and referral list."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    referred_users = User.query.filter_by(referred_by_user_id=user_id).all()
    rewards_by_referee = {
        r.referee_user_id: r
        for r in ReferralReward.query.filter_by(referrer_user_id=user_id).all()
    }

    referrals = []
    total_earned = 0
    for ref_user in referred_users:
        reward = rewards_by_referee.get(ref_user.id)
        at_idx = ref_user.email.find("@")
        masked = ref_user.email[0] + "***" + ref_user.email[at_idx:] if at_idx > 1 else ref_user.email
        status = "rewarded" if reward else "pending"
        referrals.append({
            "email_masked": masked,
            "joined_at": ref_user.created_at.isoformat(),
            "status": status,
            "credit_awarded": reward.credit_awarded if reward else 0,
        })
        if reward:
            total_earned += reward.credit_awarded

    return jsonify({
        "code": user.referral_code,
        "credit": user.referral_credit,
        "referrals": referrals,
        "total_earned": total_earned,
    }), 200


@store_bp.route("/my-promos", methods=["GET"])
@jwt_required()
def my_promos():
    """Return promo codes the current user "owns" for tracking purposes.

    These are codes admin assigned to the user (e.g. a marketer / affiliate)
    so they can see who's redeeming the code they share. The codes
    themselves are public — any visitor can use them at checkout — but only
    the owner sees aggregate usage stats here.
    """
    user_id = int(get_jwt_identity())
    promos = (
        PromoCode.query
        .filter(PromoCode.assigned_user_id == user_id)
        .order_by(PromoCode.is_active.desc(), PromoCode.created_at.desc())
        .all()
    )

    result = []
    for p in promos:
        usages = (
            PromoCodeUsage.query
            .filter_by(promo_code_id=p.id)
            .order_by(PromoCodeUsage.used_at.desc())
            .all()
        )
        total_uses = len(usages)
        total_discount = sum(u.discount_amount for u in usages)

        # Bulk-fetch the orders / subscriptions referenced by these usages so
        # we can compute revenue contribution without N round-trips.
        order_ids = {u.order_id for u in usages if u.order_id}
        sub_ids = {u.subscription_id for u in usages if u.subscription_id}
        orders_by_id = {
            o.id: o for o in (Order.query.filter(Order.id.in_(order_ids)).all() if order_ids else [])
        }
        subs_by_id = {
            s.id: s for s in (Subscription.query.filter(Subscription.id.in_(sub_ids)).all() if sub_ids else [])
        }

        # "Revenue contribution" = net amount actually paid for orders /
        # subscriptions that redeemed this code. Pending / unpaid records
        # are excluded so the figure represents realised revenue, not just
        # intent. paid_at IS NOT NULL is the proxy for "money came in".
        total_revenue = 0
        paid_redemptions = 0
        for u in usages:
            paid = False
            amount = 0
            if u.order_id and u.order_id in orders_by_id:
                o = orders_by_id[u.order_id]
                if o.paid_at is not None:
                    paid = True
                    amount = o.amount or 0
            elif u.subscription_id and u.subscription_id in subs_by_id:
                s = subs_by_id[u.subscription_id]
                if s.paid_at is not None:
                    paid = True
                    amount = s.amount or 0
            if paid:
                total_revenue += amount
                paid_redemptions += 1

        # Last 10 redemptions with masked emails + per-row revenue for the
        # owner's activity feed.
        recent = []
        for u in usages[:10]:
            redeemer = db.session.get(User, u.user_id) if u.user_id else None
            email = redeemer.email if redeemer else ""
            at_idx = email.find("@")
            masked = email[0] + "***" + email[at_idx:] if at_idx > 1 else (email or "anon")

            order_amount = None
            sub_amount = None
            paid = False
            if u.order_id and u.order_id in orders_by_id:
                o = orders_by_id[u.order_id]
                if o.paid_at is not None:
                    paid = True
                    order_amount = o.amount or 0
            elif u.subscription_id and u.subscription_id in subs_by_id:
                s = subs_by_id[u.subscription_id]
                if s.paid_at is not None:
                    paid = True
                    sub_amount = s.amount or 0

            recent.append({
                "email_masked": masked,
                "discount_amount": u.discount_amount,
                "revenue_amount": (order_amount if order_amount is not None else sub_amount) or 0,
                "paid": paid,
                "used_at": u.used_at.isoformat(),
                "order_id": u.order_id,
                "subscription_id": u.subscription_id,
            })

        expired = bool(p.expires_at and p.expires_at < datetime.now(timezone.utc))

        result.append({
            "id": p.id,
            "code": p.code,
            "description": p.description,
            "discount_type": p.discount_type,
            "discount_value": p.discount_value,
            "scope": p.scope,
            "min_order_amount": p.min_order_amount,
            "max_uses_total": p.max_uses_total,
            "max_uses_per_user": p.max_uses_per_user,
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "is_active": p.is_active,
            "expired": expired,
            "total_uses": total_uses,
            "paid_redemptions": paid_redemptions,
            "total_discount_given": total_discount,
            "total_revenue_contributed": total_revenue,
            "recent_uses": recent,
        })

    return jsonify({"promos": result}), 200


def _send_cart_welcome(orders: list):
    """Send a single cart-fulfilled email summarizing all games at once.

    Stub — wired up properly in Task 7. For now just log.
    """
    logger.info("TODO _send_cart_welcome: %d orders", len(orders))


# ---------------------------------------------------------------------------
# Cart (per-user, DB-persisted)
# ---------------------------------------------------------------------------

CART_MAX_ITEMS = 20


def _user_owns_game(user_id: int, game_id: int) -> bool:
    """Has user already bought + been fulfilled for this game?"""
    return (
        Order.query.filter_by(
            user_id=user_id, game_id=game_id, status="fulfilled"
        ).first()
        is not None
    )


def _user_has_active_subscription(user_id: int) -> bool:
    """Is user currently on an active Premium plan?"""
    now = datetime.now(timezone.utc)
    return (
        Subscription.query.filter(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.expires_at > now,
        ).first()
        is not None
    )


@store_bp.route("/cart", methods=["GET"])
@jwt_required()
def get_cart():
    user_id = int(get_jwt_identity())
    items = (
        CartItem.query
        .options(joinedload(CartItem.game))
        .filter_by(user_id=user_id)
        .order_by(CartItem.created_at.asc())
        .all()
    )
    cart_subtotal = sum((it.game.price if it.game else 0) for it in items)
    return jsonify({
        "items": [it.to_dict() for it in items],
        "cart_subtotal": cart_subtotal,
        "item_count": len(items),
    }), 200


@store_bp.route("/cart/items", methods=["POST"])
@jwt_required()
def add_cart_item():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    try:
        game_id = int(data.get("game_id") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid game_id"}), 400
    if game_id <= 0:
        return jsonify({"error": "Invalid game_id"}), 400

    if _user_has_active_subscription(user_id):
        return jsonify({
            "error": "Premium subscriber — semua game sudah bisa langsung dimainkan",
            "code": "premium_active",
        }), 400

    game = db.session.get(Game, game_id)
    if not game or not game.is_enabled:
        return jsonify({"error": "Game tidak tersedia"}), 404

    if _user_owns_game(user_id, game_id):
        return jsonify({
            "error": "Kamu sudah punya akses ke game ini",
            "code": "already_owned",
        }), 400

    current_count = CartItem.query.filter_by(user_id=user_id).count()
    if current_count >= CART_MAX_ITEMS:
        return jsonify({
            "error": f"Keranjang penuh (maks {CART_MAX_ITEMS} game)",
            "code": "cart_full",
        }), 400

    item = CartItem.add_for_user(user_id, game_id)
    return jsonify({
        "item": item.to_dict(),
        "cart_item_count": CartItem.query.filter_by(user_id=user_id).count(),
    }), 201


@store_bp.route("/cart/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def remove_cart_item(item_id: int):
    user_id = int(get_jwt_identity())
    ok = CartItem.remove_for_user(user_id, item_id)
    if not ok:
        return jsonify({"error": "Item tidak ditemukan"}), 404
    return jsonify({"message": "Removed"}), 200


@store_bp.route("/cart", methods=["DELETE"])
@jwt_required()
def clear_cart():
    user_id = int(get_jwt_identity())
    count = CartItem.clear_for_user(user_id)
    return jsonify({"message": f"Cleared {count} item(s)"}), 200


def _generate_checkout_group_id(user_id: int) -> str:
    """Generate a readable, collision-safe checkout group id."""
    ts = int(datetime.now(timezone.utc).timestamp())
    suffix = secrets.token_hex(2)  # 4 hex chars
    return f"CG-{ts}-{user_id}-{suffix}"


def _validate_cart_items_for_checkout(user_id: int, items: list) -> tuple[list, list]:
    """Pre-validate cart items at checkout time.

    Returns (valid_items, failed_items). Each failed_item is a dict with
    `game_id` and `reason`.
    """
    valid = []
    failed = []
    for it in items:
        if not it.game or not it.game.is_enabled:
            failed.append({"game_id": it.game_id, "reason": "Game tidak tersedia"})
            continue
        # Has at least one active GameAccount on an active SteamAccount?
        from app.models import GameAccount, SteamAccount
        has_account = (
            GameAccount.query.join(SteamAccount)
            .filter(
                GameAccount.game_id == it.game.id,
                SteamAccount.is_active == True,  # noqa: E712
            )
            .first()
            is not None
        )
        if not has_account:
            failed.append({"game_id": it.game_id, "reason": "Stok akun habis untuk game ini"})
            continue
        if _user_owns_game(user_id, it.game_id):
            failed.append({"game_id": it.game_id, "reason": "Kamu sudah punya game ini"})
            continue
        valid.append(it)
    return valid, failed


@store_bp.route("/checkout-cart", methods=["POST"])
@jwt_required()
def checkout_cart():
    """Checkout the entire cart in a single payment transaction.

    Creates N Orders (one per game), all sharing the same `checkout_group_id`
    and same `midtrans_order_id` / `tripay_reference`. Webhook handler will
    fulfill them atomically when payment is confirmed.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    if _user_has_active_subscription(user_id):
        return jsonify({"error": "Premium subscriber — tidak perlu cart"}), 400

    items = CartItem.list_for_user(user_id)
    if not items:
        return jsonify({"error": "Keranjang kosong"}), 400

    valid_items, failed_items = _validate_cart_items_for_checkout(user_id, items)
    if failed_items:
        return jsonify({
            "error": "Beberapa item tidak bisa di-checkout",
            "failed_items": failed_items,
        }), 400

    user_obj = db.session.get(User, user_id)

    pricing_input = [
        {"game_id": it.game.id, "unit_price": it.game.price} for it in valid_items
    ]
    from app.store.pricing import compute_cart_amount
    pricing = compute_cart_amount(pricing_input, user_id, promo_code_input, apply_credit)
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["cart_total"]
    checkout_group_id = _generate_checkout_group_id(user_id)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"CART-{user_id}-{timestamp}"

    # Create N Orders with prorated discounts
    orders = []
    for it, breakdown in zip(valid_items, pricing["per_item_breakdown"]):
        order = Order(
            user_id=user_id,
            game_id=it.game.id,
            status="pending_payment",
            type="purchase",
            midtrans_order_id=midtrans_order_id,
            checkout_group_id=checkout_group_id,
            amount_subtotal=breakdown["subtotal"],
            promo_discount=breakdown["discount"],
            credit_applied=breakdown["credit"],
            amount=breakdown["final"],
            promo_code_id=pricing["promo_code_id"],
        )
        db.session.add(order)
        orders.append(order)
    db.session.flush()

    # One PromoCodeUsage row for the cart (attribute to first order in group)
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            order_id=orders[0].id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)

    # Deduct credit
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])

    # Clear cart (commit happens after gateway interaction)
    CartItem.query.filter_by(user_id=user_id).delete()

    # Zero-total path: auto-fulfill all orders without payment
    if final_amount == 0:
        for order in orders:
            order.payment_type = "credit"
            order.paid_at = datetime.now(timezone.utc)
            success = _fulfill_order(order)
            if not success:
                db.session.rollback()
                return jsonify({"error": "Fulfillment failed for one or more games"}), 503
        db.session.commit()
        return jsonify({
            "message": "Cart fulfilled via credit/discount",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "credit",
            "total": 0,
        }), 201

    payment_mode = SiteSetting.get("payment_mode")
    item_summary = ", ".join((it.game.name or "")[:30] for it in valid_items)[:90]

    if payment_mode == "manual":
        db.session.commit()
        return jsonify({
            "message": "Cart created, awaiting manual payment",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "manual",
            "total": final_amount,
            "manual_info": {
                "qris_image_url": SiteSetting.get("manual_qris_image_url"),
                "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
                "instructions": SiteSetting.get("manual_payment_instructions"),
            },
        }), 201

    if payment_mode == "tripay":
        from app.tripay import service as tripay
        if not tripay.is_configured():
            db.session.rollback()
            return jsonify({"error": "Tripay belum dikonfigurasi"}), 503
        try:
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            tx = tripay.create_transaction(
                merchant_ref=midtrans_order_id,
                amount=final_amount,
                customer_email=user_obj.email if user_obj else "",
                customer_name=(user_obj.email.split("@")[0] if user_obj and user_obj.email else "Customer"),
                item_name=f"Cart: {item_summary}"[:90],
                callback_url=f"{frontend_url}/callback/tripay",
                return_url=f"{frontend_url}/cart/success?cg={checkout_group_id}",
            )
            for order in orders:
                order.tripay_reference = tx.get("reference")
                order.snap_token = tx.get("checkout_url")
            db.session.commit()
            return jsonify({
                "message": "Cart created, awaiting payment",
                "checkout_group_id": checkout_group_id,
                "orders": [o.to_dict() for o in orders],
                "payment_mode": "tripay",
                "total": final_amount,
                "checkout_url": tx.get("checkout_url"),
                "tripay_reference": tx.get("reference"),
            }), 201
        except Exception as e:
            db.session.rollback()
            logger.exception("Tripay create failed for cart checkout: %s", e)
            return jsonify({"error": f"Payment service error: {type(e).__name__}"}), 502

    # Midtrans mode
    try:
        snap = _get_snap()
        item_details = [
            {
                "id": str(b["game_id"]),
                "price": b["final"] if b["final"] > 0 else 1,  # Midtrans requires price >= 1
                "quantity": 1,
                "name": (next((it.game.name for it in valid_items if it.game.id == b["game_id"]), "Game"))[:50],
            }
            for b in pricing["per_item_breakdown"]
        ]
        # Adjust totals so Midtrans gross_amount matches sum(item_details.price)
        adjust = final_amount - sum(d["price"] for d in item_details)
        if adjust != 0 and item_details:
            item_details[-1]["price"] += adjust
        transaction = snap.create_transaction({
            "transaction_details": {
                "order_id": midtrans_order_id,
                "gross_amount": final_amount,
            },
            "item_details": item_details,
            "customer_details": {
                "email": user_obj.email if user_obj else "",
            },
        })
        snap_token = transaction["token"]
        for order in orders:
            order.snap_token = snap_token
        db.session.commit()
        return jsonify({
            "message": "Cart created, awaiting payment",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "midtrans",
            "total": final_amount,
            "snap_token": snap_token,
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.exception("Midtrans cart checkout failed: %s", e)
        return jsonify({"error": "Payment service unavailable"}), 502

