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
    SteamAccount,
    User,
)
from app.steam.service import get_guard_code

store_bp = Blueprint("store", __name__, url_prefix="/api/store")

# ---------------------------------------------------------------------------
# Midtrans Configuration
# ---------------------------------------------------------------------------

def _get_snap():
    return midtransclient.Snap(
        is_production=os.getenv("MIDTRANS_IS_PRODUCTION", "false").lower() == "true",
        server_key=os.getenv("MIDTRANS_SERVER_KEY", "SB-Mid-server-7Fp0W-6BPItzBeHc4WmVz0rh"),
        client_key=os.getenv("MIDTRANS_CLIENT_KEY", "SB-Mid-client-VNwEU_8NEdo5N3og"),
    )

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
    db.session.flush()  # get order.id

    # Create Midtrans transaction
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
                "name": game.name[:50],  # Midtrans limits item name length
            }],
            "customer_details": {
                "email": user.email if user else "",
            },
        })
        snap_token = transaction["token"]
        order.snap_token = snap_token
        db.session.commit()

        logger.info(
            "Order %s created with Midtrans order ID %s for user %s",
            order.id, midtrans_order_id, user_id,
        )

        return jsonify({
            "message": "Order created, awaiting payment",
            "order": order.to_dict(),
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
    server_key = os.getenv("MIDTRANS_SERVER_KEY", "")
    raw = order_id + status_code + gross_amount + server_key
    expected_signature = hashlib.sha512(raw.encode("utf-8")).hexdigest()

    if signature_key != expected_signature:
        logger.warning("Midtrans webhook signature mismatch for order %s", order_id)
        return jsonify({"error": "Invalid signature"}), 403

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
