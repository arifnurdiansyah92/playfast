"""Admin endpoints: account CRUD, game sync, orders, audit, dashboard."""

import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from functools import wraps

from sqlalchemy import func, cast, Date

import requests as http_requests
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import (
    Assignment,
    CodeRequestLog,
    Game,
    GameAccount,
    Order,
    PasswordResetToken,
    PlayInstruction,
    SiteSetting,
    SteamAccount,
    Subscription,
    User,
)
from app.steam.service import (
    ensure_valid_token,
    fetch_owned_games,
    get_guard_code,
    fetch_confirmations,
    act_on_confirmation,
    steam_account_login,
    _force_new_token,
)

logger = logging.getLogger(__name__)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

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

    featured_games = Game.query.filter_by(is_featured=True, is_enabled=True).count()
    revoked_orders = Order.query.filter_by(status="revoked").count()

    # Recent 10 orders
    recent_orders = (
        Order.query.order_by(Order.created_at.desc()).limit(10).all()
    )
    recent_orders_data = []
    for o in recent_orders:
        od = o.to_dict(include_credentials=False)
        od["user_email"] = o.user.email if o.user else None
        recent_orders_data.append(od)

    # Recent 5 code requests
    recent_codes = (
        CodeRequestLog.query.order_by(CodeRequestLog.created_at.desc()).limit(5).all()
    )
    recent_codes_data = []
    for c in recent_codes:
        recent_codes_data.append({
            "id": c.id,
            "user_email": c.user.email if c.user else None,
            "account_name": c.steam_account.account_name if c.steam_account else None,
            "created_at": c.created_at.isoformat(),
        })

    # Top 10 most ordered games
    top_games_query = (
        db.session.query(Game.name, Game.appid, func.count(Order.id).label("order_count"))
        .join(Order, Order.game_id == Game.id)
        .filter(Order.status == "fulfilled")
        .group_by(Game.id, Game.name, Game.appid)
        .order_by(func.count(Order.id).desc())
        .limit(10)
        .all()
    )
    top_games_data = [
        {"name": row.name, "appid": row.appid, "order_count": row.order_count}
        for row in top_games_query
    ]

    # Orders per day for last 14 days
    fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=14)
    trend_query = (
        db.session.query(
            cast(Order.created_at, Date).label("date"),
            func.count(Order.id).label("count"),
        )
        .filter(Order.created_at >= fourteen_days_ago)
        .group_by(cast(Order.created_at, Date))
        .order_by(cast(Order.created_at, Date).asc())
        .all()
    )
    order_trend_data = [
        {"date": str(row.date), "count": row.count}
        for row in trend_query
    ]

    # Total revenue from fulfilled orders
    revenue_total = (
        db.session.query(func.coalesce(func.sum(Order.amount), 0))
        .filter(Order.status == "fulfilled")
        .scalar()
    )

    return jsonify({
        "total_accounts": total_accounts,
        "active_accounts": active_accounts,
        "total_games": total_games,
        "enabled_games": enabled_games,
        "featured_games": featured_games,
        "total_orders": total_orders,
        "fulfilled_orders": fulfilled_orders,
        "revoked_orders": revoked_orders,
        "total_users": total_users,
        "recent_orders": recent_orders_data,
        "recent_codes": recent_codes_data,
        "top_games": top_games_data,
        "order_trend": order_trend_data,
        "revenue_total": revenue_total,
    }), 200


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@admin_bp.route("/users", methods=["GET"])
@admin_required
def list_users():
    """List all users."""
    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        ud = u.to_dict()
        ud["order_count"] = u.orders.count()
        result.append(ud)
    return jsonify({"users": result}), 200


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id: int):
    """Update user (toggle admin, disable)."""
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    current_admin_id = int(get_jwt_identity())
    data = request.get_json() or {}

    if "is_admin" in data:
        if target.id == current_admin_id:
            return jsonify({"error": "Cannot change your own admin status"}), 400
        target.is_admin = bool(data["is_admin"])

    if "is_active" in data:
        if target.id == current_admin_id:
            return jsonify({"error": "Cannot deactivate yourself"}), 400
        target.is_active = bool(data["is_active"])

    if "password" in data and data["password"]:
        target.set_password(data["password"])

    db.session.commit()
    return jsonify({"message": "User updated", "user": target.to_dict()}), 200


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id: int):
    """Delete a user."""
    current_admin_id = int(get_jwt_identity())
    if user_id == current_admin_id:
        return jsonify({"error": "Cannot delete yourself"}), 400

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(target)
    db.session.commit()
    return jsonify({"message": "User deleted"}), 200


@admin_bp.route("/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def admin_generate_reset(user_id: int):
    """Generate a password reset link for a user."""
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    token = PasswordResetToken.create_for_user(target.id)
    db.session.commit()

    return jsonify({
        "message": "Reset link generated",
        "token": token.token,
        "expires_at": token.expires_at.isoformat(),
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

    required_fields = ["shared_secret", "account_name", "identity_secret", "device_id"]
    missing = [f for f in required_fields if not mafile_data.get(f)]
    if missing:
        return jsonify({
            "error": f"Invalid .mafile — missing required fields: {', '.join(missing)}"
        }), 400

    session_data = mafile_data.get("Session")
    if not session_data or not isinstance(session_data, dict):
        return jsonify({
            "error": "Invalid .mafile — missing Session object"
        }), 400

    account_name = mafile_data["account_name"]
    steam_id = session_data.get("SteamID", "")

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
# Account Actions (Steam Guard, Confirmations, Login)
# ---------------------------------------------------------------------------


@admin_bp.route("/accounts/<int:account_id>/assignments", methods=["GET"])
@admin_required
def account_assignments(account_id: int):
    """Return all assignments for a given Steam account with user/game info."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    assignments = (
        Assignment.query
        .filter_by(steam_account_id=account_id)
        .join(User, Assignment.user_id == User.id)
        .join(Game, Assignment.game_id == Game.id)
        .order_by(Assignment.created_at.desc())
        .all()
    )

    result = []
    for a in assignments:
        result.append({
            "id": a.id,
            "user_email": a.user.email if a.user else None,
            "user_id": a.user_id,
            "game_name": a.game.name if a.game else None,
            "game_appid": a.game.appid if a.game else None,
            "is_revoked": a.is_revoked,
            "created_at": a.created_at.isoformat(),
        })

    return jsonify({"assignments": result}), 200


@admin_bp.route("/accounts/<int:account_id>/code", methods=["POST"])
@admin_required
def admin_get_code(account_id: int):
    """Generate a Steam Guard code for an account."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    shared_secret = account.mafile_data.get("shared_secret", "")
    if not shared_secret:
        return jsonify({"error": "No shared_secret in mafile"}), 400

    result = get_guard_code(shared_secret)
    return jsonify(result), 200


@admin_bp.route("/accounts/<int:account_id>/login", methods=["POST"])
@admin_required
def admin_login_account(account_id: int):
    """Force a fresh Steam login to refresh tokens."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    try:
        new_session = steam_account_login(account.mafile_data, account.password)
        # Update tokens in DB
        mafile = account.mafile_data.copy()
        session = mafile.get("Session", {})
        session["SteamID"] = new_session["SteamID"]
        session["AccessToken"] = new_session["AccessToken"]
        session["RefreshToken"] = new_session["RefreshToken"]
        session["SteamLoginSecure"] = f"{new_session['SteamID']}%7C%7C{new_session['AccessToken']}"
        mafile["Session"] = session
        account.mafile_data = mafile
        account.steam_id = new_session["SteamID"]
        db.session.commit()
        return jsonify({"message": "Login successful, tokens updated"}), 200
    except Exception as e:
        return jsonify({"error": f"Login failed: {str(e)}"}), 400


@admin_bp.route("/accounts/<int:account_id>/confirmations", methods=["GET"])
@admin_required
def admin_get_confirmations(account_id: int):
    """Fetch pending trade/market confirmations."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    # Ensure valid token first
    mafile = account.mafile_data.copy()
    ensure_valid_token(mafile, account.password)
    if mafile != account.mafile_data:
        account.mafile_data = mafile
        db.session.commit()

    try:
        confs = fetch_confirmations(account.mafile_data)
        return jsonify({"confirmations": confs}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch confirmations: {str(e)}"}), 502


@admin_bp.route("/accounts/<int:account_id>/confirmations/<conf_id>", methods=["POST"])
@admin_required
def admin_act_confirmation(account_id: int, conf_id: str):
    """Accept or deny a confirmation. Body: {"action": "allow"|"cancel", "nonce": "..."}"""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    data = request.get_json() or {}
    action = data.get("action", "allow")
    nonce = data.get("nonce", "")

    if not nonce:
        return jsonify({"error": "nonce is required"}), 400

    try:
        ok = act_on_confirmation(account.mafile_data, conf_id, nonce, action)
        return jsonify({
            "success": ok,
            "message": "Confirmation accepted" if action == "allow" else "Confirmation denied"
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ---------------------------------------------------------------------------
# Game Sync
# ---------------------------------------------------------------------------


def _fetch_game_metadata(appid: int) -> dict | None:
    """
    Fetch metadata for a game from the Steam Store API.
    Returns dict with description, header_image, genres, screenshots, movies or None on failure.
    """
    try:
        resp = http_requests.get(
            f"https://store.steampowered.com/api/appdetails?appids={appid}",
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        app_data = data.get(str(appid), {})
        if not app_data.get("success"):
            return None
        details = app_data.get("data", {})
        genres_list = details.get("genres", [])
        genre_names = ", ".join(g.get("description", "") for g in genres_list)

        # Screenshots
        screenshots = []
        for ss in details.get("screenshots", []):
            screenshots.append({
                "thumbnail": ss.get("path_thumbnail", ""),
                "full": ss.get("path_full", ""),
            })

        # Movies / trailers
        movies = []
        for mv in details.get("movies", []):
            mp4 = mv.get("mp4", {})
            movies.append({
                "id": mv.get("id"),
                "name": mv.get("name", ""),
                "thumbnail": mv.get("thumbnail", ""),
                "mp4_480": mp4.get("480", ""),
                "mp4_max": mp4.get("max", ""),
            })

        return {
            "description": details.get("short_description", ""),
            "header_image": details.get("header_image", ""),
            "genres": genre_names,
            "screenshots": screenshots,
            "movies": movies,
        }
    except Exception as e:
        logger.warning("Failed to fetch metadata for appid %s: %s", appid, e)
        return None


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
    except http_requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 401:
            # Token was rejected — force refresh/re-login and retry once
            token = _force_new_token(mafile_data, account.password)
            if token and mafile_data != account.mafile_data:
                account.mafile_data = mafile_data
                db.session.add(account)
            if token:
                try:
                    games = fetch_owned_games(token, steam_id)
                except Exception as retry_err:
                    return {
                        "account_name": account.account_name,
                        "success": False,
                        "error": str(retry_err),
                    }
            else:
                return {
                    "account_name": account.account_name,
                    "success": False,
                    "error": "401 Unauthorized — token refresh and re-login both failed",
                }
        else:
            return {
                "account_name": account.account_name,
                "success": False,
                "error": str(e),
            }
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

            # Fetch metadata from Steam Store API for new games
            metadata = _fetch_game_metadata(g["appid"])
            if metadata:
                game.description = metadata.get("description")
                game.header_image = metadata.get("header_image")
                game.genres = metadata.get("genres")
                game.screenshots = metadata.get("screenshots")
                game.movies = metadata.get("movies")
        else:
            # Update name/icon if changed
            if game.name != g["name"]:
                game.name = g["name"]
            if g.get("icon") and game.icon != g["icon"]:
                game.icon = g["icon"]

            # Backfill metadata if missing screenshots/movies
            if not game.screenshots:
                metadata = _fetch_game_metadata(g["appid"])
                if metadata:
                    game.description = metadata.get("description") or game.description
                    game.header_image = metadata.get("header_image") or game.header_image
                    game.genres = metadata.get("genres") or game.genres
                    game.screenshots = metadata.get("screenshots")
                    game.movies = metadata.get("movies")

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


@admin_bp.route("/games/refresh-metadata", methods=["POST"])
@admin_required
def refresh_game_metadata():
    """Re-fetch metadata (screenshots, movies, description) for all games from Steam."""
    games = Game.query.all()
    updated = 0
    for game in games:
        metadata = _fetch_game_metadata(game.appid)
        if metadata:
            game.description = metadata.get("description") or game.description
            game.header_image = metadata.get("header_image") or game.header_image
            game.genres = metadata.get("genres") or game.genres
            game.screenshots = metadata.get("screenshots")
            game.movies = metadata.get("movies")
            updated += 1
    db.session.commit()
    return jsonify({"message": f"Metadata refreshed for {updated}/{len(games)} games"}), 200


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

    query = Game.query

    q = request.args.get("q", "").strip()
    if q:
        query = query.filter(Game.name.ilike(f"%{q}%"))

    genre = request.args.get("genre", "").strip()
    if genre:
        query = query.filter(func.lower(Game.genres).contains(genre.lower()))

    is_enabled = request.args.get("is_enabled", "").strip()
    if is_enabled == "true":
        query = query.filter(Game.is_enabled == True)  # noqa: E712
    elif is_enabled == "false":
        query = query.filter(Game.is_enabled == False)  # noqa: E712

    is_featured = request.args.get("is_featured", "").strip()
    if is_featured == "true":
        query = query.filter(Game.is_featured == True)  # noqa: E712

    year = request.args.get("year", "").strip()
    if year and year.isdigit():
        y = int(year)
        query = query.filter(
            Game.created_at >= datetime(y, 1, 1, tzinfo=timezone.utc),
            Game.created_at < datetime(y + 1, 1, 1, tzinfo=timezone.utc),
        )

    pagination = query.order_by(Game.name.asc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    games = []
    for game in pagination.items:
        gd = game.to_dict(include_availability=True, admin=True)
        # Include which accounts own this game
        account_links = (
            GameAccount.query.join(SteamAccount)
            .filter(GameAccount.game_id == game.id, SteamAccount.is_active == True)  # noqa: E712
            .all()
        )
        gd["accounts"] = [
            {
                "id": link.steam_account.id,
                "account_name": link.steam_account.account_name,
            }
            for link in account_links
        ]
        games.append(gd)

    # Collect distinct years from games for filter UI
    year_rows = (
        db.session.query(func.distinct(func.extract("year", Game.created_at)))
        .order_by(func.extract("year", Game.created_at).desc())
        .all()
    )
    years = [int(r[0]) for r in year_rows if r[0]]

    # Collect distinct genres for filter UI
    genre_rows = (
        db.session.query(Game.genres)
        .filter(Game.genres.isnot(None), Game.genres != "")
        .all()
    )
    genre_set: set[str] = set()
    for (genres_str,) in genre_rows:
        for g in genres_str.split(","):
            stripped = g.strip()
            if stripped:
                genre_set.add(stripped)

    return jsonify({
        "games": games,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
        "genres": sorted(genre_set),
        "years": years,
    }), 200


@admin_bp.route("/games/bulk-update", methods=["PUT"])
@admin_required
def bulk_update_games():
    """Bulk update multiple games at once.

    Body: {"ids": [1,2,3], "data": {"price": 50000, "is_enabled": true, ...}}
    """
    body = request.get_json() or {}
    ids = body.get("ids", [])
    data = body.get("data", {})

    if not ids or not isinstance(ids, list):
        return jsonify({"error": "ids must be a non-empty list"}), 400
    if not data or not isinstance(data, dict):
        return jsonify({"error": "data must be a non-empty object"}), 400

    allowed_fields = {"price", "is_enabled", "is_featured"}
    update_dict = {}
    for key in allowed_fields:
        if key in data:
            if key == "price":
                update_dict[key] = int(data[key])
            else:
                update_dict[key] = bool(data[key])

    if not update_dict:
        return jsonify({"error": "No valid fields to update"}), 400

    count = Game.query.filter(Game.id.in_(ids)).update(update_dict)
    db.session.commit()

    return jsonify({
        "message": f"{count} games updated",
        "updated": count,
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
    if "is_featured" in data:
        game.is_featured = bool(data["is_featured"])
    if "name" in data:
        game.name = data["name"]
    # Custom override fields (set to None to clear)
    if "custom_name" in data:
        game.custom_name = data["custom_name"] or None
    if "custom_description" in data:
        game.custom_description = data["custom_description"] or None
    if "custom_header_image" in data:
        game.custom_header_image = data["custom_header_image"] or None
    if "custom_screenshots" in data:
        game.custom_screenshots = data["custom_screenshots"] or None

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
        "game": game.to_dict(include_availability=True, admin=True),
    }), 200


@admin_bp.route("/games/<int:game_id>/upload-image", methods=["POST"])
@admin_required
def upload_game_image(game_id: int):
    """Upload a custom image for a game (header or screenshot)."""
    game = db.session.get(Game, game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    # Validate extension
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_ext:
        return jsonify({"error": f"File type not allowed. Use: {', '.join(allowed_ext)}"}), 400

    # Save file
    upload_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "uploads", "games", str(game_id),
    )
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)

    url = f"/uploads/games/{game_id}/{filename}"
    return jsonify({"url": url}), 200


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


@admin_bp.route("/orders/<int:order_id>/revoke", methods=["POST"])
@admin_required
def revoke_access(order_id: int):
    """Revoke a user's access to an assigned account."""
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not order.assignment:
        return jsonify({"error": "No assignment on this order"}), 400

    assignment = order.assignment
    if assignment.is_revoked:
        return jsonify({"error": "Already revoked"}), 409

    assignment.is_revoked = True
    assignment.revoked_at = datetime.now(timezone.utc)
    order.status = "revoked"
    db.session.commit()

    return jsonify({"message": "Access revoked", "order_id": order_id}), 200


@admin_bp.route("/orders/<int:order_id>/restore", methods=["POST"])
@admin_required
def restore_access(order_id: int):
    """Restore a previously revoked access."""
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if not order.assignment:
        return jsonify({"error": "No assignment on this order"}), 400

    assignment = order.assignment
    if not assignment.is_revoked:
        return jsonify({"error": "Not revoked"}), 409

    assignment.is_revoked = False
    assignment.revoked_at = None
    order.status = "fulfilled"
    db.session.commit()

    return jsonify({"message": "Access restored", "order_id": order_id}), 200


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
        ld["game_name"] = (
            entry.assignment.game.name
            if entry.assignment and entry.assignment.game
            else None
        )
        logs.append(ld)

    return jsonify({
        "logs": logs,
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    }), 200


# ---------------------------------------------------------------------------
# Site Settings
# ---------------------------------------------------------------------------


@admin_bp.route("/subscriptions", methods=["GET"])
@admin_required
def list_subscriptions():
    """List all subscriptions with optional status filter."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)
    status_filter = request.args.get("status", "").strip()

    query = Subscription.query

    if status_filter and status_filter != "all":
        query = query.filter(Subscription.status == status_filter)

    pagination = query.order_by(Subscription.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    subs = []
    for sub in pagination.items:
        sd = sub.to_dict()
        user = db.session.get(User, sub.user_id)
        sd["user_email"] = user.email if user else "Unknown"
        subs.append(sd)

    return jsonify({
        "subscriptions": subs,
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
    }), 200


@admin_bp.route("/subscriptions/<int:sub_id>/confirm", methods=["POST"])
@admin_required
def confirm_subscription_payment(sub_id: int):
    """Admin manually confirms payment for a subscription (manual payment mode)."""
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404

    if sub.status != "pending_payment":
        return jsonify({"error": "Subscription is not pending payment"}), 400

    sub.payment_type = "manual"
    sub.paid_at = datetime.now(timezone.utc)
    sub.activate()
    db.session.commit()

    return jsonify({
        "message": "Subscription payment confirmed and activated",
        "subscription": sub.to_dict(),
    }), 200


@admin_bp.route("/subscriptions/grant-lifetime", methods=["POST"])
@admin_required
def grant_lifetime_access():
    """Grant lifetime subscription access to a specific user."""
    data = request.get_json() or {}
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    # Check if user already has an active subscription
    existing = (
        Subscription.query
        .filter_by(user_id=user_id, status="active")
        .first()
    )
    if existing and existing.is_active:
        return jsonify({"error": "User already has an active subscription"}), 409

    sub = Subscription(
        user_id=user_id,
        plan="lifetime",
        amount=0,
        payment_type="admin_grant",
    )
    sub.paid_at = datetime.now(timezone.utc)
    sub.activate()
    db.session.add(sub)
    db.session.commit()

    return jsonify({
        "message": f"Lifetime access granted to {target.email}",
        "subscription": sub.to_dict(),
    }), 201


# ---------------------------------------------------------------------------


@admin_bp.route("/settings", methods=["GET"])
@admin_required
def get_settings():
    """Return all site settings."""
    return jsonify({"settings": SiteSetting.get_all()}), 200


@admin_bp.route("/settings", methods=["PUT"])
@admin_required
def update_settings():
    """Update site settings. Body: {"key": "value", ...}"""
    data = request.get_json() or {}

    valid_keys = set(SiteSetting.DEFAULTS.keys())
    for key, value in data.items():
        if key not in valid_keys:
            continue
        SiteSetting.set(key, str(value))

    db.session.commit()
    return jsonify({"message": "Settings updated", "settings": SiteSetting.get_all()}), 200


@admin_bp.route("/orders/<int:order_id>/confirm-manual", methods=["POST"])
@admin_required
def confirm_manual_payment(order_id: int):
    """Admin manually confirms payment for an order (manual payment mode)."""
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if order.status != "pending_payment":
        return jsonify({"error": "Order is not pending payment"}), 400

    order.payment_type = "manual"
    order.paid_at = datetime.now(timezone.utc)
    db.session.flush()

    from app.store.routes import _fulfill_order
    success = _fulfill_order(order)

    if not success:
        order.status = "fulfilled"
        db.session.commit()

    return jsonify({
        "message": "Payment confirmed and order fulfilled",
        "order": order.to_dict(include_credentials=True),
    }), 200
