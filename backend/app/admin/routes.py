"""Admin endpoints: account CRUD, game sync, orders, audit, dashboard."""

import json
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

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
from app.steam.service import ensure_valid_token, fetch_owned_games

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

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


def admin_required(fn):
    """Decorator that checks the current user is an admin."""

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
# Dashboard
# ---------------------------------------------------------------------------


@admin_bp.route("/dashboard", methods=["GET"])
@admin_required
def dashboard():
    """Overview stats."""
    total_accounts = SteamAccount.query.count()
    active_accounts = SteamAccount.query.filter_by(is_active=True).count()
    total_games = Game.query.count()
    enabled_games = Game.query.filter_by(is_enabled=True).count()
    total_orders = Order.query.count()
    fulfilled_orders = Order.query.filter_by(status="fulfilled").count()
    total_users = User.query.count()

    return jsonify({
        "total_accounts": total_accounts,
        "active_accounts": active_accounts,
        "total_games": total_games,
        "enabled_games": enabled_games,
        "total_orders": total_orders,
        "fulfilled_orders": fulfilled_orders,
        "total_users": total_users,
    }), 200


# ---------------------------------------------------------------------------
# Steam Accounts
# ---------------------------------------------------------------------------


@admin_bp.route("/accounts", methods=["GET"])
@admin_required
def list_accounts():
    """List all Steam accounts with status."""
    accounts = SteamAccount.query.order_by(SteamAccount.created_at.desc()).all()
    return jsonify({
        "accounts": [a.to_dict() for a in accounts],
    }), 200


@admin_bp.route("/accounts", methods=["POST"])
@admin_required
def add_account():
    """
    Upload a .mafile + password to add a new Steam account.
    Expects multipart form with 'mafile' file and 'password' field.
    """
    if "mafile" not in request.files:
        return jsonify({"error": "No .mafile uploaded"}), 400

    file = request.files["mafile"]
    if not file.filename or not file.filename.endswith(".mafile"):
        return jsonify({"error": "File must be a .mafile"}), 400

    password = request.form.get("password", "").strip()
    if not password:
        return jsonify({"error": "Password is required"}), 400

    content = file.read()
    try:
        mafile_data = json.loads(content)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in .mafile"}), 400

    if "shared_secret" not in mafile_data or "account_name" not in mafile_data:
        return jsonify({"error": "Invalid .mafile — missing shared_secret or account_name"}), 400

    account_name = mafile_data["account_name"]
    steam_id = mafile_data.get("Session", {}).get("SteamID", "")

    if SteamAccount.query.filter_by(account_name=account_name).first():
        return jsonify({"error": f"Account '{account_name}' already exists"}), 409

    account = SteamAccount(
        account_name=account_name,
        steam_id=steam_id,
        mafile_data=mafile_data,
        password=password,
        is_active=True,
    )
    db.session.add(account)
    db.session.commit()

    return jsonify({
        "message": f"Account '{account_name}' added",
        "account": account.to_dict(),
    }), 201


@admin_bp.route("/accounts/<int:account_id>", methods=["PUT"])
@admin_required
def update_account(account_id: int):
    """Update account password or active status."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    data = request.get_json() or {}

    if "password" in data:
        account.password = data["password"]
    if "is_active" in data:
        account.is_active = bool(data["is_active"])

    db.session.commit()
    return jsonify({
        "message": "Account updated",
        "account": account.to_dict(),
    }), 200


@admin_bp.route("/accounts/<int:account_id>", methods=["DELETE"])
@admin_required
def delete_account(account_id: int):
    """Remove a Steam account."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    db.session.delete(account)
    db.session.commit()
    return jsonify({"message": "Account deleted"}), 200


# ---------------------------------------------------------------------------
# Game Sync
# ---------------------------------------------------------------------------


def _sync_account_games(account: SteamAccount) -> dict:
    """
    Sync games for a single SteamAccount.
    Returns a summary dict with counts.
    """
    mafile_data = account.mafile_data.copy()
    token = ensure_valid_token(mafile_data, account.password)

    if not token:
        return {
            "account_name": account.account_name,
            "success": False,
            "error": "Could not obtain valid access token",
        }

    # If tokens were refreshed, save the updated mafile_data back
    if mafile_data != account.mafile_data:
        account.mafile_data = mafile_data
        db.session.add(account)

    steam_id = mafile_data.get("Session", {}).get("SteamID", account.steam_id)

    try:
        games = fetch_owned_games(token, steam_id)
    except Exception as e:
        return {
            "account_name": account.account_name,
            "success": False,
            "error": str(e),
        }

    new_games = 0
    new_links = 0

    for g in games:
        # Upsert Game
        game = Game.query.filter_by(appid=g["appid"]).first()
        if not game:
            game = Game(
                appid=g["appid"],
                name=g["name"],
                icon=g.get("icon", ""),
            )
            db.session.add(game)
            db.session.flush()
            new_games += 1
        else:
            # Update name/icon if changed
            if game.name != g["name"]:
                game.name = g["name"]
            if g.get("icon") and game.icon != g["icon"]:
                game.icon = g["icon"]

        # Upsert GameAccount link
        existing_link = GameAccount.query.filter_by(
            game_id=game.id, steam_account_id=account.id
        ).first()
        if not existing_link:
            link = GameAccount(game_id=game.id, steam_account_id=account.id)
            db.session.add(link)
            new_links += 1

    db.session.commit()

    return {
        "account_name": account.account_name,
        "success": True,
        "total_games": len(games),
        "new_games": new_games,
        "new_links": new_links,
    }


@admin_bp.route("/accounts/sync-games", methods=["POST"])
@admin_required
def sync_all_games():
    """Fetch games from ALL active accounts, deduplicate, update catalog."""
    accounts = SteamAccount.query.filter_by(is_active=True).all()
    if not accounts:
        return jsonify({"error": "No active accounts to sync"}), 404

    results = []
    for account in accounts:
        result = _sync_account_games(account)
        results.append(result)

    return jsonify({
        "message": "Sync complete",
        "results": results,
    }), 200


@admin_bp.route("/accounts/<int:account_id>/sync", methods=["POST"])
@admin_required
def sync_single_account(account_id: int):
    """Sync games for a single account."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    result = _sync_account_games(account)

    status_code = 200 if result.get("success") else 502
    return jsonify(result), status_code


# ---------------------------------------------------------------------------
# Games (admin view)
# ---------------------------------------------------------------------------


@admin_bp.route("/games", methods=["GET"])
@admin_required
def list_games():
    """List all games with admin info (which accounts own them)."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    q = request.args.get("q", "").strip()
    query = Game.query
    if q:
        query = query.filter(Game.name.ilike(f"%{q}%"))

    pagination = query.order_by(Game.name.asc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    games = []
    for game in pagination.items:
        gd = game.to_dict(include_availability=True)
        # Include which accounts own this game
        account_links = (
            GameAccount.query.join(SteamAccount)
            .filter(GameAccount.game_id == game.id)
            .all()
        )
        gd["accounts"] = [
            {
                "id": link.steam_account.id,
                "account_name": link.steam_account.account_name,
                "is_active": link.steam_account.is_active,
            }
            for link in account_links
        ]
        games.append(gd)

    return jsonify({
        "games": games,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


@admin_bp.route("/games/<int:game_id>", methods=["PUT"])
@admin_required
def update_game(game_id: int):
    """Update price, enable/disable, or custom instructions for a game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}

    if "price" in data:
        game.price = int(data["price"])
    if "is_enabled" in data:
        game.is_enabled = bool(data["is_enabled"])
    if "name" in data:
        game.name = data["name"]

    # Handle inline instructions update
    if "instructions" in data:
        content = data["instructions"]
        instruction = PlayInstruction.query.filter_by(game_id=game.id).first()
        if instruction:
            instruction.content = content
            instruction.is_custom = True
            instruction.updated_at = datetime.now(timezone.utc)
        else:
            instruction = PlayInstruction(
                game_id=game.id,
                content=content,
                is_custom=True,
            )
            db.session.add(instruction)

    db.session.commit()
    return jsonify({
        "message": "Game updated",
        "game": game.to_dict(include_availability=True),
    }), 200


@admin_bp.route("/games/<int:game_id>/instructions", methods=["PUT"])
@admin_required
def set_instructions(game_id: int):
    """Set custom play instructions for a game."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    data = request.get_json() or {}
    content = data.get("content", "").strip()

    if not content:
        # Reset to default — delete custom instruction
        instruction = PlayInstruction.query.filter_by(game_id=game.id).first()
        if instruction:
            db.session.delete(instruction)
            db.session.commit()
        return jsonify({
            "message": "Instructions reset to default",
            "instructions": {
                "game_id": game.id,
                "content": DEFAULT_PLAY_INSTRUCTIONS,
                "is_custom": False,
            },
        }), 200

    instruction = PlayInstruction.query.filter_by(game_id=game.id).first()
    if instruction:
        instruction.content = content
        instruction.is_custom = True
        instruction.updated_at = datetime.now(timezone.utc)
    else:
        instruction = PlayInstruction(
            game_id=game.id,
            content=content,
            is_custom=True,
        )
        db.session.add(instruction)

    db.session.commit()
    return jsonify({
        "message": "Instructions updated",
        "instructions": instruction.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# Orders (admin view)
# ---------------------------------------------------------------------------


@admin_bp.route("/orders", methods=["GET"])
@admin_required
def list_orders():
    """List all orders with optional filters."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    query = Order.query

    status = request.args.get("status", "").strip()
    if status:
        query = query.filter_by(status=status)

    user_id = request.args.get("user_id", type=int)
    if user_id:
        query = query.filter_by(user_id=user_id)

    game_id = request.args.get("game_id", type=int)
    if game_id:
        query = query.filter_by(game_id=game_id)

    pagination = query.order_by(Order.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    orders = []
    for order in pagination.items:
        od = order.to_dict(include_credentials=True)
        od["user_email"] = order.user.email if order.user else None
        orders.append(od)

    return jsonify({
        "orders": orders,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


# ---------------------------------------------------------------------------
# Audit: Code Request Logs
# ---------------------------------------------------------------------------


@admin_bp.route("/audit/codes", methods=["GET"])
@admin_required
def audit_codes():
    """Code request log with optional filters."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    query = CodeRequestLog.query

    user_id = request.args.get("user_id", type=int)
    if user_id:
        query = query.filter_by(user_id=user_id)

    steam_account_id = request.args.get("steam_account_id", type=int)
    if steam_account_id:
        query = query.filter_by(steam_account_id=steam_account_id)

    pagination = query.order_by(CodeRequestLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    logs = []
    for entry in pagination.items:
        ld = entry.to_dict()
        ld["user_email"] = entry.user.email if entry.user else None
        ld["account_name"] = (
            entry.steam_account.account_name if entry.steam_account else None
        )
        logs.append(ld)

    return jsonify({
        "logs": logs,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200
