"""Application factory for the Playfast backend."""

import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import text

from app.config import config_by_name
from app.extensions import db, jwt, migrate

logger = logging.getLogger(__name__)


def create_app(config_name: str | None = None) -> Flask:
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))

    # ---------- Extensions ----------
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    CORS(
        app,
        origins=[app.config["FRONTEND_URL"]],
        supports_credentials=True,
    )

    # ---------- JWT error handlers ----------
    @jwt.unauthorized_loader
    def unauthorized_callback(reason):
        return jsonify({"error": "Missing or invalid token", "detail": reason}), 401

    @jwt.expired_token_loader
    def expired_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired"}), 401

    @jwt.invalid_token_loader
    def invalid_callback(reason):
        return jsonify({"error": "Invalid token", "detail": reason}), 422

    # ---------- Generic HTTP error handlers ----------
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": e.description or "Bad request"}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(429)
    def too_many_requests(e):
        return jsonify({"error": "Too many requests"}), 429

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    # ---------- Blueprints ----------
    from app.auth.routes import auth_bp
    from app.store.routes import store_bp
    from app.admin.routes import admin_bp
    from app.game_requests.routes import (
        game_requests_bp,
        admin_game_requests_bp,
    )
    from app.email_blast.routes import (
        admin_email_blast_bp,
        unsubscribe_bp,
    )
    from app.reviews.routes import reviews_bp
    from app.creators.routes import (
        creator_applications_bp,
        admin_creator_applications_bp,
    )
    from app.webhooks.routes import webhooks_bp
    from app.redeem.routes import admin_redeem_bp, redeem_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(store_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(game_requests_bp)
    app.register_blueprint(admin_game_requests_bp)
    app.register_blueprint(admin_email_blast_bp)
    app.register_blueprint(unsubscribe_bp)
    app.register_blueprint(reviews_bp)
    app.register_blueprint(creator_applications_bp)
    app.register_blueprint(admin_creator_applications_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(admin_redeem_bp)
    app.register_blueprint(redeem_bp)

    # ---------- Serve uploaded files ----------
    from flask import send_from_directory

    uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(uploads_dir, filename)

    # ---------- Health check with DB connectivity ----------
    @app.route("/api/health")
    def health():
        db_ok = False
        try:
            db.session.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass
        status = "ok" if db_ok else "degraded"
        code = 200 if db_ok else 503
        return jsonify({
            "status": status,
            "database": "connected" if db_ok else "unreachable",
        }), code

    # ---------- Schema migrations ----------
    with app.app_context():
        _run_schema_upgrades()
        # Create site_settings table if it doesn't exist
        from app.models import SiteSetting
        SiteSetting.__table__.create(db.engine, checkfirst=True)
        # Seed initial reviews (idempotent — only runs once per environment)
        _seed_initial_reviews()

    return app


def _run_schema_upgrades():
    """Add new columns to existing tables via raw SQL.
    Each statement is wrapped in try/except so it is safe to run repeatedly
    (the ALTER TABLE will fail harmlessly if the column already exists).
    """
    alter_statements = [
        "ALTER TABLE games ADD COLUMN description TEXT",
        "ALTER TABLE games ADD COLUMN header_image VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN genres VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE",
        # Order table: Midtrans payment columns
        "ALTER TABLE orders ADD COLUMN snap_token VARCHAR(255)",
        "ALTER TABLE orders ADD COLUMN midtrans_order_id VARCHAR(100)",
        "ALTER TABLE orders ADD COLUMN payment_type VARCHAR(50)",
        "ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP",
        "ALTER TABLE orders ADD COLUMN amount INTEGER",
        # Order type column for subscription vs purchase
        "ALTER TABLE orders ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'purchase'",
        # User email verification
        "ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE",
        # Game media columns
        "ALTER TABLE games ADD COLUMN screenshots JSON",
        "ALTER TABLE games ADD COLUMN movies JSON",
        # Game original Steam price
        "ALTER TABLE games ADD COLUMN original_price INTEGER",
        # Game custom override columns
        "ALTER TABLE games ADD COLUMN custom_name VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN custom_description TEXT",
        "ALTER TABLE games ADD COLUMN custom_header_image VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN custom_screenshots JSON",
        # Promo code + referral system (2026-04-20)
        "ALTER TABLE users ADD COLUMN referral_code VARCHAR(12)",
        "ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER",
        "ALTER TABLE users ADD COLUMN referral_credit INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN amount_subtotal INTEGER",
        "ALTER TABLE orders ADD COLUMN promo_discount INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN credit_applied INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN promo_code_id INTEGER",
        "ALTER TABLE subscriptions ADD COLUMN amount_subtotal INTEGER",
        "ALTER TABLE subscriptions ADD COLUMN promo_discount INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE subscriptions ADD COLUMN credit_applied INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE subscriptions ADD COLUMN promo_code_id INTEGER",
        # Catalog sort: release_date for "newest first" ordering
        "ALTER TABLE games ADD COLUMN release_date DATE",
        "CREATE INDEX IF NOT EXISTS ix_games_release_date ON games (release_date)",
        # Per-user promo assignment
        "ALTER TABLE promo_codes ADD COLUMN assigned_user_id INTEGER",
        "CREATE INDEX IF NOT EXISTS ix_promo_codes_assigned_user_id ON promo_codes (assigned_user_id)",
        # Steam Families library sharing — flag links that come via shared
        # library (admin-only signal, customer-facing routes ignore it).
        "ALTER TABLE game_accounts ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT FALSE",
        # Email blast: per-user unsubscribe flag
        "ALTER TABLE users ADD COLUMN email_opted_out BOOLEAN NOT NULL DEFAULT FALSE",
        # Marketing: keep games visible in catalog even when account is inactive
        "ALTER TABLE steam_accounts ADD COLUMN show_in_catalog_when_disabled BOOLEAN NOT NULL DEFAULT FALSE",
        # Parental-controlled accounts: restrict sync + round-robin to a
        # specific subset of appids even though GetOwnedGames returns the
        # whole library. NULL = unrestricted (default).
        "ALTER TABLE steam_accounts ADD COLUMN allowed_appids JSON",
        # Notify game-request voters when admin marks request as added
        "ALTER TABLE game_requests ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE game_requests ADD COLUMN notified_count INTEGER NOT NULL DEFAULT 0",
        # Email blast: send to specific emails (registered users + guests)
        "ALTER TABLE email_campaigns ADD COLUMN audience_mode VARCHAR(20) NOT NULL DEFAULT 'filters'",
        "ALTER TABLE email_campaigns ADD COLUMN target_emails JSON",
        "ALTER TABLE email_campaign_recipients ALTER COLUMN user_id DROP NOT NULL",
        "ALTER TABLE email_campaign_recipients DROP CONSTRAINT IF EXISTS uq_email_campaign_recipient",
        "ALTER TABLE email_campaign_recipients ADD CONSTRAINT uq_email_campaign_recipient_email UNIQUE (campaign_id, email)",
        # Refund tracking — status moves to 'refunded' + provenance fields.
        # Amount refunded is always the original `amount` (no partial refunds
        # yet). Refund happens out-of-band; this just records the decision.
        "ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE orders ADD COLUMN refund_note TEXT",
        "ALTER TABLE orders ADD COLUMN refunded_by_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE subscriptions ADD COLUMN refunded_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE subscriptions ADD COLUMN refund_note TEXT",
        "ALTER TABLE subscriptions ADD COLUMN refunded_by_user_id INTEGER REFERENCES users(id)",
        # Tripay gateway: store the Tripay-side reference so the callback can
        # look up the order/sub by that ID. Indexed since the webhook fires
        # on the lookup path.
        "ALTER TABLE orders ADD COLUMN tripay_reference VARCHAR(100)",
        "ALTER TABLE subscriptions ADD COLUMN tripay_reference VARCHAR(100)",
        "CREATE INDEX IF NOT EXISTS ix_orders_tripay_reference ON orders (tripay_reference)",
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_tripay_reference ON subscriptions (tripay_reference)",
        # Revenue sharing / creator commission tracking on promo code usages.
        "ALTER TABLE promo_code_usages ADD COLUMN paid_to_creator_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE promo_code_usages ADD COLUMN paid_to_creator_note TEXT",
        # Shopping cart: group related orders into one payment transaction
        "ALTER TABLE orders ADD COLUMN checkout_group_id VARCHAR(40)",
        "CREATE INDEX IF NOT EXISTS ix_orders_checkout_group_id ON orders (checkout_group_id)",
        # Cart checkout creates N Orders sharing one midtrans_order_id, so
        # the unique constraint must be dropped. Replace with a plain index
        # for webhook lookups (kept under a different name to avoid clash).
        "ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_midtrans_order_id_key",
        "DROP INDEX IF EXISTS ix_orders_midtrans_order_id",
        "CREATE INDEX IF NOT EXISTS ix_orders_midtrans_order_id ON orders (midtrans_order_id)",
    ]
    for stmt in alter_statements:
        try:
            db.session.execute(text(stmt))
            db.session.commit()
        except Exception:
            db.session.rollback()

    from app.models import EmailVerificationToken, Subscription
    Subscription.__table__.create(db.engine, checkfirst=True)
    EmailVerificationToken.__table__.create(db.engine, checkfirst=True)

    from app.models import PromoCode, PromoCodeUsage, ReferralReward
    PromoCode.__table__.create(db.engine, checkfirst=True)
    PromoCodeUsage.__table__.create(db.engine, checkfirst=True)
    ReferralReward.__table__.create(db.engine, checkfirst=True)

    from app.models import AccountFlag
    AccountFlag.__table__.create(db.engine, checkfirst=True)

    from app.models import GameRequest, GameRequestVote
    GameRequest.__table__.create(db.engine, checkfirst=True)
    GameRequestVote.__table__.create(db.engine, checkfirst=True)

    from app.models import (
        EmailCampaign,
        EmailCampaignRecipient,
        EmailGuestOptOut,
        EmailUnsubscribeToken,
    )
    EmailCampaign.__table__.create(db.engine, checkfirst=True)
    EmailCampaignRecipient.__table__.create(db.engine, checkfirst=True)
    EmailUnsubscribeToken.__table__.create(db.engine, checkfirst=True)
    EmailGuestOptOut.__table__.create(db.engine, checkfirst=True)

    from app.models import Review, ReviewImage
    Review.__table__.create(db.engine, checkfirst=True)
    ReviewImage.__table__.create(db.engine, checkfirst=True)

    from app.models import CreatorApplication
    CreatorApplication.__table__.create(db.engine, checkfirst=True)

    from app.models import EmailLog
    EmailLog.__table__.create(db.engine, checkfirst=True)
    for stmt in [
        "CREATE INDEX IF NOT EXISTS ix_email_logs_user_created ON email_logs (user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_email_logs_type_status_created ON email_logs (type, status, created_at DESC)",
    ]:
        try:
            db.session.execute(text(stmt))
            db.session.commit()
        except Exception:
            db.session.rollback()

    from app.models import CartItem
    CartItem.__table__.create(db.engine, checkfirst=True)

    from app.models import RedeemCampaign, RedeemCode
    RedeemCampaign.__table__.create(db.engine, checkfirst=True)
    RedeemCode.__table__.create(db.engine, checkfirst=True)


def _seed_initial_reviews():
    """One-shot manual seed of the original "Kata Mereka" testimonials.

    Idempotent: only seeds when the reviews table is completely empty AND has
    not been previously seeded (tracked via SiteSetting flag), so re-deploys
    won't recreate or duplicate them after admins moderate or delete.
    """
    from datetime import datetime, timezone, timedelta
    from app.models import Review, SiteSetting

    flag = SiteSetting.get("reviews_seeded_v1")
    if flag == "1":
        return
    if Review.query.first() is not None:
        SiteSetting.set("reviews_seeded_v1", "1")
        db.session.commit()
        return

    seeds = [
        {
            "manual_email": "riski@gmail.com",
            "manual_plan_label": "Beli Satuan",
            "rating": 5,
            "headline": "Akses instan, beneran instan!",
            "body": (
                "Gila sih, baru bayar langsung dapat akses. Kode Steam Guard-nya "
                "instan, nggak perlu nunggu balesan seller kayak biasa. Lima menit "
                "udah bisa download game-nya. Mantap banget!"
            ),
        },
        {
            "manual_email": "dian@gmail.com",
            "manual_plan_label": "Subscriber Yearly",
            "rating": 5,
            "headline": "Worth banget buat single-player",
            "body": (
                "Harganya jauh lebih murah dibanding beli langsung di Steam. Satu "
                "game AAA cuma Rp 50-100 ribu, padahal harga aslinya bisa ratusan "
                "ribu. Worth it banget buat yang mau main game single-player."
            ),
        },
        {
            "manual_email": "fadli@gmail.com",
            "manual_plan_label": "Beli Satuan",
            "rating": 5,
            "headline": "Steam Guard-nya gampang banget",
            "body": (
                "Awalnya ragu soal kode Steam Guard, takut ribet. Ternyata gampang "
                "banget, tinggal klik generate terus copy-paste. Prosesnya smooth, "
                "nggak pernah gagal. Recommended!"
            ),
        },
    ]

    now = datetime.now(timezone.utc)
    for idx, s in enumerate(seeds):
        review = Review(
            user_id=None,
            manual_email=s["manual_email"],
            manual_plan_label=s["manual_plan_label"],
            rating=s["rating"],
            headline=s["headline"],
            body=s["body"],
            status="approved",
            is_featured=True,  # so they keep the landing-page slot
            approved_at=now - timedelta(days=30 - idx),
            created_at=now - timedelta(days=30 - idx),
        )
        db.session.add(review)
    SiteSetting.set("reviews_seeded_v1", "1")
    db.session.commit()

    # Backfill referral_code for existing users that don't have one
    from app.models import User
    import secrets, string
    users_without_code = User.query.filter_by(referral_code=None).all()
    if users_without_code:
        alphabet = string.ascii_uppercase + string.digits
        used = set(u.referral_code for u in User.query.filter(User.referral_code.isnot(None)).all())
        for u in users_without_code:
            while True:
                code = ''.join(secrets.choice(alphabet) for _ in range(6))
                if code not in used:
                    used.add(code)
                    u.referral_code = code
                    break
        db.session.commit()
