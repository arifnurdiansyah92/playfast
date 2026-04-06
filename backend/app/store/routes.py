"""Store endpoints: public catalog, ordering, credentials, code generation."""

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

DEFAULT_PLAY_INSTRUCTIONS = """## How to Play (Offline Mode)

1. Open Steam and click "Login"
2. Enter the username and password shown above
3. When prompted for Steam Guard code, click "Get Code" on this page and enter it
4. Once logged in, go to your Library and install/download the game
5. After download completes, go to Steam menu → Go Offline
6. Launch and play the game in offline mode

**Important:**
- Always play in OFFLINE mode to avoid conflicts with other users
- Do not change the account password
- Do not add friends or modify account settings"""


@store_bp.route("/games", methods=["GET"])
def list_games():
    """List enabled games with optional search and pagination."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    per_page = min(per_page, 100)

    query = Game.query.filter_by(is_enabled=True)

    # Search by name
    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(Game.name.ilike(f"%{q}%"))

    # Filter by availability (at least one active account owns it)
    available = request.args.get("available", "").lower()
    if available == "true":
        subq = (
            db.session.query(GameAccount.game_id)
            .join(SteamAccount)
            .filter(SteamAccount.is_active == True)  # noqa: E712
            .group_by(GameAccount.game_id)
            .subquery()
        )
        query = query.filter(Game.id.in_(db.session.query(subq.c.game_id)))

    query = query.order_by(Game.name.asc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    games = [g.to_dict(include_availability=True) for g in pagination.items]
    return jsonify({
        "games": games,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


@store_bp.route("/games/<int:appid>", methods=["GET"])
def game_detail(appid: int):
    """Get a single game's details by Steam appid."""
    game = Game.query.filter_by(appid=appid, is_enabled=True).first()
    if not game:
        return jsonify({"error": "Game not found"}), 404

    return jsonify({"game": game.to_dict(include_availability=True)}), 200


@store_bp.route("/orders", methods=["POST"])
@jwt_required()
def create_order():
    """
    Create a new order and auto-assign a Steam account via round-robin.
    Picks the active account with the fewest current assignments for this game.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    game_id = data.get("game_id")

    if not game_id:
        return jsonify({"error": "game_id is required"}), 400

    game = db.session.get(Game, game_id)
    if not game or not game.is_enabled:
        return jsonify({"error": "Game not found or not available"}), 404

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
    order = Order.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not order.assignment:
        return jsonify({"error": "No account assigned to this order"}), 400

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
