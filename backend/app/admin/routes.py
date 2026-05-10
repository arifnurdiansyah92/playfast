"""Admin endpoints: account CRUD, game sync, orders, audit, dashboard."""

import csv
import io
import json
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from functools import wraps

from sqlalchemy import func, cast, Date

import requests as http_requests
from flask import Blueprint, make_response, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.jobs import get_current_job, request_cancel, start_job
from app.models import (
    AccountFlag,
    Assignment,
    CodeRequestLog,
    Game,
    GameAccount,
    GameRequest,
    GameRequestVote,
    Order,
    PasswordResetToken,
    PlayInstruction,
    PromoCode,
    PromoCodeUsage,
    ReferralReward,
    Review,
    ReviewImage,
    SiteSetting,
    SteamAccount,
    Subscription,
    User,
)
from app.reviews.service import (
    MAX_IMAGES_PER_REVIEW,
    delete_review_image_file,
    process_review_image,
    serialize_review,
)
from app.steam.service import (
    ensure_valid_token,
    fetch_owned_games,
    fetch_family_shared_games,
    get_guard_code,
    fetch_confirmations,
    act_on_confirmation,
    steam_account_login,
    _force_new_token,
    logout_all_devices,
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


@admin_bp.route("/users/<int:user_id>/profile", methods=["GET"])
@admin_required
def user_profile(user_id: int):
    """Comprehensive single-user profile for the admin CRM view.

    Returns everything currently trackable about a user in one payload so
    the detail page can render without a chatty waterfall of N requests.
    OTP/Steam-Guard request history is intentionally excluded here — it
    can run into thousands of rows; admin detail page paginates that
    separately via the existing /audit/codes?user_id=N endpoint.
    """
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # ── Orders (purchases + subscription claims) ─────────────────────
    orders = (
        Order.query.filter_by(user_id=user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    orders_data = []
    fulfilled_count = 0
    purchase_spent = 0
    for o in orders:
        d = o.to_dict()
        if o.status == "fulfilled":
            fulfilled_count += 1
            if o.type == "purchase":
                purchase_spent += o.amount or 0
        orders_data.append(d)

    # ── Subscriptions ────────────────────────────────────────────────
    subs = (
        Subscription.query.filter_by(user_id=user.id)
        .order_by(Subscription.created_at.desc())
        .all()
    )
    subs_data = [s.to_dict() for s in subs]
    sub_spent = sum((s.amount or 0) for s in subs if s.paid_at)
    active_sub = next((s for s in subs if s.is_active), None)

    # ── Assignments (account ↔ game pairs, history) ──────────────────
    assignments = (
        Assignment.query.filter_by(user_id=user.id)
        .order_by(Assignment.created_at.desc())
        .all()
    )
    assignments_data = []
    for a in assignments:
        assignments_data.append({
            "id": a.id,
            "order_id": a.order_id,
            "is_revoked": a.is_revoked,
            "revoked_at": a.revoked_at.isoformat() if a.revoked_at else None,
            "created_at": a.created_at.isoformat(),
            "steam_account_id": a.steam_account_id,
            "steam_account_name": a.steam_account.account_name if a.steam_account else None,
            "steam_id": a.steam_account.steam_id if a.steam_account else None,
            "game_id": a.game_id,
            "game_name": (a.game.custom_name or a.game.name) if a.game else None,
            "game_appid": a.game.appid if a.game else None,
        })

    # ── OTP / Steam Guard summary ────────────────────────────────────
    code_count = CodeRequestLog.query.filter_by(user_id=user.id).count()
    last_code = (
        CodeRequestLog.query.filter_by(user_id=user.id)
        .order_by(CodeRequestLog.created_at.desc())
        .first()
    )

    # ── Promo code usages ────────────────────────────────────────────
    promo_usages_q = (
        db.session.query(PromoCodeUsage, PromoCode.code)
        .join(PromoCode, PromoCode.id == PromoCodeUsage.promo_code_id)
        .filter(PromoCodeUsage.user_id == user.id)
        .order_by(PromoCodeUsage.used_at.desc())
        .all()
    )
    promo_usages_data = []
    promo_total_discount = 0
    for usage, code in promo_usages_q:
        promo_usages_data.append({
            "id": usage.id,
            "code": code,
            "order_id": usage.order_id,
            "subscription_id": usage.subscription_id,
            "discount_amount": usage.discount_amount,
            "used_at": usage.used_at.isoformat(),
        })
        promo_total_discount += usage.discount_amount

    # ── Referral activity ────────────────────────────────────────────
    referred_users = (
        User.query.filter_by(referred_by_user_id=user.id)
        .order_by(User.created_at.desc())
        .all()
    )
    rewards = (
        ReferralReward.query.filter_by(referrer_user_id=user.id)
        .order_by(ReferralReward.awarded_at.desc())
        .all()
    )
    rewards_data = [{
        "id": r.id,
        "referee_user_id": r.referee_user_id,
        "credit_awarded": r.credit_awarded,
        "awarded_at": r.awarded_at.isoformat(),
    } for r in rewards]
    referrer = (
        db.session.get(User, user.referred_by_user_id)
        if user.referred_by_user_id
        else None
    )
    referred_summary = []
    for ru in referred_users:
        rewarded = next((r for r in rewards if r.referee_user_id == ru.id), None)
        referred_summary.append({
            "user_id": ru.id,
            "email": ru.email,
            "joined_at": ru.created_at.isoformat(),
            "credit_awarded": rewarded.credit_awarded if rewarded else None,
        })

    # ── Review ───────────────────────────────────────────────────────
    review_data = None
    own_review = Review.query.filter_by(user_id=user.id).first()
    if own_review:
        review_data = {
            "id": own_review.id,
            "rating": own_review.rating,
            "headline": own_review.headline,
            "body": own_review.body,
            "status": own_review.status,
            "is_featured": own_review.is_featured,
            "admin_note": own_review.admin_note,
            "created_at": own_review.created_at.isoformat(),
            "approved_at": (
                own_review.approved_at.isoformat() if own_review.approved_at else None
            ),
        }

    # ── Account flags filed by user ──────────────────────────────────
    flags = (
        AccountFlag.query.filter_by(user_id=user.id)
        .order_by(AccountFlag.created_at.desc())
        .all()
    )
    flags_data = [f.to_dict(include_admin_fields=True) for f in flags]

    # ── Game requests / votes ────────────────────────────────────────
    voted_requests = (
        db.session.query(GameRequest, GameRequestVote.created_at)
        .join(GameRequestVote, GameRequestVote.game_request_id == GameRequest.id)
        .filter(GameRequestVote.user_id == user.id)
        .order_by(GameRequestVote.created_at.desc())
        .all()
    )
    game_requests_data = [{
        "id": gr.id,
        "appid": gr.appid,
        "name": gr.name,
        "status": gr.status,
        "request_count": gr.request_count(),
        "voted_at": voted_at.isoformat(),
    } for gr, voted_at in voted_requests]

    return jsonify({
        "user": user.to_dict(),
        "referrer": (
            {"id": referrer.id, "email": referrer.email, "referral_code": referrer.referral_code}
            if referrer
            else None
        ),
        "stats": {
            "total_orders": len(orders),
            "fulfilled_orders": fulfilled_count,
            "total_spent": purchase_spent + sub_spent,
            "purchase_spent": purchase_spent,
            "subscription_spent": sub_spent,
            "subscription_count": len(subs),
            "active_subscription": active_sub.to_dict() if active_sub else None,
            "code_request_count": code_count,
            "last_code_request_at": (
                last_code.created_at.isoformat() if last_code else None
            ),
            "referrals_made": len(referred_users),
            "referrals_rewarded": len(rewards),
            "total_credit_earned": sum(r.credit_awarded for r in rewards),
            "promo_usage_count": len(promo_usages_data),
            "promo_total_discount": promo_total_discount,
        },
        "orders": orders_data,
        "subscriptions": subs_data,
        "assignments": assignments_data,
        "promo_usages": promo_usages_data,
        "referrals_made": referred_summary,
        "referral_rewards": rewards_data,
        "review": review_data,
        "account_flags": flags_data,
        "game_requests": game_requests_data,
    }), 200


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

    if "referral_code" in data:
        new_code = (data["referral_code"] or "").strip().upper()
        if not new_code:
            return jsonify({"error": "Referral code cannot be empty"}), 400
        if len(new_code) > 12:
            return jsonify({"error": "Referral code must be 12 characters or less"}), 400
        if not new_code.isalnum():
            return jsonify({"error": "Referral code must be alphanumeric"}), 400
        existing = User.query.filter(
            User.referral_code == new_code,
            User.id != target.id
        ).first()
        if existing:
            return jsonify({"error": f"Referral code '{new_code}' is already taken"}), 409
        target.referral_code = new_code

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


@admin_bp.route("/users/<int:user_id>/regenerate-referral-code", methods=["POST"])
@admin_required
def regenerate_user_referral_code(user_id: int):
    """Generate a fresh unique 6-char referral code for the user."""
    import secrets
    import string

    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404

    alphabet = string.ascii_uppercase + string.digits
    for _ in range(50):
        candidate = ''.join(secrets.choice(alphabet) for _ in range(6))
        if not User.query.filter_by(referral_code=candidate).first():
            target.referral_code = candidate
            db.session.commit()
            return jsonify({
                "message": "Referral code regenerated",
                "referral_code": candidate,
                "user": target.to_dict(),
            }), 200

    return jsonify({"error": "Could not generate a unique code after 50 attempts"}), 503


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
    """Update account password or active status.

    Deactivating an account also detaches it from every user it's currently
    assigned to and tries to re-fulfill those orders against another active
    account that owns the game. Orders that can't be reassigned right now
    (no other active account has the game) are left as zombies — the admin
    can heal them later via /orders/retry-fulfill-all once new accounts are
    added or another account is reactivated.
    """
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    data = request.get_json() or {}

    if "password" in data:
        account.password = data["password"]

    if "show_in_catalog_when_disabled" in data:
        account.show_in_catalog_when_disabled = bool(
            data["show_in_catalog_when_disabled"]
        )

    reassigned: list[int] = []
    orphaned: list[int] = []
    family_resync_started = False
    family_resync_account_count = 0
    family_resync_skipped_reason: str | None = None
    if "is_active" in data:
        new_active = bool(data["is_active"])
        deactivating = account.is_active and not new_active
        account.is_active = new_active

        if deactivating:
            from app.store.routes import _fulfill_order

            affected = (
                Assignment.query
                .filter(
                    Assignment.steam_account_id == account_id,
                    Assignment.is_revoked == False,  # noqa: E712
                )
                .all()
            )
            for assignment in affected:
                order = assignment.order
                # Revoke the old assignment so user-facing queries that filter
                # is_revoked=False stop returning the dead account. Don't set
                # order.status to "revoked" — we want to re-fulfill, not lock
                # the user out.
                assignment.is_revoked = True
                assignment.revoked_at = datetime.now(timezone.utc)
                if order is not None:
                    order.assignment_id = None
                # Commit the detach (and the is_active=False flip on the first
                # iteration) before _fulfill_order runs, so its candidate
                # query sees the deactivated account excluded and the orphan
                # state is durable even if reassignment fails.
                db.session.commit()

                if order is None:
                    continue

                try:
                    success = _fulfill_order(order)
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Reassignment failed for order %s after deactivating account %s",
                        order.id, account_id,
                    )
                    db.session.rollback()
                    success = False

                if success:
                    reassigned.append(order.id)
                else:
                    orphaned.append(order.id)

            # Auto-trigger sync on family-joined accounts.
            # When the disabled account directly owns a game and another
            # active account has the same game flagged is_shared=True,
            # that other account is highly likely sharing FROM this one
            # via Steam Families. Re-syncing them now will pick up the
            # share-revocation on Steam's side and prune the stale link
            # via the new prune logic in _sync_account_games.
            family_resync_account_count, family_resync_started, family_resync_skipped_reason = (
                _resync_family_joined_accounts(account_id)
            )

    db.session.commit()

    msg = "Account updated"
    if reassigned or orphaned:
        parts = []
        if reassigned:
            parts.append(f"reassigned {len(reassigned)} order(s)")
        if orphaned:
            parts.append(f"{len(orphaned)} pending account availability")
        msg = "Account deactivated. " + "; ".join(parts) + "."
    if family_resync_started:
        msg += f" Re-syncing {family_resync_account_count} family-joined account(s) in background."
    elif family_resync_account_count > 0 and family_resync_skipped_reason:
        msg += (
            f" {family_resync_account_count} family-joined account(s) detected — "
            f"resync skipped: {family_resync_skipped_reason}."
        )

    return jsonify({
        "message": msg,
        "account": account.to_dict(),
        "reassigned_orders": reassigned,
        "orphaned_orders": orphaned,
        "family_resync_started": family_resync_started,
        "family_resync_account_count": family_resync_account_count,
        "family_resync_skipped_reason": family_resync_skipped_reason,
    }), 200


def _resync_family_joined_accounts(disabled_account_id: int) -> tuple[int, bool, str | None]:
    """Kick off a background sync of accounts that likely share a Steam
    Family with the now-disabled account.

    Heuristic: any active account B is treated as a family-joined candidate
    when there exists a game G such that:
        - the disabled account directly owns G (is_shared=False), and
        - account B has G flagged is_shared=True.

    Re-syncing those candidates lets `_sync_account_games` (with its prune
    logic) discover that G is no longer in their family share and remove
    the stale GameAccount + revoke any active customer assignments.

    Returns ``(candidate_count, started, skipped_reason)``:
      - candidate_count: how many distinct accounts matched the heuristic
      - started: True iff a background job was successfully kicked off
      - skipped_reason: human-readable reason when started=False
        (only set when candidate_count > 0)
    """
    # Subquery: appids the disabled account directly owns
    owned_appids_subq = (
        db.session.query(GameAccount.game_id)
        .filter(
            GameAccount.steam_account_id == disabled_account_id,
            GameAccount.is_shared == False,  # noqa: E712
        )
        .subquery()
    )

    candidate_ids = [
        row[0]
        for row in (
            db.session.query(GameAccount.steam_account_id)
            .join(SteamAccount, SteamAccount.id == GameAccount.steam_account_id)
            .filter(
                GameAccount.steam_account_id != disabled_account_id,
                GameAccount.is_shared == True,  # noqa: E712
                GameAccount.game_id.in_(db.session.query(owned_appids_subq.c.game_id)),
                SteamAccount.is_active == True,  # noqa: E712
            )
            .distinct()
            .all()
        )
    ]

    if not candidate_ids:
        return 0, False, None

    # Don't fight an admin-launched sync-all/logout-all/etc.
    current = get_current_job()
    if current and current.get("status") == "running":
        return len(candidate_ids), False, "another job is already running"

    from flask import current_app
    app = current_app._get_current_object()
    job = start_job(
        "family_resync",
        _bg_sync_games,
        args=(app, candidate_ids),
        total=len(candidate_ids),
    )
    if not job:
        return len(candidate_ids), False, "another job is already running"
    return len(candidate_ids), True, None


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


# ---------------------------------------------------------------------------
# Steam login throttle
#
# Steam returns HTTP 429 if the server's IP submits too many login attempts in
# a short window. The block lasts 15-30 minutes, which means a single
# trigger-happy admin can lock everyone out. We enforce two guards:
#
#   1. Min gap between consecutive login attempts globally (anti-rapid-click).
#   2. Hard block once Steam returns 429 — no more login attempts for 15
#      minutes regardless of who clicks.
# ---------------------------------------------------------------------------
_login_throttle_lock = threading.Lock()
_last_login_attempt: float = 0.0
_login_blocked_until: float = 0.0
_LOGIN_MIN_GAP = 30.0  # seconds between consecutive attempts (any account)
_LOGIN_429_BACKOFF = 15 * 60  # seconds to refuse all logins after a 429


def _login_throttle_check() -> tuple[bool, int, str]:
    """Returns (ok, retry_after_seconds, reason). reason is empty on ok."""
    global _last_login_attempt
    now = time.time()
    with _login_throttle_lock:
        if now < _login_blocked_until:
            return False, int(_login_blocked_until - now), "steam_rate_limited"
        elapsed = now - _last_login_attempt
        if elapsed < _LOGIN_MIN_GAP:
            return False, int(_LOGIN_MIN_GAP - elapsed) or 1, "min_gap"
        _last_login_attempt = now
        return True, 0, ""


def _login_mark_429():
    """Steam responded with 429 — block all login attempts for the backoff window."""
    global _login_blocked_until
    with _login_throttle_lock:
        _login_blocked_until = time.time() + _LOGIN_429_BACKOFF


@admin_bp.route("/accounts/<int:account_id>/login", methods=["POST"])
@admin_required
def admin_login_account(account_id: int):
    """Force a fresh Steam login to refresh tokens."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    ok, retry_after, reason = _login_throttle_check()
    if not ok:
        if reason == "steam_rate_limited":
            mins = max(1, retry_after // 60)
            msg = (
                f"Steam memblokir login dari IP server (rate limit). "
                f"Tunggu sekitar {mins} menit lagi sebelum mencoba ulang."
            )
        else:
            msg = (
                f"Login attempts terlalu cepat — tunggu {retry_after} detik lagi "
                f"sebelum klik tombol Login berikutnya."
            )
        return jsonify({"error": msg, "retry_after": retry_after}), 429

    try:
        new_session = steam_account_login(account.mafile_data, account.password)
    except http_requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 429:
            _login_mark_429()
            mins = _LOGIN_429_BACKOFF // 60
            return jsonify({
                "error": (
                    f"Steam memblokir login dari IP server (rate limit). "
                    f"Tunggu sekitar {mins} menit, lalu coba lagi."
                ),
                "retry_after": _LOGIN_429_BACKOFF,
            }), 429
        return jsonify({"error": f"Steam HTTP error: {e}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    # Success — update tokens in DB
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


@admin_bp.route("/accounts/<int:account_id>/logout-all", methods=["POST"])
@admin_required
def admin_logout_all_devices(account_id: int):
    """Revoke every active Steam session on this account, then re-login Playfast."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    mafile = account.mafile_data.copy()
    result = logout_all_devices(mafile, account.password)

    # Persist updated tokens regardless of partial success. Unconditional assign
    # is intentional: shallow copy means nested Session dict is shared, so
    # `mafile != account.mafile_data` is unreliable after the service mutates it.
    account.mafile_data = mafile
    account.steam_id = mafile.get("Session", {}).get("SteamID", account.steam_id)
    db.session.commit()

    if result.get("error"):
        return jsonify({
            "error": result["error"],
            "revoked_count": result.get("revoked_count", 0),
            "failed_count": result.get("failed_count", 0),
            "relogin_success": result.get("relogin_success", False),
        }), 502

    return jsonify({
        "message": f"Logged out {result['revoked_count']} device(s)",
        "revoked_count": result["revoked_count"],
        "failed_count": result["failed_count"],
        "devices": result["devices"],
        "relogin_success": result["relogin_success"],
    }), 200


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


_last_steam_api_call = 0.0
_steam_api_rate_lock = threading.Lock()


def _wait_for_steam_slot(min_gap: float):
    """Block until enough time has passed since the last Steam Store API call,
    then mark a fresh slot. Thread-safe — multiple workers serialize on the
    lock so the overall request rate stays bounded even under parallelism."""
    global _last_steam_api_call
    with _steam_api_rate_lock:
        now = time.time()
        elapsed = now - _last_steam_api_call
        if elapsed < min_gap:
            time.sleep(min_gap - elapsed)
        _last_steam_api_call = time.time()


def _fetch_game_metadata(appid: int) -> dict | None:
    """
    Fetch metadata for a game from the Steam Store API.
    Returns dict with description, header_image, genres, screenshots, movies or None on failure.
    Rate-limited to avoid Steam API throttling. Thread-safe — workers share the
    rate limiter so parallel fetches stay under Steam's per-IP limit.
    """
    app_data = None
    for attempt in range(3):
        delay = 1.5 if attempt == 0 else 5.0
        _wait_for_steam_slot(delay)

        try:
            resp = http_requests.get(
                f"https://store.steampowered.com/api/appdetails?appids={appid}&cc=us",
                timeout=10,
            )
            if resp.status_code == 429:
                logger.warning("Steam rate limit hit for appid %s, waiting 30s (attempt %d)", appid, attempt + 1)
                time.sleep(30)
                continue
            resp.raise_for_status()
            data = resp.json()
            if data is None:
                logger.warning("Steam returned null for appid %s, waiting 10s (attempt %d)", appid, attempt + 1)
                time.sleep(10)
                continue
            app_data = data.get(str(appid), {})
            if not app_data.get("success"):
                return None
            break
        except Exception as e:
            if attempt < 2:
                logger.warning("Retry %d for appid %s: %s", attempt + 1, appid, e)
                time.sleep(5)
                continue
            logger.warning("Failed to fetch metadata for appid %s: %s", appid, e)
            return None

    if not app_data or not app_data.get("success"):
        return None

    details = app_data.get("data", {})
    genres_list = details.get("genres", [])
    genre_names = ", ".join(g.get("description", "") for g in genres_list)

    screenshots = []
    for ss in details.get("screenshots", []):
        screenshots.append({
            "thumbnail": ss.get("path_thumbnail", ""),
            "full": ss.get("path_full", ""),
        })

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

    # Price: fetch USD and convert to IDR
    price_overview = details.get("price_overview")
    original_price = None
    if price_overview:
        initial_cents = price_overview.get("initial")
        if initial_cents:
            usd_price = initial_cents / 100
            original_price = round(usd_price * 17000)

    # Release date: best-effort parse. Steam returns various formats, e.g.
    # "Apr 28, 2026", "April 28, 2026", "28 Apr, 2026", "2026", or "Q3 2026"
    # for unreleased games. We skip what we can't parse cleanly.
    release_date = None
    rd = details.get("release_date") or {}
    rd_str = (rd.get("date") or "").strip()
    if rd_str and not rd.get("coming_soon"):
        for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b, %Y", "%d %B, %Y", "%Y"):
            try:
                release_date = datetime.strptime(rd_str, fmt).date()
                break
            except ValueError:
                continue

    return {
        "description": details.get("short_description", ""),
        "header_image": details.get("header_image", ""),
        "genres": genre_names,
        "screenshots": screenshots,
        "movies": movies,
        "original_price": original_price,
        "release_date": release_date,
    }


def _sync_account_games(account: SteamAccount, progress=None) -> dict:
    """
    Sync games for a single SteamAccount.
    Returns a summary dict with counts.

    If `progress` (a JobProgress) is supplied:
      - total is set to the number of owned games once known
      - processed is bumped after each game so the UI shows live progress
      - progress.cancelled is checked between games for prompt cancellation
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

    # Pull in Steam Families library-shared games. Failures here degrade
    # gracefully (shared_ok=False), so a flaky family API never blocks the
    # sync — but it does suppress shared-link pruning so we never nuke
    # valid links because of a transient outage.
    shared_games, shared_ok = fetch_family_shared_games(token, steam_id)

    # Merge: owned wins on duplicates (we never want a direct-owned link to
    # be re-tagged as shared). `is_shared` per entry tells the loop whether
    # to mark a fresh GameAccount as shared, and whether to upgrade an
    # existing shared link when the same appid now appears as owned.
    owned_appids = {g["appid"] for g in games}
    shared_appids = {g["appid"] for g in shared_games if g["appid"] not in owned_appids}
    combined: list[dict] = [{**g, "is_shared": False} for g in games]
    for g in shared_games:
        if g["appid"] in owned_appids:
            continue
        combined.append({**g, "is_shared": True})

    new_games = 0
    new_links = 0
    new_shared_links = 0
    upgraded_links = 0
    removed_owned_links = 0
    removed_shared_links = 0
    revoked_assignments = 0
    cancelled = False

    if progress is not None:
        progress.reset_total(len(combined))

    for i, g in enumerate(combined):
        if progress is not None and progress.cancelled:
            cancelled = True
            break

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
                if metadata.get("original_price"):
                    game.original_price = metadata["original_price"]
                if metadata.get("release_date"):
                    game.release_date = metadata["release_date"]
        else:
            # Update name/icon if changed
            if game.name != g["name"]:
                game.name = g["name"]
            if g.get("icon") and game.icon != g["icon"]:
                game.icon = g["icon"]

            # Backfill metadata only if completely missing (no screenshots at all)
            # Don't backfill original_price here — use Refresh Metadata instead
            if not game.screenshots and not game.description:
                metadata = _fetch_game_metadata(g["appid"])
                if metadata:
                    game.description = metadata.get("description") or game.description
                    game.header_image = metadata.get("header_image") or game.header_image
                    game.genres = metadata.get("genres") or game.genres
                    game.screenshots = metadata.get("screenshots") or game.screenshots
                    game.movies = metadata.get("movies") or game.movies
                    if metadata.get("original_price"):
                        game.original_price = metadata["original_price"]
                    if metadata.get("release_date"):
                        game.release_date = metadata["release_date"]

        # Upsert GameAccount link
        existing_link = GameAccount.query.filter_by(
            game_id=game.id, steam_account_id=account.id
        ).first()
        if not existing_link:
            link = GameAccount(
                game_id=game.id,
                steam_account_id=account.id,
                is_shared=g["is_shared"],
            )
            db.session.add(link)
            if g["is_shared"]:
                new_shared_links += 1
            else:
                new_links += 1
        else:
            # Upgrade a previously-shared link when the same appid now
            # appears in this account's owned games. Never downgrade an
            # owned link to shared.
            if existing_link.is_shared and not g["is_shared"]:
                existing_link.is_shared = False
                upgraded_links += 1

        if progress is not None:
            progress.processed = i + 1

    # ── Prune stale GameAccount links ───────────────────────────────────
    # Without pruning, a game that disappears from this account's library
    # (e.g. family share revoked because the source account was disabled)
    # leaves a ghost link in the DB. Round-robin keeps handing out the
    # account to new customers, who then log in and discover the game is
    # gone. We prune carefully:
    #
    # - SHARED links: only prune when the family API call succeeded
    #   (shared_ok=True). On failure we'd see an empty list and would
    #   nuke every valid shared link.
    # - OWNED links: only prune when the owned-games API returned a
    #   non-empty list. A banned/throttled account can momentarily
    #   return zero owned games; never use that as a signal to delete.
    # - When a link is pruned, also revoke any active customer
    #   assignments to (account, game) so the customer sees they've
    #   lost access instead of getting credentials to a library that
    #   no longer contains the game. Admin can re-fulfill via the
    #   existing /retry-fulfill endpoints once another account picks
    #   up the slack.
    if not cancelled:
        prune_owned = len(games) > 0  # only when we got real owned data back
        prune_shared = shared_ok
        if prune_owned or prune_shared:
            existing_links = (
                db.session.query(GameAccount, Game.appid)
                .join(Game, GameAccount.game_id == Game.id)
                .filter(GameAccount.steam_account_id == account.id)
                .all()
            )
            for link, link_appid in existing_links:
                if link.is_shared:
                    if not prune_shared:
                        continue
                    if link_appid in shared_appids or link_appid in owned_appids:
                        continue
                    removed_shared_links += 1
                else:
                    if not prune_owned:
                        continue
                    if link_appid in owned_appids:
                        continue
                    removed_owned_links += 1

                # Revoke active assignments for (this account, this game)
                # before removing the link so customer-facing queries
                # immediately stop returning the dead pairing.
                affected = Assignment.query.filter(
                    Assignment.steam_account_id == account.id,
                    Assignment.game_id == link.game_id,
                    Assignment.is_revoked == False,  # noqa: E712
                ).all()
                for a in affected:
                    a.is_revoked = True
                    a.revoked_at = datetime.now(timezone.utc)
                    if a.order is not None:
                        a.order.assignment_id = None
                    revoked_assignments += 1

                db.session.delete(link)

    db.session.commit()

    return {
        "account_name": account.account_name,
        "success": True,
        "total_games": len(combined),
        "owned_games": len(games),
        "shared_games": len(shared_games),
        "shared_api_ok": shared_ok,
        "new_games": new_games,
        "new_links": new_links,
        "new_shared_links": new_shared_links,
        "upgraded_links": upgraded_links,
        "removed_owned_links": removed_owned_links,
        "removed_shared_links": removed_shared_links,
        "revoked_assignments": revoked_assignments,
        "cancelled": cancelled,
    }


@admin_bp.route("/accounts/sync-games", methods=["POST"])
@admin_required
def sync_all_games():
    """Fetch games from ALL active accounts in background."""
    accounts = SteamAccount.query.filter_by(is_active=True).all()
    if not accounts:
        return jsonify({"error": "No active accounts to sync"}), 404

    account_ids = [a.id for a in accounts]
    from flask import current_app
    app = current_app._get_current_object()

    job = start_job("sync_games", _bg_sync_games, args=(app, account_ids), total=len(account_ids))
    if not job:
        return jsonify({"error": "A job is already running", "job": get_current_job()}), 409

    return jsonify({"message": "Sync started in background", "job": job}), 202


def _bg_sync_games(job, app, account_ids):
    """Background: sync games for all accounts."""
    with app.app_context():
        results = []
        for i, account_id in enumerate(account_ids):
            if job.cancelled:
                success_count = sum(1 for r in results if r.get("success"))
                job.message = f"Cancelled at {i}/{len(account_ids)} (synced {success_count} accounts)"
                return
            account = db.session.get(SteamAccount, account_id)
            if account:
                result = _sync_account_games(account)
                results.append(result)
            job.processed = i + 1

        success_count = sum(1 for r in results if r.get("success"))
        job.message = f"Synced {success_count}/{len(account_ids)} accounts"


@admin_bp.route("/accounts/logout-all-bulk", methods=["POST"])
@admin_required
def logout_all_bulk():
    """Kick every session on every active account, in the background."""
    accounts = SteamAccount.query.filter_by(is_active=True).all()
    if not accounts:
        return jsonify({"error": "No active accounts to logout"}), 404

    account_ids = [a.id for a in accounts]
    from flask import current_app
    app = current_app._get_current_object()

    job = start_job(
        "logout_all_bulk",
        _bg_logout_all_bulk,
        args=(app, account_ids),
        total=len(account_ids),
    )
    if not job:
        return jsonify({"error": "A job is already running", "job": get_current_job()}), 409

    return jsonify({"message": "Bulk logout started in background", "job": job}), 202


def _bg_logout_all_bulk(job, app, account_ids):
    """Background: logout all devices across all active accounts."""
    with app.app_context():
        ok_accounts = 0
        total_devices = 0
        failures: list[str] = []

        for i, account_id in enumerate(account_ids):
            if job.cancelled:
                msg = f"Cancelled at {i}/{len(account_ids)} ({ok_accounts} done, {total_devices} devices kicked)"
                if failures:
                    msg += f" — {len(failures)} failures"
                job.message = msg
                return
            account = db.session.get(SteamAccount, account_id)
            if not account:
                job.processed = i + 1
                continue

            try:
                mafile = account.mafile_data.copy()
                result = logout_all_devices(mafile, account.password)

                # Persist updated tokens regardless of partial success. Unconditional
                # assign is intentional: shallow copy means nested Session dict is
                # shared, so `mafile != account.mafile_data` is unreliable after the
                # service mutates it. Same rationale as admin_logout_all_devices.
                account.mafile_data = mafile
                account.steam_id = mafile.get("Session", {}).get("SteamID", account.steam_id)
                db.session.add(account)
                db.session.commit()

                if result.get("error"):
                    failures.append(f"{account.account_name}: {result['error']}")
                else:
                    ok_accounts += 1
                    total_devices += result.get("revoked_count", 0)
            except Exception as e:
                logger.exception("Bulk logout failed for account %s", account_id)
                failures.append(f"account_id={account_id}: {e}")

            job.processed = i + 1
            time.sleep(1.0)  # pace between accounts to avoid Steam rate limits

        msg = f"Logged out {ok_accounts}/{len(account_ids)} accounts, kicked {total_devices} devices"
        if failures:
            msg += f" ({len(failures)} failed)"
        job.message = msg


@admin_bp.route("/accounts/<int:account_id>/sync", methods=["POST"])
@admin_required
def sync_single_account(account_id: int):
    """Sync games for a single account in the background.

    Used to be synchronous, but for accounts with many new games each game
    triggers a Steam Store metadata fetch (rate-limited 1.5s+, plus 30s on
    429). Total request time can exceed Cloudflare's 100-second timeout,
    surfacing as a 502 Bad Gateway to the user. Now we kick off a job and
    let the frontend poll /jobs/current — same pattern as the bulk sync.
    """
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    from flask import current_app
    app = current_app._get_current_object()

    job = start_job(
        "sync_account",
        _bg_sync_single_account,
        args=(app, account_id),
        total=1,
    )
    if not job:
        return jsonify({"error": "A job is already running", "job": get_current_job()}), 409

    return jsonify({"message": "Sync started in background", "job": job}), 202


def _bg_sync_single_account(job, app, account_id):
    """Background: sync games for a single account."""
    with app.app_context():
        account = db.session.get(SteamAccount, account_id)
        if not account:
            job.message = "Account not found"
            job.processed = 1
            return

        result = _sync_account_games(account, progress=job)
        if result.get("success"):
            if result.get("cancelled"):
                job.message = (
                    f"Cancelled while syncing {result.get('account_name')}: "
                    f"{job.processed}/{result.get('total_games', 0)} games processed"
                )
            else:
                shared = result.get("shared_games", 0)
                shared_part = f", {shared} shared" if shared else ""
                job.message = (
                    f"Synced {result.get('account_name')}: "
                    f"{result.get('owned_games', 0)} owned{shared_part} "
                    f"({result.get('new_games', 0)} new)"
                )
        else:
            job.message = (
                f"Sync failed for {result.get('account_name', account_id)}: "
                f"{result.get('error', 'unknown error')}"
            )


@admin_bp.route("/games/refresh-metadata", methods=["POST"])
@admin_required
def refresh_game_metadata():
    """Re-fetch metadata from Steam in background."""
    scope = request.args.get("scope", "missing").strip()

    if scope == "all":
        game_ids = [g.id for g in Game.query.all()]
    else:
        game_ids = [
            g.id for g in Game.query.filter(
                db.or_(
                    Game.original_price.is_(None),
                    Game.screenshots.is_(None),
                    Game.description.is_(None),
                    Game.release_date.is_(None),
                )
            ).all()
        ]

    if not game_ids:
        return jsonify({"message": "All games already have metadata"}), 200

    from flask import current_app
    app = current_app._get_current_object()

    job = start_job("refresh_metadata", _bg_refresh_metadata, args=(app, game_ids), total=len(game_ids))
    if not job:
        return jsonify({"error": "A job is already running", "job": get_current_job()}), 409

    return jsonify({"message": f"Refreshing metadata for {len(game_ids)} games in background", "job": job}), 202


_REFRESH_METADATA_WORKERS = 4


def _bg_refresh_metadata(job, app, game_ids):
    """Background: refresh metadata for games in parallel.

    HTTP fetches run in a small thread pool (4 workers) sharing the global
    Steam API rate-limiter, so wall-clock time scales with network latency
    rather than with len(game_ids) × per-call gap. DB writes still happen
    on this main thread (SQLAlchemy session is not thread-safe), batched
    in commits every 20 applied results.
    """
    with app.app_context():
        # Look up games up-front so workers only need the appid (no DB access
        # from worker threads). Maintains a stable id↔appid mapping.
        games_by_id: dict[int, Game] = {}
        for chunk_start in range(0, len(game_ids), 200):
            chunk = game_ids[chunk_start:chunk_start + 200]
            for g in Game.query.filter(Game.id.in_(chunk)).all():
                games_by_id[g.id] = g

        ordered_games = [games_by_id[gid] for gid in game_ids if gid in games_by_id]
        if not ordered_games:
            job.message = "No games to refresh"
            return

        updated = 0
        applied = 0
        executor = ThreadPoolExecutor(max_workers=_REFRESH_METADATA_WORKERS)
        try:
            future_to_game = {
                executor.submit(_fetch_game_metadata, game.appid): game
                for game in ordered_games
            }
            try:
                for future in as_completed(future_to_game):
                    if job.cancelled:
                        # Stop scheduling new work; running ones finish naturally.
                        for f in future_to_game:
                            if not f.done():
                                f.cancel()
                        break

                    game = future_to_game[future]
                    try:
                        metadata = future.result()
                    except Exception as e:  # noqa: BLE001
                        logger.warning("Metadata fetch failed for appid %s: %s", game.appid, e)
                        metadata = None

                    if metadata:
                        game.description = metadata.get("description") or game.description
                        game.header_image = metadata.get("header_image") or game.header_image
                        game.genres = metadata.get("genres") or game.genres
                        game.screenshots = metadata.get("screenshots") or game.screenshots
                        game.movies = metadata.get("movies") or game.movies
                        if metadata.get("original_price") is not None:
                            game.original_price = metadata["original_price"]
                        if metadata.get("release_date"):
                            game.release_date = metadata["release_date"]
                        updated += 1

                    applied += 1
                    job.processed = applied

                    # Commit every 20 games to bound transaction size and
                    # surface partial progress to other readers.
                    if applied % 20 == 0:
                        db.session.commit()
            finally:
                # Don't block shutdown on cancelled futures; they return None.
                executor.shutdown(wait=not job.cancelled)
        finally:
            db.session.commit()

        if job.cancelled:
            job.message = f"Cancelled at {applied}/{len(ordered_games)} (refreshed {updated} games)"
        else:
            job.message = f"Refreshed {updated}/{len(ordered_games)} games"


# ---------------------------------------------------------------------------
# Job status
# ---------------------------------------------------------------------------


@admin_bp.route("/jobs/current", methods=["GET"])
@admin_required
def current_job_status():
    """Get status of the current background job."""
    job = get_current_job()
    if not job:
        return jsonify({"job": None}), 200
    return jsonify({"job": job}), 200


@admin_bp.route("/jobs/cancel", methods=["POST"])
@admin_required
def cancel_current_job():
    """Request cancellation of the running job. The worker checks the flag
    between iterations, so cancellation takes effect at the next safe point
    (could be a few seconds if mid-fetch)."""
    if not request_cancel():
        return jsonify({"error": "No running job to cancel"}), 404
    return jsonify({"message": "Cancellation requested. Job will stop shortly."}), 202


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
                "is_shared": bool(link.is_shared),
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
    """Code request log with optional filters + text search.

    Query params:
        page, per_page (max 200) — pagination
        user_id, steam_account_id — exact match by ID (existing behaviour)
        email — substring match on User.email (case-insensitive)
        account — substring match on SteamAccount.account_name (CI)
        game — substring match on Game.name OR Game.custom_name (CI)
    """
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

    email_q = (request.args.get("email") or "").strip()
    if email_q:
        query = query.join(User, CodeRequestLog.user_id == User.id).filter(
            User.email.ilike(f"%{email_q}%")
        )

    account_q = (request.args.get("account") or "").strip()
    if account_q:
        query = query.join(
            SteamAccount, CodeRequestLog.steam_account_id == SteamAccount.id
        ).filter(SteamAccount.account_name.ilike(f"%{account_q}%"))

    game_q = (request.args.get("game") or "").strip()
    if game_q:
        # Game lookup goes through Assignment. Match against the Steam name
        # OR the admin's custom_name override so admins can search by what
        # they actually call the game internally.
        like = f"%{game_q}%"
        query = (
            query.join(Assignment, CodeRequestLog.assignment_id == Assignment.id)
            .join(Game, Assignment.game_id == Game.id)
            .filter(db.or_(Game.name.ilike(like), Game.custom_name.ilike(like)))
        )

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
            (entry.assignment.game.custom_name or entry.assignment.game.name)
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
        sd = sub.to_dict(include_snap_token=True)
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
    from app.store.routes import _maybe_award_referrer, _send_subscription_welcome
    _maybe_award_referrer(sub, is_subscription=True)
    db.session.commit()
    _send_subscription_welcome(sub)

    return jsonify({
        "message": "Subscription payment confirmed and activated",
        "subscription": sub.to_dict(include_snap_token=True),
    }), 200


@admin_bp.route("/subscriptions/<int:sub_id>/revoke", methods=["POST"])
@admin_required
def revoke_subscription(sub_id: int):
    """Cancel a subscription. Use case: admin misclicked confirm or needs to
    reverse a wrongly-activated subscription. Sets status='cancelled' and
    forces expires_at=now so Subscription.is_active flips to False
    immediately. Refunds (if any) are handled out-of-band by the admin.
    """
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404

    if sub.status not in ("active", "pending_payment"):
        return jsonify({
            "error": f"Subscription status '{sub.status}' tidak bisa di-revoke",
        }), 400

    sub.status = "cancelled"
    sub.expires_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({
        "message": "Subscription dibatalkan",
        "subscription": sub.to_dict(include_snap_token=True),
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
    from app.store.routes import _send_subscription_welcome
    _send_subscription_welcome(sub)

    return jsonify({
        "message": f"Lifetime access granted to {target.email}",
        "subscription": sub.to_dict(include_snap_token=True),
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
        # Payment is confirmed but no Steam account is currently available.
        # Keep the order as pending_payment so the admin can retry later via
        # the retry-fulfill endpoint — marking it fulfilled here would leave
        # the user staring at "N/A" on /play/<id>.
        db.session.rollback()
        return jsonify({"error": "No accounts available for this game. Retry once an account is free."}), 503

    return jsonify({
        "message": "Payment confirmed and order fulfilled",
        "order": order.to_dict(include_credentials=True),
    }), 200


@admin_bp.route("/orders/<int:order_id>/retry-fulfill", methods=["POST"])
@admin_required
def retry_fulfill_order(order_id: int):
    """Retry assignment for an order stuck in a fulfilled-but-unassigned state.

    Heals zombie orders created before the no-accounts-available guard was
    added, or orders fulfilled via the Midtrans webhook when no Steam account
    was free. Safe to call on any order that's missing an active assignment.
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    if order.assignment and not order.assignment.is_revoked:
        return jsonify({"error": "Order already has an active assignment"}), 409

    from app.store.routes import _fulfill_order
    success = _fulfill_order(order)
    if not success:
        return jsonify({"error": "No accounts available for this game"}), 503

    return jsonify({
        "message": "Order re-fulfilled",
        "order": order.to_dict(include_credentials=True),
    }), 200


@admin_bp.route("/orders/retry-fulfill-all", methods=["POST"])
@admin_required
def retry_fulfill_all_orders():
    """Bulk-heal every fulfilled order that has no active assignment.

    Iterates all status='fulfilled' orders whose assignment is missing or
    revoked and retries _fulfill_order on each. Returns per-order results
    so the admin can see what healed vs. what still needs accounts added.
    """
    from app.store.routes import _fulfill_order

    # Only zombies — fulfilled orders with no assignment at all. Intentionally
    # excludes orders whose assignment is revoked, since admin revocations
    # shouldn't be undone by a bulk heal.
    candidates = (
        Order.query.filter(
            Order.status == "fulfilled",
            Order.assignment_id.is_(None),
        )
        .all()
    )

    healed = []
    failed = []
    for order in candidates:
        try:
            success = _fulfill_order(order)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Retry-fulfill failed for order %s", order.id)
            failed.append({"order_id": order.id, "reason": str(exc)})
            db.session.rollback()
            continue
        if success:
            healed.append(order.id)
        else:
            failed.append({"order_id": order.id, "reason": "no accounts available"})

    return jsonify({
        "message": f"Healed {len(healed)} order(s), {len(failed)} still need accounts",
        "healed": healed,
        "failed": failed,
        "scanned": len(candidates),
    }), 200


@admin_bp.route("/orders/<int:order_id>/candidate-accounts", methods=["GET"])
@admin_required
def order_candidate_accounts(order_id: int):
    """List the active Steam accounts that own this order's game.

    Used by the admin "Rotate Account" flow when a customer hits a
    Denuvo activation cap (or any other reason to swap the same order
    onto a different account that owns the same game). The frontend
    shows this list so the admin can see usage proxy info before
    picking a target.
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if not order.game_id:
        return jsonify({"error": "Order has no associated game"}), 400

    current_account_id = (
        order.assignment.steam_account_id
        if order.assignment and not order.assignment.is_revoked
        else None
    )

    candidates = (
        SteamAccount.query.join(GameAccount, GameAccount.steam_account_id == SteamAccount.id)
        .filter(
            GameAccount.game_id == order.game_id,
            SteamAccount.is_active == True,  # noqa: E712
        )
        .order_by(SteamAccount.account_name.asc())
        .all()
    )

    items = []
    for acc in candidates:
        # active_assignment_count is a Denuvo-style proxy: how many distinct
        # users (excluding this order's user) currently hold an active
        # assignment to this (account, game) pair. Higher = more likely to
        # have burned an activation slot. Admin uses this to bias toward
        # less-used accounts.
        active_count = (
            Assignment.query.filter(
                Assignment.steam_account_id == acc.id,
                Assignment.game_id == order.game_id,
                Assignment.is_revoked == False,  # noqa: E712
                Assignment.user_id != order.user_id,
            )
            .count()
        )
        link = (
            GameAccount.query.filter_by(
                game_id=order.game_id, steam_account_id=acc.id
            )
            .first()
        )
        items.append({
            "id": acc.id,
            "account_name": acc.account_name,
            "steam_id": acc.steam_id,
            "is_shared": bool(link.is_shared) if link else False,
            "active_assignment_count": active_count,
            "is_current": acc.id == current_account_id,
        })

    return jsonify({
        "order_id": order_id,
        "game_id": order.game_id,
        "current_account_id": current_account_id,
        "candidates": items,
    }), 200


@admin_bp.route("/orders/<int:order_id>/reassign", methods=["POST"])
@admin_required
def reassign_order(order_id: int):
    """Manually swap an order onto a specific Steam account.

    Body: { steam_account_id: int }

    Use case: customer hits a Denuvo activation limit on the assigned
    account; admin swaps them to another account that owns the same
    game and still has activation slots. Differs from the existing
    /retry-fulfill (auto round-robin) by letting the admin pick the
    target explicitly.

    Behaviour:
        - Revokes the current assignment (if any) — durable history
          for audit, same shape as account-deactivation flow.
        - Creates a new Assignment to the target account.
        - Sets order.status='fulfilled' if it wasn't already, so the
          customer sees credentials again. Works for unassigned-fulfilled
          orders too (those have status='fulfilled' but no assignment).
    """
    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    data = request.get_json(silent=True) or {}
    target_id = data.get("steam_account_id")
    if not isinstance(target_id, int):
        return jsonify({"error": "steam_account_id (int) is required"}), 400

    target = db.session.get(SteamAccount, target_id)
    if not target:
        return jsonify({"error": "Target account not found"}), 404
    if not target.is_active:
        return jsonify({"error": "Target account is inactive"}), 400

    # Target must own the game (direct or via family share — round-robin
    # already supports both via GameAccount).
    owns_game = (
        GameAccount.query.filter_by(
            steam_account_id=target.id, game_id=order.game_id
        ).first()
        is not None
    )
    if not owns_game:
        return jsonify({
            "error": f"Account '{target.account_name}' does not own this game"
        }), 400

    # Revoke current assignment (if any). We don't touch order.status —
    # we'll set it to 'fulfilled' below regardless.
    current = (
        Assignment.query.filter_by(id=order.assignment_id).first()
        if order.assignment_id
        else None
    )
    if current and not current.is_revoked:
        if current.steam_account_id == target.id:
            return jsonify({
                "error": "Order is already assigned to this account"
            }), 409
        current.is_revoked = True
        current.revoked_at = datetime.now(timezone.utc)

    # Create new assignment
    new_assignment = Assignment(
        order_id=order.id,
        user_id=order.user_id,
        steam_account_id=target.id,
        game_id=order.game_id,
    )
    db.session.add(new_assignment)
    db.session.flush()

    order.assignment_id = new_assignment.id
    if order.status != "fulfilled":
        order.status = "fulfilled"
    db.session.commit()

    logger.info(
        "Order %s reassigned by admin %s: account %s -> %s",
        order.id,
        get_jwt_identity(),
        current.steam_account_id if current else None,
        target.id,
    )

    return jsonify({
        "message": (
            f"Order reassigned to '{target.account_name}'. "
            "Customer will see new credentials on next page load."
        ),
        "order": order.to_dict(include_credentials=True),
    }), 200


# ---------------------------------------------------------------------------
# Account Flags (user-reported issues)
# ---------------------------------------------------------------------------


@admin_bp.route("/account-flags", methods=["GET"])
@admin_required
def list_account_flags():
    """List user-reported account issues. Filter via ?status=new|resolved|all."""
    status = (request.args.get("status") or "new").lower()
    query = AccountFlag.query
    if status in ("new", "resolved"):
        query = query.filter(AccountFlag.status == status)
    flags = query.order_by(AccountFlag.created_at.desc()).all()
    counts = {
        "new": AccountFlag.query.filter_by(status="new").count(),
        "resolved": AccountFlag.query.filter_by(status="resolved").count(),
    }
    counts["all"] = counts["new"] + counts["resolved"]
    return jsonify({
        "flags": [f.to_dict(include_admin_fields=True) for f in flags],
        "counts": counts,
    }), 200


@admin_bp.route("/account-flags/<int:flag_id>/resolve", methods=["POST"])
@admin_required
def resolve_account_flag(flag_id: int):
    """Mark a flag as resolved. Optional body: { resolution_note: str }"""
    flag = db.session.get(AccountFlag, flag_id)
    if not flag:
        return jsonify({"error": "Flag not found"}), 404
    if flag.status == "resolved":
        return jsonify({"error": "Flag already resolved"}), 409

    data = request.get_json(silent=True) or {}
    note = (data.get("resolution_note") or "").strip() or None

    admin_id = int(get_jwt_identity())
    flag.status = "resolved"
    flag.resolved_at = datetime.now(timezone.utc)
    flag.resolved_by_user_id = admin_id
    flag.resolution_note = note
    db.session.commit()

    return jsonify({
        "message": "Flag marked as resolved",
        "flag": flag.to_dict(include_admin_fields=True),
    }), 200


@admin_bp.route("/account-flags/<int:flag_id>/reopen", methods=["POST"])
@admin_required
def reopen_account_flag(flag_id: int):
    """Move a resolved flag back to 'new' (admin escape hatch)."""
    flag = db.session.get(AccountFlag, flag_id)
    if not flag:
        return jsonify({"error": "Flag not found"}), 404
    if flag.status == "new":
        return jsonify({"error": "Flag already new"}), 409

    flag.status = "new"
    flag.resolved_at = None
    flag.resolved_by_user_id = None
    flag.resolution_note = None
    db.session.commit()

    return jsonify({
        "message": "Flag reopened",
        "flag": flag.to_dict(include_admin_fields=True),
    }), 200


# ---------------------------------------------------------------------------
# Promo Codes (admin CRUD)
# ---------------------------------------------------------------------------


@admin_bp.route("/promo-codes", methods=["GET"])
@admin_required
def list_promo_codes():
    """List all promo codes with usage counts."""
    codes = PromoCode.query.order_by(PromoCode.created_at.desc()).all()
    return jsonify({"promo_codes": [c.to_dict(include_usage_count=True) for c in codes]}), 200


@admin_bp.route("/promo-codes", methods=["POST"])
@admin_required
def create_promo_code():
    """Create a new promo code. Admin-only."""
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"error": "code is required"}), 400
    if PromoCode.query.filter_by(code=code).first():
        return jsonify({"error": f"Code '{code}' already exists"}), 409

    discount_type = data.get("discount_type")
    if discount_type not in ("percentage", "fixed"):
        return jsonify({"error": "discount_type must be 'percentage' or 'fixed'"}), 400

    discount_value = data.get("discount_value")
    if not isinstance(discount_value, int) or discount_value <= 0:
        return jsonify({"error": "discount_value must be a positive integer"}), 400
    if discount_type == "percentage" and discount_value > 100:
        return jsonify({"error": "percentage discount cannot exceed 100"}), 400

    expires_at = None
    if data.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return jsonify({"error": "expires_at must be ISO datetime"}), 400

    # Optional per-user assignment — when set, only that user can redeem.
    assigned_user_id = data.get("assigned_user_id")
    if assigned_user_id is not None:
        target = db.session.get(User, int(assigned_user_id))
        if not target:
            return jsonify({"error": "assigned user not found"}), 404
        assigned_user_id = target.id

    current_user_id = int(get_jwt_identity())
    promo = PromoCode(
        code=code,
        description=data.get("description") or None,
        discount_type=discount_type,
        discount_value=discount_value,
        scope=data.get("scope") or "all",
        min_order_amount=int(data.get("min_order_amount") or 0),
        max_uses_total=data.get("max_uses_total"),
        max_uses_per_user=int(data.get("max_uses_per_user") or 1),
        expires_at=expires_at,
        is_active=bool(data.get("is_active", True)),
        assigned_user_id=assigned_user_id,
        created_by_user_id=current_user_id,
    )
    db.session.add(promo)
    db.session.commit()
    return jsonify({"message": "Promo code created", "promo_code": promo.to_dict(include_usage_count=True)}), 201


@admin_bp.route("/promo-codes/<int:promo_id>", methods=["PUT"])
@admin_required
def update_promo_code(promo_id: int):
    promo = db.session.get(PromoCode, promo_id)
    if not promo:
        return jsonify({"error": "Promo code not found"}), 404
    data = request.get_json() or {}

    if "description" in data:
        promo.description = data["description"] or None
    if "scope" in data:
        promo.scope = data["scope"]
    if "min_order_amount" in data:
        promo.min_order_amount = int(data["min_order_amount"])
    if "max_uses_total" in data:
        promo.max_uses_total = data["max_uses_total"]
    if "max_uses_per_user" in data:
        promo.max_uses_per_user = int(data["max_uses_per_user"])
    if "expires_at" in data:
        if data["expires_at"]:
            try:
                promo.expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                return jsonify({"error": "expires_at must be ISO datetime"}), 400
        else:
            promo.expires_at = None
    if "is_active" in data:
        promo.is_active = bool(data["is_active"])
    if "assigned_user_id" in data:
        if data["assigned_user_id"] is None:
            promo.assigned_user_id = None
        else:
            target = db.session.get(User, int(data["assigned_user_id"]))
            if not target:
                return jsonify({"error": "assigned user not found"}), 404
            promo.assigned_user_id = target.id
    # code/discount_type/discount_value intentionally NOT editable after creation
    # (preserves usage-log accuracy; admin should deactivate + create new instead)

    db.session.commit()
    return jsonify({"message": "Promo code updated", "promo_code": promo.to_dict(include_usage_count=True)}), 200


@admin_bp.route("/promo-codes/<int:promo_id>", methods=["DELETE"])
@admin_required
def delete_promo_code(promo_id: int):
    promo = db.session.get(PromoCode, promo_id)
    if not promo:
        return jsonify({"error": "Promo code not found"}), 404
    if promo.usages.count() > 0:
        return jsonify({"error": "Cannot delete a promo code that has been used. Deactivate it instead."}), 409
    db.session.delete(promo)
    db.session.commit()
    return jsonify({"message": "Promo code deleted"}), 200


@admin_bp.route("/promo-codes/<int:promo_id>/usages", methods=["GET"])
@admin_required
def list_promo_code_usages(promo_id: int):
    promo = db.session.get(PromoCode, promo_id)
    if not promo:
        return jsonify({"error": "Promo code not found"}), 404
    usages = promo.usages.order_by(PromoCodeUsage.used_at.desc()).all()
    result = []
    for u in usages:
        ud = u.to_dict()
        ud["user_email"] = u.user.email if u.user else None
        result.append(ud)
    return jsonify({"usages": result, "total_discount": sum(u.discount_amount for u in usages)}), 200


# ---------------------------------------------------------------------------
# Referrals (admin view)
# ---------------------------------------------------------------------------


@admin_bp.route("/referrals", methods=["GET"])
@admin_required
def list_referrals():
    """List all referral rewards with user info."""
    rewards = ReferralReward.query.order_by(ReferralReward.awarded_at.desc()).all()
    result = []
    total_credit = 0
    for r in rewards:
        referrer = db.session.get(User, r.referrer_user_id)
        referee = db.session.get(User, r.referee_user_id)
        total_credit += r.credit_awarded
        result.append({
            **r.to_dict(),
            "referrer_email": referrer.email if referrer else None,
            "referee_email": referee.email if referee else None,
        })
    return jsonify({
        "referrals": result,
        "total_credit_awarded": total_credit,
        "total_count": len(result),
    }), 200


# ---------------------------------------------------------------------------
# Reports — unified transaction listing + summary + CSV export
# ---------------------------------------------------------------------------


# Indonesia is UTC+7 year-round (no DST). Using a fixed offset avoids pulling
# in zoneinfo / pytz and keeps date math predictable.
_JAKARTA_TZ = timezone(timedelta(hours=7))


def _resolve_report_range(preset: str | None, from_str: str | None, to_str: str | None):
    """Return (start_utc, end_utc, label) for the requested range.

    Date inputs are interpreted as Asia/Jakarta calendar dates, then converted
    to UTC half-open ranges [start, end) suitable for `paid_at` filtering.
    Falls back to "today" if inputs are missing or invalid.
    """
    now_jakarta = datetime.now(_JAKARTA_TZ)
    today_jakarta = now_jakarta.replace(hour=0, minute=0, second=0, microsecond=0)

    preset = (preset or "").lower()

    if preset == "7d":
        end_jakarta = today_jakarta + timedelta(days=1)
        start_jakarta = end_jakarta - timedelta(days=7)
        label = "7 hari terakhir"
    elif preset == "30d":
        end_jakarta = today_jakarta + timedelta(days=1)
        start_jakarta = end_jakarta - timedelta(days=30)
        label = "30 hari terakhir"
    elif preset == "custom" and from_str and to_str:
        try:
            start_jakarta = datetime.strptime(from_str, "%Y-%m-%d").replace(tzinfo=_JAKARTA_TZ)
            end_jakarta = datetime.strptime(to_str, "%Y-%m-%d").replace(tzinfo=_JAKARTA_TZ) + timedelta(days=1)
            label = f"{from_str} – {to_str}"
        except ValueError:
            start_jakarta = today_jakarta
            end_jakarta = today_jakarta + timedelta(days=1)
            label = "Hari ini"
    else:
        # default + 'today'
        start_jakarta = today_jakarta
        end_jakarta = today_jakarta + timedelta(days=1)
        label = "Hari ini"

    return start_jakarta.astimezone(timezone.utc), end_jakarta.astimezone(timezone.utc), label


def _format_order_txn(order: Order, promo_by_id: dict[int, str]) -> dict:
    game_name = (
        (order.game.custom_name or order.game.name)
        if order.game else "(game dihapus)"
    )
    return {
        "id": f"ord-{order.id}",
        "raw_id": order.id,
        "type": "order",
        "type_label": "Pembelian Game",
        "detail": game_name,
        "user_email": order.user.email if order.user else None,
        "amount_subtotal": order.amount_subtotal or order.amount or 0,
        "promo_code": promo_by_id.get(order.promo_code_id) if order.promo_code_id else None,
        "promo_discount": order.promo_discount or 0,
        "credit_applied": order.credit_applied or 0,
        "amount": order.amount or 0,
        "status": order.status,
        "payment_type": order.payment_type,
        "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def _format_subscription_txn(sub: Subscription, promo_by_id: dict[int, str]) -> dict:
    plan_label = sub.PLAN_LABELS.get(sub.plan, sub.plan)
    return {
        "id": f"sub-{sub.id}",
        "raw_id": sub.id,
        "type": "subscription",
        "type_label": f"Langganan {plan_label}",
        "detail": plan_label,
        "user_email": sub.user.email if sub.user else None,
        "amount_subtotal": sub.amount_subtotal or sub.amount or 0,
        "promo_code": promo_by_id.get(sub.promo_code_id) if sub.promo_code_id else None,
        "promo_discount": sub.promo_discount or 0,
        "credit_applied": sub.credit_applied or 0,
        "amount": sub.amount or 0,
        "status": sub.status,
        "payment_type": sub.payment_type,
        "paid_at": sub.paid_at.isoformat() if sub.paid_at else None,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
    }


def _build_report(start_utc: datetime, end_utc: datetime) -> tuple[list[dict], dict]:
    """Query orders + subscriptions in [start_utc, end_utc) and shape into
    the unified transaction list + summary the report endpoint returns."""

    orders = (
        Order.query
        .filter(
            Order.paid_at.isnot(None),
            Order.paid_at >= start_utc,
            Order.paid_at < end_utc,
        )
        .all()
    )
    subs = (
        Subscription.query
        .filter(
            Subscription.paid_at.isnot(None),
            Subscription.paid_at >= start_utc,
            Subscription.paid_at < end_utc,
        )
        .all()
    )

    promo_ids = {o.promo_code_id for o in orders if o.promo_code_id}
    promo_ids.update(s.promo_code_id for s in subs if s.promo_code_id)
    promo_by_id: dict[int, str] = {}
    if promo_ids:
        for p in PromoCode.query.filter(PromoCode.id.in_(promo_ids)).all():
            promo_by_id[p.id] = p.code

    transactions = (
        [_format_order_txn(o, promo_by_id) for o in orders]
        + [_format_subscription_txn(s, promo_by_id) for s in subs]
    )
    transactions.sort(key=lambda t: t["paid_at"] or "", reverse=True)

    order_revenue = sum(o.amount or 0 for o in orders)
    sub_revenue = sum(s.amount or 0 for s in subs)
    total_revenue = order_revenue + sub_revenue
    total_promo_discount = sum(t["promo_discount"] for t in transactions)
    total_credit_used = sum(t["credit_applied"] for t in transactions)
    transactions_with_promo = sum(1 for t in transactions if t["promo_code"])

    summary = {
        "total_transactions": len(transactions),
        "order_count": len(orders),
        "subscription_count": len(subs),
        "total_revenue": total_revenue,
        "order_revenue": order_revenue,
        "subscription_revenue": sub_revenue,
        "total_promo_discount": total_promo_discount,
        "total_credit_used": total_credit_used,
        "transactions_with_promo": transactions_with_promo,
    }
    return transactions, summary


@admin_bp.route("/reports/transactions", methods=["GET"])
@admin_required
def transaction_report():
    """Unified report of paid orders + subscriptions in a date range.

    Query params:
      - preset: 'today' (default) | '7d' | '30d' | 'custom'
      - from, to: ISO YYYY-MM-DD when preset='custom' (Jakarta calendar dates)
      - format: 'json' (default) | 'csv'
    """
    preset = request.args.get("preset")
    from_str = request.args.get("from")
    to_str = request.args.get("to")
    fmt = (request.args.get("format") or "json").lower()

    start_utc, end_utc, label = _resolve_report_range(preset, from_str, to_str)
    transactions, summary = _build_report(start_utc, end_utc)

    if fmt == "csv":
        return _report_csv_response(transactions, summary, label)

    return jsonify({
        "transactions": transactions,
        "summary": summary,
        "date_range": {
            "label": label,
            "start": start_utc.isoformat(),
            "end": end_utc.isoformat(),
            "preset": (preset or "today").lower(),
            "from": from_str,
            "to": to_str,
        },
    }), 200


def _report_csv_response(transactions: list[dict], summary: dict, label: str):
    """Build a CSV download for the report. Prepends a UTF-8 BOM so Excel
    auto-detects encoding on Windows.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)

    writer.writerow([f"Laporan Transaksi Playfast — {label}"])
    writer.writerow([])
    writer.writerow(["Total Transaksi", summary["total_transactions"]])
    writer.writerow(["Jumlah Pembelian Game", summary["order_count"]])
    writer.writerow(["Jumlah Subscription", summary["subscription_count"]])
    writer.writerow(["Total Pemasukan (IDR)", summary["total_revenue"]])
    writer.writerow(["Pendapatan Pembelian Game (IDR)", summary["order_revenue"]])
    writer.writerow(["Pendapatan Subscription (IDR)", summary["subscription_revenue"]])
    writer.writerow(["Total Diskon Promo (IDR)", summary["total_promo_discount"]])
    writer.writerow(["Total Kredit Referral Dipakai (IDR)", summary["total_credit_used"]])
    writer.writerow(["Transaksi Pakai Promo", summary["transactions_with_promo"]])
    writer.writerow([])

    writer.writerow([
        "ID", "Tanggal Bayar", "Email", "Tipe", "Detail",
        "Subtotal (IDR)", "Promo Code", "Diskon Promo (IDR)",
        "Kredit Dipakai (IDR)", "Total Bayar (IDR)",
        "Status", "Metode Pembayaran",
    ])
    for t in transactions:
        writer.writerow([
            t["id"],
            t["paid_at"] or "",
            t["user_email"] or "",
            t["type_label"],
            t["detail"],
            t["amount_subtotal"],
            t["promo_code"] or "",
            t["promo_discount"],
            t["credit_applied"],
            t["amount"],
            t["status"],
            t["payment_type"] or "",
        ])

    body = "﻿" + buf.getvalue()  # UTF-8 BOM so Excel auto-detects encoding
    safe_label = label.replace(" ", "-").replace("–", "to").lower()
    response = make_response(body)
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = (
        f'attachment; filename="playfast-report-{safe_label}.csv"'
    )
    return response


# ===========================================================================
# Reviews moderation
# ===========================================================================


def _admin_save_review_images(review: Review, files, *, start_sort: int = 0) -> int:
    """Persist uploaded images for a review (admin path — same logic as user)."""
    saved = 0
    for f in files:
        if not f.filename:
            continue
        url = process_review_image(f, review.id)
        ri = ReviewImage(review_id=review.id, url=url, sort_order=start_sort + saved)
        db.session.add(ri)
        saved += 1
    return saved


def _validate_admin_review_payload(rating, body, headline) -> str | None:
    try:
        r = int(rating)
    except (TypeError, ValueError):
        return "Rating wajib angka 1-5"
    if r < 1 or r > 5:
        return "Rating harus 1-5"
    if not body or not body.strip():
        return "Body review wajib diisi"
    if len(body) > 5000:
        return "Body review terlalu panjang (max 5000 karakter)"
    if headline and len(headline) > 200:
        return "Headline terlalu panjang (max 200 karakter)"
    return None


@admin_bp.route("/reviews", methods=["GET"])
@admin_required
def admin_list_reviews():
    status = request.args.get("status", "all")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 20))))

    q = Review.query
    if status in ("pending", "approved", "rejected"):
        q = q.filter_by(status=status)

    counts = {
        "pending": Review.query.filter_by(status="pending").count(),
        "approved": Review.query.filter_by(status="approved").count(),
        "rejected": Review.query.filter_by(status="rejected").count(),
    }

    q = q.order_by(Review.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1

    return jsonify({
        "items": [serialize_review(r, admin=True) for r in items],
        "stats": counts,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    })


@admin_bp.route("/reviews/<int:review_id>/approve", methods=["POST"])
@admin_required
def admin_approve_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404
    review.status = "approved"
    review.approved_at = datetime.now(timezone.utc)
    review.moderated_by_user_id = int(get_jwt_identity())
    db.session.commit()
    return jsonify({"message": "Review disetujui.", "review": serialize_review(review, admin=True)})


@admin_bp.route("/reviews/<int:review_id>/reject", methods=["POST"])
@admin_required
def admin_reject_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404
    note = (request.get_json(silent=True) or {}).get("admin_note") or ""
    review.status = "rejected"
    review.admin_note = note.strip() or None
    review.moderated_by_user_id = int(get_jwt_identity())
    db.session.commit()
    return jsonify({"message": "Review ditolak.", "review": serialize_review(review, admin=True)})


@admin_bp.route("/reviews/<int:review_id>/feature", methods=["POST"])
@admin_required
def admin_toggle_feature(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404
    payload = request.get_json(silent=True) or {}
    review.is_featured = bool(payload.get("is_featured", not review.is_featured))
    db.session.commit()
    return jsonify({"review": serialize_review(review, admin=True)})


@admin_bp.route("/reviews", methods=["POST"])
@admin_required
def admin_create_review():
    """Admin creates a review. Two modes (hybrid):

    - **Linked**: pass user_id (existing user). Email + plan-tier auto-derive.
    - **Manual seed**: omit user_id, pass manual_email + manual_plan_label
      (e.g. for backfilling old testimonials).

    Both modes accept rating, body, headline, status (default "approved" so
    seeded reviews appear immediately), is_featured, multipart images.
    """
    rating = request.form.get("rating")
    body = (request.form.get("body") or "").strip()
    headline = (request.form.get("headline") or "").strip() or None
    err = _validate_admin_review_payload(rating, body, headline)
    if err:
        return jsonify({"error": err}), 400

    user_id_raw = request.form.get("user_id")
    manual_email = (request.form.get("manual_email") or "").strip() or None
    manual_plan_label = (request.form.get("manual_plan_label") or "").strip() or None

    user_id = None
    if user_id_raw and user_id_raw.strip():
        try:
            user_id = int(user_id_raw)
        except ValueError:
            return jsonify({"error": "user_id tidak valid"}), 400
        if not db.session.get(User, user_id):
            return jsonify({"error": "User tidak ditemukan"}), 404
        if Review.query.filter_by(user_id=user_id).first():
            return jsonify({"error": "User ini sudah punya review"}), 409
    else:
        if not manual_email and not manual_plan_label:
            return jsonify({
                "error": "Pilih user atau isi manual_email + manual_plan_label."
            }), 400

    status = request.form.get("status", "approved")
    if status not in Review.STATUS_CHOICES:
        status = "approved"
    is_featured = request.form.get("is_featured", "false").lower() in ("1", "true", "yes")

    review = Review(
        user_id=user_id,
        manual_email=None if user_id else manual_email,
        manual_plan_label=None if user_id else manual_plan_label,
        rating=int(rating),
        headline=headline,
        body=body,
        status=status,
        is_featured=is_featured,
        moderated_by_user_id=int(get_jwt_identity()),
        approved_at=datetime.now(timezone.utc) if status == "approved" else None,
    )
    db.session.add(review)
    db.session.flush()

    files = request.files.getlist("images")
    if len(files) > MAX_IMAGES_PER_REVIEW:
        db.session.rollback()
        return jsonify({"error": f"Maksimal {MAX_IMAGES_PER_REVIEW} foto."}), 400
    _admin_save_review_images(review, files)

    db.session.commit()
    return jsonify({
        "message": "Review dibuat.",
        "review": serialize_review(review, admin=True),
    }), 201


@admin_bp.route("/reviews/<int:review_id>", methods=["PATCH"])
@admin_required
def admin_edit_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404

    if "rating" in request.form:
        try:
            r = int(request.form["rating"])
            if r < 1 or r > 5:
                return jsonify({"error": "Rating harus 1-5"}), 400
            review.rating = r
        except ValueError:
            return jsonify({"error": "Rating tidak valid"}), 400
    if "body" in request.form:
        body = request.form["body"].strip()
        if not body:
            return jsonify({"error": "Body wajib diisi"}), 400
        if len(body) > 5000:
            return jsonify({"error": "Body terlalu panjang"}), 400
        review.body = body
    if "headline" in request.form:
        h = request.form["headline"].strip()
        review.headline = h or None
    if "manual_email" in request.form and review.user_id is None:
        review.manual_email = request.form["manual_email"].strip() or None
    if "manual_plan_label" in request.form and review.user_id is None:
        review.manual_plan_label = request.form["manual_plan_label"].strip() or None
    if "is_featured" in request.form:
        review.is_featured = request.form["is_featured"].lower() in ("1", "true", "yes")
    if "status" in request.form:
        s = request.form["status"]
        if s in Review.STATUS_CHOICES:
            review.status = s
            if s == "approved" and review.approved_at is None:
                review.approved_at = datetime.now(timezone.utc)

    delete_ids_raw = request.form.get("delete_image_ids", "")
    if delete_ids_raw:
        for img_id in [int(x) for x in delete_ids_raw.split(",") if x.strip().isdigit()]:
            img = db.session.get(ReviewImage, img_id)
            if img and img.review_id == review.id:
                delete_review_image_file(img.url)
                db.session.delete(img)

    files = request.files.getlist("images")
    if files:
        current_count = review.images.count()
        new_count = len([f for f in files if f.filename])
        if current_count + new_count > MAX_IMAGES_PER_REVIEW:
            return jsonify({"error": f"Total foto melebihi {MAX_IMAGES_PER_REVIEW}."}), 400
        _admin_save_review_images(review, files, start_sort=current_count)

    review.moderated_by_user_id = int(get_jwt_identity())
    review.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({"review": serialize_review(review, admin=True)})


@admin_bp.route("/reviews/<int:review_id>", methods=["DELETE"])
@admin_required
def admin_delete_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"error": "Review not found"}), 404
    for img in review.images.all():
        delete_review_image_file(img.url)
    db.session.delete(review)
    db.session.commit()
    return jsonify({"message": "Review dihapus."})


@admin_bp.route("/reviews/users-search", methods=["GET"])
@admin_required
def admin_review_user_search():
    """Search users by email substring for the 'link to user' picker."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"users": []})
    users = (
        User.query.filter(User.email.ilike(f"%{q}%"))
        .order_by(User.email)
        .limit(15)
        .all()
    )
    return jsonify({"users": [{"id": u.id, "email": u.email} for u in users]})
