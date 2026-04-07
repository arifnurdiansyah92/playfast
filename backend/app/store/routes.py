"""Store endpoints: public catalog, ordering, credentials, code generation."""

import time
import threading
from collections import defaultdict

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Assignment,
    CodeRequestLog,
    Game,
    GameAccount,
    Order,
    PlayInstruction,
    SteamAccount,
)
from app.steam.service import get_guard_code

store_bp = Blueprint("store", __name__, url_prefix="/api/store")

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


@store_bp.route("/orders", methods=["POST"])
@jwt_required()
def create_order():
    """
    Create a new order and auto-assign a Steam account via round-robin.
    Picks the active account with the fewest current assignments for this game.
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

    # Round-robin: find the account with the fewest active assignments for this game
    # Use FOR UPDATE to prevent race conditions
    assignment_count = (
        func.coalesce(
            db.session.query(func.count(Assignment.id))
            .filter(
                Assignment.steam_account_id == GameAccount.steam_account_id,
                Assignment.game_id == game.id,
            )
            .correlate(GameAccount)
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
        .order_by(assignment_count.asc(), GameAccount.id.asc())
        .with_for_update()
        .first()
    )

    if not best_game_account:
        return jsonify({"error": "No accounts available for this game"}), 409

    steam_account = best_game_account.steam_account

    # Create order
    order = Order(user_id=user_id, game_id=game.id, status="fulfilled")
    db.session.add(order)
    db.session.flush()  # get order.id

    # Create assignment
    assignment = Assignment(
        order_id=order.id,
        user_id=user_id,
        steam_account_id=steam_account.id,
        game_id=game.id,
    )
    db.session.add(assignment)
    db.session.flush()

    # Link assignment to order
    order.assignment_id = assignment.id
    db.session.commit()

    return jsonify({
        "message": "Order created",
        "order": order.to_dict(include_credentials=True),
    }), 201


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
