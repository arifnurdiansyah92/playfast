"""Store endpoints: public catalog, ordering, credentials, code generation."""

import hashlib
import logging
import os
import time
import threading
from collections import defaultdict
from datetime import datetime, timezone

import midtransclient
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

logger = logging.getLogger(__name__)

from app.extensions import db
from app.models import (
    Assignment,
    CodeRequestLog,
    Game,
    GameAccount,
    Order,
    PlayInstruction,
    SiteSetting,
    SteamAccount,
    Subscription,
    User,
)
from app.steam.service import get_guard_code

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


@store_bp.route("/payment-config", methods=["GET"])
def payment_config():
    """Public endpoint: returns payment mode and Midtrans client key for frontend."""
    mode = SiteSetting.get("payment_mode")
    result = {"payment_mode": mode}
    if mode != "manual":
        if mode == "midtrans_production":
            result["client_key"] = SiteSetting.get("midtrans_production_client_key")
            result["snap_url"] = "https://app.midtrans.com/snap/snap.js"
        else:
            result["client_key"] = SiteSetting.get("midtrans_sandbox_client_key")
            result["snap_url"] = "https://app.sandbox.midtrans.com/snap/snap.js"
    else:
        result["qris_image_url"] = SiteSetting.get("manual_qris_image_url")
        result["whatsapp_number"] = SiteSetting.get("manual_whatsapp_number")
        result["instructions"] = SiteSetting.get("manual_payment_instructions")
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


@store_bp.route("/subscription/subscribe", methods=["POST"])
@jwt_required()
def subscribe():
    """Create a new subscription with pending_payment status."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    plan = data.get("plan", "")

    if plan not in Subscription.PLAN_DURATIONS:
        return jsonify({"error": "Invalid plan. Choose: monthly, 3monthly, yearly"}), 400

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

    user = db.session.get(User, user_id)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"SUB-{user_id}-{plan}-{timestamp}"

    sub = Subscription(
        user_id=user_id,
        plan=plan,
        amount=price,
        midtrans_order_id=midtrans_order_id,
    )
    db.session.add(sub)
    db.session.flush()

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
    else:
        try:
            snap = _get_snap()
            transaction = snap.create_transaction({
                "transaction_details": {
                    "order_id": midtrans_order_id,
                    "gross_amount": price,
                },
                "item_details": [{
                    "id": f"sub_{plan}",
                    "price": price,
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


@store_bp.route("/games", methods=["GET"])
def list_games():
    """List enabled games with optional search, genre filter, sorting, and pagination."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 100)

    # Only show enabled games that have at least one active account
    available_game_ids = (
        db.session.query(GameAccount.game_id)
        .join(SteamAccount)
        .filter(SteamAccount.is_active == True)  # noqa: E712
        .group_by(GameAccount.game_id)
        .subquery()
    )
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
        query = query.order_by(Game.created_at.desc(), Game.name.asc())
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
        query = query.order_by(Game.name.asc())

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
    available_game_ids = (
        db.session.query(GameAccount.game_id)
        .join(SteamAccount)
        .filter(SteamAccount.is_active == True)  # noqa: E712
        .group_by(GameAccount.game_id)
        .subquery()
    )
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
    available_game_ids = (
        db.session.query(GameAccount.game_id)
        .join(SteamAccount)
        .filter(SteamAccount.is_active == True)  # noqa: E712
        .group_by(GameAccount.game_id)
        .subquery()
    )
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
    available_game_ids = (
        db.session.query(GameAccount.game_id)
        .join(SteamAccount)
        .filter(SteamAccount.is_active == True)  # noqa: E712
        .group_by(GameAccount.game_id)
        .subquery()
    )
    games = (
        Game.query.filter(
            Game.is_enabled == True,  # noqa: E712
            Game.id.in_(db.session.query(available_game_ids.c.game_id)),
        )
        .order_by(Game.price.desc(), Game.name.asc())
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
        return jsonify({
            "error": "You already have an active order for this game"
        }), 409

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
            order.status = "fulfilled"
            db.session.commit()

        return jsonify({
            "message": "Game access granted via subscription",
            "order": order.to_dict(),
            "payment_mode": "subscription",
        }), 201

    # Fetch user for Midtrans customer details
    user = db.session.get(User, user_id)

    # Generate unique Midtrans order ID
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"PF-{user_id}-{game.id}-{timestamp}"

    # Create order with pending_payment status
    order = Order(
        user_id=user_id,
        game_id=game.id,
        status="pending_payment",
        midtrans_order_id=midtrans_order_id,
        amount=game.price,
    )
    db.session.add(order)
    db.session.flush()

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
    else:
        # Midtrans mode (sandbox or production)
        try:
            snap = _get_snap()
            transaction = snap.create_transaction({
                "transaction_details": {
                    "order_id": midtrans_order_id,
                    "gross_amount": game.price,
                },
                "item_details": [{
                    "id": str(game.id),
                    "price": game.price,
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

            return jsonify({"status": "ok"}), 200

        elif transaction_status in ("cancel", "deny", "expire"):
            if sub.status == "pending_payment":
                sub.status = "cancelled"
                db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        elif transaction_status == "pending":
            return jsonify({"status": "pending"}), 200

        return jsonify({"status": "ignored"}), 200

    # Look up order by midtrans_order_id
    order = Order.query.filter_by(midtrans_order_id=order_id).first()
    if not order:
        logger.warning("Midtrans webhook: order not found for %s", order_id)
        return jsonify({"error": "Order not found"}), 404

    logger.info(
        "Midtrans webhook: order=%s status=%s fraud=%s payment_type=%s",
        order_id, transaction_status, fraud_status, payment_type,
    )

    # Process based on transaction status
    if transaction_status in ("capture", "settlement"):
        # For capture, only accept if fraud_status is "accept" or empty
        if transaction_status == "capture" and fraud_status not in ("accept", ""):
            logger.warning(
                "Midtrans webhook: fraud detected for %s (fraud_status=%s)",
                order_id, fraud_status,
            )
            order.status = "cancelled"
            db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        # Only fulfill if still pending
        if order.status == "pending_payment":
            order.payment_type = payment_type
            order.paid_at = datetime.now(timezone.utc)
            db.session.flush()

            success = _fulfill_order(order)
            if not success:
                logger.error(
                    "Midtrans webhook: payment received but fulfillment failed for %s",
                    order_id,
                )
                # Still mark as paid even if no account available -- admin can resolve
                order.status = "fulfilled"
                db.session.commit()

        return jsonify({"status": "ok"}), 200

    elif transaction_status in ("cancel", "deny", "expire"):
        if order.status == "pending_payment":
            order.status = "cancelled"
            db.session.commit()
            logger.info("Midtrans webhook: order %s cancelled (%s)", order_id, transaction_status)
        return jsonify({"status": "cancelled"}), 200

    elif transaction_status == "pending":
        # Payment is pending (e.g. bank transfer) -- do nothing
        return jsonify({"status": "pending"}), 200

    else:
        logger.info("Midtrans webhook: unhandled status %s for %s", transaction_status, order_id)
        return jsonify({"status": "ignored"}), 200


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

    pagination = (
        Order.query.filter_by(user_id=user_id)
        .filter(Order.type != "subscription")
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
    others as 'bonus'.
    """
    user_id = int(get_jwt_identity())
    # Trigger lazy expiry check for subscription
    _get_active_subscription(user_id)

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

    # Sort: purchased first, then bonus, alphabetical within each group
    games_result.sort(key=lambda g: (0 if g["type"] == "purchased" else 1, g["name"].lower()))

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


@store_bp.route("/orders/<int:order_id>/instructions", methods=["GET"])
@jwt_required()
def get_instructions(order_id: int):
    """Get play instructions for the game in this order."""
    user_id = int(get_jwt_identity())
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    # Check for custom instructions
    instruction = PlayInstruction.query.filter_by(game_id=order.game_id).first()
    if instruction:
        return jsonify({"instructions": instruction.to_dict()}), 200

    # Return default
    return jsonify({
        "instructions": {
            "game_id": order.game_id,
            "content": DEFAULT_PLAY_INSTRUCTIONS,
            "is_custom": False,
        }
    }), 200
