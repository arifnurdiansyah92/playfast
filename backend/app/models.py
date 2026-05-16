"""All SQLAlchemy models for the Playfast platform."""

import secrets
from datetime import datetime, timezone, timedelta

from werkzeug.security import generate_password_hash, check_password_hash

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    referral_code = db.Column(db.String(12), unique=True, nullable=True, index=True)
    referred_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    referral_credit = db.Column(db.Integer, nullable=False, default=0)
    email_opted_out = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # NOTE: Order has two FKs to users (user_id, refunded_by_user_id) since
    # the refund feature landed — disambiguate which one this relationship
    # follows. Same below for Subscription.user.
    orders = db.relationship(
        "Order", backref="user", lazy="dynamic", foreign_keys="Order.user_id"
    )
    assignments = db.relationship("Assignment", backref="user", lazy="dynamic")
    code_request_logs = db.relationship(
        "CodeRequestLog", backref="user", lazy="dynamic"
    )

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "is_admin": self.is_admin,
            "is_active": self.is_active,
            "role": "admin" if self.is_admin else "user",
            "email_verified": self.email_verified,
            "referral_code": self.referral_code,
            "referred_by_user_id": self.referred_by_user_id,
            "referral_credit": self.referral_credit,
            "created_at": self.created_at.isoformat(),
        }


class SteamAccount(db.Model):
    __tablename__ = "steam_accounts"

    id = db.Column(db.Integer, primary_key=True)
    account_name = db.Column(db.String(255), unique=True, nullable=False, index=True)
    steam_id = db.Column(db.String(64), nullable=True)
    mafile_data = db.Column(db.JSON, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    # Marketing flag: when an account is inactive but this is True, its games
    # still appear in the public catalog. Round-robin / fulfillment still
    # filter by is_active=True only — so users who actually try to play hit
    # the existing "no account assigned" path.
    show_in_catalog_when_disabled = db.Column(
        db.Boolean, default=False, nullable=False
    )
    # When set, sync + round-robin only consider the listed Steam appids
    # for this account. Use case: account is parental-controlled / Family
    # View restricted to one or a few specific titles, but Steam's
    # GetOwnedGames still returns the whole library. NULL = unrestricted
    # (default historical behaviour).
    allowed_appids = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    game_accounts = db.relationship(
        "GameAccount", backref="steam_account", lazy="dynamic", cascade="all, delete-orphan"
    )
    assignments = db.relationship(
        "Assignment", backref="steam_account", lazy="dynamic"
    )
    code_request_logs = db.relationship(
        "CodeRequestLog", backref="steam_account", lazy="dynamic"
    )

    def to_dict(self, include_password=False):
        result = {
            "id": self.id,
            "account_name": self.account_name,
            "steam_id": self.steam_id,
            "is_active": self.is_active,
            "show_in_catalog_when_disabled": self.show_in_catalog_when_disabled,
            "allowed_appids": self.allowed_appids,
            "created_at": self.created_at.isoformat(),
            "game_count": self.game_accounts.count(),
        }
        if include_password:
            result["password"] = self.password
        return result


class Game(db.Model):
    __tablename__ = "games"

    id = db.Column(db.Integer, primary_key=True)
    appid = db.Column(db.Integer, unique=True, nullable=False, index=True)
    name = db.Column(db.String(500), nullable=False)
    icon = db.Column(db.String(500), nullable=True, default="")
    description = db.Column(db.Text, nullable=True)
    header_image = db.Column(db.String(500), nullable=True)
    genres = db.Column(db.String(500), nullable=True)  # comma-separated genre names
    screenshots = db.Column(db.JSON, nullable=True)  # [{thumbnail, full}]
    movies = db.Column(db.JSON, nullable=True)  # [{id, name, thumbnail, mp4_480, mp4_max}]
    original_price = db.Column(db.Integer, nullable=True)  # Steam store price in IDR (smallest unit)
    release_date = db.Column(db.Date, nullable=True, index=True)  # Steam store release date
    custom_name = db.Column(db.String(500), nullable=True)
    custom_description = db.Column(db.Text, nullable=True)
    custom_header_image = db.Column(db.String(500), nullable=True)
    custom_screenshots = db.Column(db.JSON, nullable=True)  # [{thumbnail, full}]
    price = db.Column(db.Integer, default=50000, nullable=False)  # in smallest currency unit
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)
    is_featured = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    game_accounts = db.relationship(
        "GameAccount", backref="game", lazy="dynamic", cascade="all, delete-orphan"
    )
    orders = db.relationship("Order", backref="game", lazy="dynamic")
    play_instruction = db.relationship(
        "PlayInstruction", backref="game", uselist=False, cascade="all, delete-orphan"
    )

    def available_account_count(self):
        """Count how many Steam accounts own this game and are active."""
        return (
            GameAccount.query.join(SteamAccount)
            .filter(
                GameAccount.game_id == self.id,
                SteamAccount.is_active == True,  # noqa: E712
            )
            .count()
        )

    def to_dict(self, include_availability=False, admin=False):
        # Merged view: custom overrides win over Steam data
        result = {
            "id": self.id,
            "appid": self.appid,
            "name": self.custom_name or self.name,
            "icon": self.icon,
            "description": self.custom_description or self.description,
            "header_image": self.custom_header_image or self.header_image,
            "genres": self.genres,
            "screenshots": self.custom_screenshots if self.custom_screenshots else (self.screenshots or []),
            "movies": self.movies or [],
            "price": self.price,
            "original_price": self.original_price,
            "release_date": self.release_date.isoformat() if self.release_date else None,
            "is_enabled": self.is_enabled,
            "is_featured": self.is_featured,
            "created_at": self.created_at.isoformat(),
        }
        if include_availability:
            result["available_accounts"] = self.available_account_count()
        if admin:
            # Expose both steam and custom values for the admin UI
            result["steam_name"] = self.name
            result["steam_description"] = self.description
            result["steam_header_image"] = self.header_image
            result["steam_screenshots"] = self.screenshots or []
            result["custom_name"] = self.custom_name
            result["custom_description"] = self.custom_description
            result["custom_header_image"] = self.custom_header_image
            result["custom_screenshots"] = self.custom_screenshots
        return result


class GameAccount(db.Model):
    __tablename__ = "game_accounts"

    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(
        db.Integer, db.ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    steam_account_id = db.Column(
        db.Integer,
        db.ForeignKey("steam_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    # True when this game reaches the account via Steam Families library
    # sharing rather than a direct purchase. Admin-only signal — never
    # exposed to customers — used by round-robin to prefer direct-owned
    # links when both are available.
    is_shared = db.Column(db.Boolean, default=False, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("game_id", "steam_account_id", name="uq_game_steam_account"),
    )


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    game_id = db.Column(
        db.Integer, db.ForeignKey("games.id"), nullable=False
    )
    assignment_id = db.Column(
        db.Integer, db.ForeignKey("assignments.id"), nullable=True
    )
    status = db.Column(
        db.String(30), default="pending_payment", nullable=False, index=True
    )  # pending_payment, fulfilled, cancelled, revoked, expired, refunded
    type = db.Column(
        db.String(20), default="purchase", nullable=False
    )  # purchase, subscription
    snap_token = db.Column(db.String(255), nullable=True)
    # Cart checkout creates N Orders sharing the same midtrans_order_id
    # (one Midtrans/Tripay transaction per cart), so this column is NOT
    # unique. It is indexed for webhook lookup performance.
    midtrans_order_id = db.Column(db.String(100), nullable=True, index=True)
    tripay_reference = db.Column(db.String(100), nullable=True, index=True)
    payment_type = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    amount = db.Column(db.Integer, nullable=True)  # actual amount paid in IDR
    amount_subtotal = db.Column(db.Integer, nullable=True)
    promo_discount = db.Column(db.Integer, nullable=False, default=0)
    credit_applied = db.Column(db.Integer, nullable=False, default=0)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=True)
    # Shopping cart: groups orders created together from a single cart
    # checkout so they share one payment transaction. NULL for one-off
    # (non-cart) orders, which remain the common case for direct purchases.
    checkout_group_id = db.Column(db.String(40), nullable=True, index=True)
    refunded_at = db.Column(db.DateTime(timezone=True), nullable=True)
    refund_note = db.Column(db.Text, nullable=True)
    refunded_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    assignment = db.relationship(
        "Assignment", foreign_keys=[assignment_id], backref="order_ref", uselist=False
    )

    def to_dict(self, include_credentials=False):
        result = {
            "id": self.id,
            "user_id": self.user_id,
            "game_id": self.game_id,
            "game": self.game.to_dict() if self.game else None,
            "status": self.status,
            "type": self.type,
            "is_revoked": self.assignment.is_revoked if self.assignment else False,
            "snap_token": self.snap_token,
            "tripay_reference": self.tripay_reference,
            "payment_type": self.payment_type,
            "amount": self.amount,
            "amount_subtotal": self.amount_subtotal,
            "promo_discount": self.promo_discount,
            "credit_applied": self.credit_applied,
            "promo_code_id": self.promo_code_id,
            "checkout_group_id": self.checkout_group_id,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "refunded_at": self.refunded_at.isoformat() if self.refunded_at else None,
            "refund_note": self.refund_note,
            "refunded_by_user_id": self.refunded_by_user_id,
            "created_at": self.created_at.isoformat(),
            "assignment_id": self.assignment_id,
        }
        if include_credentials and self.assignment and not self.assignment.is_revoked:
            result["credentials"] = {
                "account_name": self.assignment.steam_account.account_name,
                "password": self.assignment.steam_account.password,
            }
        return result


class Assignment(db.Model):
    __tablename__ = "assignments"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(
        db.Integer, db.ForeignKey("orders.id"), nullable=False
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    steam_account_id = db.Column(
        db.Integer, db.ForeignKey("steam_accounts.id"), nullable=False
    )
    game_id = db.Column(
        db.Integer, db.ForeignKey("games.id"), nullable=False
    )
    is_revoked = db.Column(db.Boolean, default=False, nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    order = db.relationship(
        "Order",
        foreign_keys=[order_id],
        backref="assignment_record",
        uselist=False,
        overlaps="assignment,order_ref",
    )
    game = db.relationship("Game", foreign_keys=[game_id])


class CodeRequestLog(db.Model):
    __tablename__ = "code_request_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    steam_account_id = db.Column(
        db.Integer, db.ForeignKey("steam_accounts.id"), nullable=False
    )
    assignment_id = db.Column(
        db.Integer, db.ForeignKey("assignments.id"), nullable=False
    )
    code = db.Column(db.String(10), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    assignment = db.relationship("Assignment", backref="code_logs")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "steam_account_id": self.steam_account_id,
            "assignment_id": self.assignment_id,
            "code": self.code,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat(),
        }


class PlayInstruction(db.Model):
    __tablename__ = "play_instructions"

    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(
        db.Integer,
        db.ForeignKey("games.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    content = db.Column(db.Text, nullable=False)
    is_custom = db.Column(db.Boolean, default=False, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "game_id": self.game_id,
            "content": self.content,
            "is_custom": self.is_custom,
            "updated_at": self.updated_at.isoformat(),
        }


class SiteSetting(db.Model):
    """Key-value store for site-wide settings."""
    __tablename__ = "site_settings"

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=False, default="")
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Default settings
    DEFAULTS = {
        "payment_mode": "manual",  # manual | midtrans_sandbox | midtrans_production | tripay
        "midtrans_sandbox_server_key": "SB-Mid-server-7Fp0W-6BPItzBeHc4WmVz0rh",
        "midtrans_sandbox_client_key": "SB-Mid-client-VNwEU_8NEdo5N3og",
        "midtrans_production_server_key": "",
        "midtrans_production_client_key": "",
        "midtrans_merchant_id": "G048936526",
        "manual_qris_image_url": "",
        "manual_whatsapp_number": "6282240708329",
        "manual_payment_instructions": "Scan QRIS di bawah ini, lalu kirim bukti transfer via WhatsApp.",
        "sub_price_monthly": "50000",
        "sub_price_3monthly": "120000",
        "sub_price_6monthly": "0",
        "sub_price_yearly": "400000",
        "sub_price_lifetime": "0",  # 0 = disabled (hidden from subscribe page and landing promo)
        # Promo banner (landing page). Single active banner controlled by these keys.
        # Banner only renders when enabled=true AND now is within [start_date, end_date]
        # AND the target_plan has a non-zero price in sub_price_{target_plan}.
        "promo_banner_enabled": "true",
        "promo_banner_start_date": "2026-04-24T00:00:00+07:00",
        "promo_banner_end_date": "2026-05-16T00:00:00+07:00",
        "promo_banner_target_plan": "lifetime",
        "promo_banner_regular_price": "599000",
        "promo_banner_eyebrow": "PROMO TERBATAS · LIFETIME DEAL",
        "promo_banner_headline": "Subscribe\n*Sekali,* Main\nSelamanya.",
        "promo_banner_subhead": "Akses semua 300+ game Steam di katalog kami — satu kali bayar, tanpa biaya bulanan, tanpa batas waktu.",
        "promo_banner_features": "Akses 300+ game Steam|100% Original|OTP Otomatis 24/7|Garansi akun selamanya",
        "promo_banner_cta_text": "Ambil Promo Sekarang",
        "promo_banner_wa_message": "Halo admin Playfast! \U0001f3ae\n\nSaya tertarik dengan promo *Subscribe {plan_label}* ({price}) — akses semua 300+ game Steam.\n\nMohon info lebih lanjut untuk melanjutkan pembelian. Terima kasih!",
        "promo_banner_session_key_suffix": "v2",
        "referral_referee_discount_pct": "10",
        "referral_referrer_credit": "10000",
        "referral_min_order": "50000",
        "discord_invite_url": "",  # /discord on the site redirects here
        "tutorial_youtube_url": "",  # Tutorial video on landing — empty = hide section
        # Tripay gateway: 2 envs (sandbox + production) like Midtrans.
        # `payment_mode = "tripay"` activates this gateway; `tripay_is_production`
        # picks which credential set + base URL to use.
        "tripay_is_production": "false",  # "true" | "false"
        "tripay_sandbox_api_key": "",
        "tripay_sandbox_private_key": "",
        "tripay_sandbox_merchant_code": "",
        "tripay_production_api_key": "",
        "tripay_production_private_key": "",
        "tripay_production_merchant_code": "",
        "tripay_payment_method": "QRIS2",  # Tripay channel code; QRIS covers most users
    }

    @classmethod
    def get(cls, key: str) -> str:
        setting = cls.query.get(key)
        if setting:
            return setting.value
        return cls.DEFAULTS.get(key, "")

    @classmethod
    def set(cls, key: str, value: str):
        from app.extensions import db as _db
        setting = cls.query.get(key)
        if setting:
            setting.value = value
        else:
            setting = cls(key=key, value=value)
            _db.session.add(setting)

    @classmethod
    def get_all(cls) -> dict:
        """Return all settings with defaults filled in."""
        stored = {s.key: s.value for s in cls.query.all()}
        result = dict(cls.DEFAULTS)
        result.update(stored)
        return result


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    is_used = db.Column(db.Boolean, default=False, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", backref="reset_tokens")

    @classmethod
    def create_for_user(cls, user_id: int, hours: int = 24) -> "PasswordResetToken":
        """Generate a new reset token for a user, invalidating previous ones."""
        cls.query.filter_by(user_id=user_id, is_used=False).update({"is_used": True})
        token = cls(
            user_id=user_id,
            token=secrets.token_urlsafe(48),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=hours),
        )
        db.session.add(token)
        return token

    @classmethod
    def validate(cls, token_str: str) -> "PasswordResetToken | None":
        """Find a valid, unused, non-expired token."""
        t = cls.query.filter_by(token=token_str, is_used=False).first()
        if t and t.expires_at > datetime.now(timezone.utc):
            return t
        return None


class EmailVerificationToken(db.Model):
    __tablename__ = "email_verification_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    is_used = db.Column(db.Boolean, default=False, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", backref="verification_tokens")

    @classmethod
    def create_for_user(cls, user_id: int, hours: int = 24) -> "EmailVerificationToken":
        cls.query.filter_by(user_id=user_id, is_used=False).update({"is_used": True})
        token = cls(
            user_id=user_id,
            token=secrets.token_urlsafe(48),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=hours),
        )
        db.session.add(token)
        return token

    @classmethod
    def validate(cls, token_str: str) -> "EmailVerificationToken | None":
        t = cls.query.filter_by(token=token_str, is_used=False).first()
        if t and t.expires_at > datetime.now(timezone.utc):
            return t
        return None


class PromoCode(db.Model):
    __tablename__ = "promo_codes"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False, index=True)
    description = db.Column(db.String(200), nullable=True)
    discount_type = db.Column(db.String(20), nullable=False)  # 'percentage' | 'fixed'
    discount_value = db.Column(db.Integer, nullable=False)
    scope = db.Column(db.String(30), nullable=False, default="all")
    min_order_amount = db.Column(db.Integer, nullable=False, default=0)
    max_uses_total = db.Column(db.Integer, nullable=True)
    max_uses_per_user = db.Column(db.Integer, nullable=False, default=1)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    # When set, this code can ONLY be redeemed by the specified user. Otherwise
    # it is a public code anyone can try (subject to scope + max_uses rules).
    assigned_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    assigned_user = db.relationship("User", foreign_keys=[assigned_user_id])
    usages = db.relationship("PromoCodeUsage", backref="promo_code", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self, include_usage_count=False):
        data = {
            "id": self.id,
            "code": self.code,
            "description": self.description,
            "discount_type": self.discount_type,
            "discount_value": self.discount_value,
            "scope": self.scope,
            "min_order_amount": self.min_order_amount,
            "max_uses_total": self.max_uses_total,
            "max_uses_per_user": self.max_uses_per_user,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active,
            "assigned_user_id": self.assigned_user_id,
            "assigned_user_email": self.assigned_user.email if self.assigned_user else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_usage_count:
            data["uses_count"] = self.usages.count()
        return data


class PromoCodeUsage(db.Model):
    __tablename__ = "promo_code_usages"

    id = db.Column(db.Integer, primary_key=True)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=True)
    discount_amount = db.Column(db.Integer, nullable=False)
    used_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    paid_to_creator_at = db.Column(db.DateTime(timezone=True), nullable=True)
    paid_to_creator_note = db.Column(db.Text, nullable=True)

    user = db.relationship("User")
    order = db.relationship("Order")
    subscription = db.relationship("Subscription")

    def to_dict(self):
        return {
            "id": self.id,
            "promo_code_id": self.promo_code_id,
            "user_id": self.user_id,
            "order_id": self.order_id,
            "subscription_id": self.subscription_id,
            "discount_amount": self.discount_amount,
            "used_at": self.used_at.isoformat(),
            "paid_to_creator_at": self.paid_to_creator_at.isoformat() if self.paid_to_creator_at else None,
            "paid_to_creator_note": self.paid_to_creator_note,
        }


class ReferralReward(db.Model):
    __tablename__ = "referral_rewards"

    id = db.Column(db.Integer, primary_key=True)
    referrer_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    referee_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True, index=True)
    trigger_order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    trigger_subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=True)
    credit_awarded = db.Column(db.Integer, nullable=False)
    awarded_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "referrer_user_id": self.referrer_user_id,
            "referee_user_id": self.referee_user_id,
            "trigger_order_id": self.trigger_order_id,
            "trigger_subscription_id": self.trigger_subscription_id,
            "credit_awarded": self.credit_awarded,
            "awarded_at": self.awarded_at.isoformat(),
        }


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    PLAN_DURATIONS = {
        "monthly": 30,
        "3monthly": 90,
        "6monthly": 180,
        "yearly": 365,
        "lifetime": 36500,
    }

    PLAN_LABELS = {
        "monthly": "Monthly",
        "3monthly": "3 Months",
        "6monthly": "6 Months",
        "yearly": "Yearly",
        "lifetime": "Lifetime",
    }

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    plan = db.Column(db.String(20), nullable=False)  # monthly, 3monthly, yearly
    status = db.Column(
        db.String(20), default="pending_payment", nullable=False, index=True
    )  # pending_payment, active, expired, cancelled, refunded
    amount = db.Column(db.Integer, nullable=False)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    midtrans_order_id = db.Column(
        db.String(100), nullable=True, unique=True, index=True
    )
    tripay_reference = db.Column(db.String(100), nullable=True, index=True)
    snap_token = db.Column(db.String(255), nullable=True)
    payment_type = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship(
        "User",
        backref=db.backref("subscriptions", lazy="dynamic"),
        foreign_keys=[user_id],
    )

    amount_subtotal = db.Column(db.Integer, nullable=True)
    promo_discount = db.Column(db.Integer, nullable=False, default=0)
    credit_applied = db.Column(db.Integer, nullable=False, default=0)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=True)
    refunded_at = db.Column(db.DateTime(timezone=True), nullable=True)
    refund_note = db.Column(db.Text, nullable=True)
    refunded_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    def activate(self):
        """Activate this subscription, setting start/expiry dates."""
        now = datetime.now(timezone.utc)
        duration_days = self.PLAN_DURATIONS.get(self.plan, 30)
        self.status = "active"
        self.starts_at = now
        self.expires_at = now + timedelta(days=duration_days)

    @property
    def is_active(self):
        return (
            self.status == "active"
            and self.expires_at is not None
            and self.expires_at > datetime.now(timezone.utc)
        )

    def to_dict(self, include_snap_token: bool = False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "plan": self.plan,
            "plan_label": self.PLAN_LABELS.get(self.plan, self.plan),
            "status": self.status,
            "amount": self.amount,
            "amount_subtotal": self.amount_subtotal,
            "promo_discount": self.promo_discount,
            "credit_applied": self.credit_applied,
            "promo_code_id": self.promo_code_id,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "midtrans_order_id": self.midtrans_order_id,
            "tripay_reference": self.tripay_reference,
            "payment_type": self.payment_type,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "refunded_at": self.refunded_at.isoformat() if self.refunded_at else None,
            "refund_note": self.refund_note,
            "refunded_by_user_id": self.refunded_by_user_id,
            "created_at": self.created_at.isoformat(),
        }
        if include_snap_token:
            data["snap_token"] = self.snap_token
        return data


class AccountFlag(db.Model):
    """User-reported issue with a Steam account they have access to."""
    __tablename__ = "account_flags"

    REASON_CHOICES = (
        "locked",         # akun ke-lock / ke-banned Steam Guard
        "banned",         # akun di-ban Steam (VAC, dll)
        "password_changed",  # password berubah, gak bisa login
        "credentials_invalid",  # username/password yang dikasih salah
        "guard_code_failed",  # kode Steam Guard gak diterima
        "slow_response",  # akun lambat / lag
        "other",
    )
    STATUS_CHOICES = ("new", "resolved")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    steam_account_id = db.Column(
        db.Integer, db.ForeignKey("steam_accounts.id"), nullable=False, index=True
    )
    assignment_id = db.Column(
        db.Integer, db.ForeignKey("assignments.id"), nullable=True
    )
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    reason = db.Column(db.String(40), nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="new", index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    resolution_note = db.Column(db.Text, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])
    steam_account = db.relationship("SteamAccount", foreign_keys=[steam_account_id])
    assignment = db.relationship("Assignment", foreign_keys=[assignment_id])
    order = db.relationship("Order", foreign_keys=[order_id])
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_user_id])

    def to_dict(self, include_admin_fields: bool = False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "steam_account_id": self.steam_account_id,
            "assignment_id": self.assignment_id,
            "order_id": self.order_id,
            "reason": self.reason,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
        if include_admin_fields:
            data["user_email"] = self.user.email if self.user else None
            data["account_name"] = self.steam_account.account_name if self.steam_account else None
            data["game_name"] = (
                self.assignment.game.name
                if self.assignment and self.assignment.game
                else None
            )
            data["resolved_by_user_id"] = self.resolved_by_user_id
            data["resolved_by_email"] = self.resolved_by.email if self.resolved_by else None
            data["resolution_note"] = self.resolution_note
        return data


class GameRequest(db.Model):
    """User-submitted request for a game to be added to the catalog.
    Aggregated by Steam appid: each unique game = one row, votes track requesters.
    """
    __tablename__ = "game_requests"

    STATUS_CHOICES = ("pending", "added", "rejected")

    id = db.Column(db.Integer, primary_key=True)
    appid = db.Column(db.Integer, unique=True, nullable=False, index=True)
    name = db.Column(db.String(500), nullable=False)
    header_image = db.Column(db.String(500), nullable=True)
    original_price = db.Column(db.Integer, nullable=True)
    store_url = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    admin_note = db.Column(db.Text, nullable=True)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    resolved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    notified_at = db.Column(db.DateTime(timezone=True), nullable=True)
    notified_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    votes = db.relationship(
        "GameRequestVote", backref="game_request", lazy="dynamic", cascade="all, delete-orphan"
    )
    resolved_by = db.relationship("User", foreign_keys=[resolved_by_user_id])

    def request_count(self) -> int:
        return self.votes.count()

    def to_dict(self, include_voters: bool = False, current_user_id: int | None = None):
        data = {
            "id": self.id,
            "appid": self.appid,
            "name": self.name,
            "header_image": self.header_image,
            "original_price": self.original_price,
            "store_url": self.store_url,
            "status": self.status,
            "admin_note": self.admin_note,
            "request_count": self.request_count(),
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat(),
        }
        if current_user_id is not None:
            data["voted"] = (
                self.votes.filter_by(user_id=current_user_id).first() is not None
            )
        if include_voters:
            voters = []
            for v in self.votes.order_by(GameRequestVote.created_at.desc()).all():
                voters.append({
                    "user_id": v.user_id,
                    "email": v.user.email if v.user else None,
                    "voted_at": v.created_at.isoformat(),
                })
            data["voters"] = voters
            data["resolved_by_email"] = (
                self.resolved_by.email if self.resolved_by else None
            )
            data["notified_at"] = (
                self.notified_at.isoformat() if self.notified_at else None
            )
            data["notified_count"] = self.notified_count
        return data


class GameRequestVote(db.Model):
    """One row per user vote for a GameRequest. Unique per (request, user)."""
    __tablename__ = "game_request_votes"

    id = db.Column(db.Integer, primary_key=True)
    game_request_id = db.Column(
        db.Integer,
        db.ForeignKey("game_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        db.UniqueConstraint(
            "game_request_id", "user_id", name="uq_game_request_user_vote"
        ),
    )


class EmailCampaign(db.Model):
    """Admin-drafted email blast. Stores subject, markdown body, rendered HTML,
    audience filters used, status, and aggregate counts."""
    __tablename__ = "email_campaigns"

    STATUS_CHOICES = ("draft", "sending", "completed", "cancelled", "failed")

    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(300), nullable=False)
    body_markdown = db.Column(db.Text, nullable=False, default="")
    body_html = db.Column(db.Text, nullable=True)  # rendered + branded, cached at send-time
    filters_json = db.Column(db.JSON, nullable=False, default=dict)
    # 'filters' (use filters_json over User table, default) or 'specific'
    # (use target_emails list, can include non-registered emails).
    audience_mode = db.Column(db.String(20), nullable=False, default="filters")
    target_emails = db.Column(db.JSON, nullable=True)  # list[str], used when audience_mode='specific'
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    total_recipients = db.Column(db.Integer, nullable=False, default=0)
    sent_count = db.Column(db.Integer, nullable=False, default=0)
    failed_count = db.Column(db.Integer, nullable=False, default=0)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    finished_at = db.Column(db.DateTime(timezone=True), nullable=True)

    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    recipients = db.relationship(
        "EmailCampaignRecipient",
        backref="campaign",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_body: bool = False):
        data = {
            "id": self.id,
            "subject": self.subject,
            "filters": self.filters_json or {},
            "audience_mode": self.audience_mode or "filters",
            "target_emails": self.target_emails or [],
            "status": self.status,
            "total_recipients": self.total_recipients,
            "sent_count": self.sent_count,
            "failed_count": self.failed_count,
            "created_by_email": self.created_by.email if self.created_by else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }
        if include_body:
            data["body_markdown"] = self.body_markdown
        return data


class EmailCampaignRecipient(db.Model):
    """One row per recipient of an EmailCampaign. Stores per-user delivery state."""
    __tablename__ = "email_campaign_recipients"

    STATUS_CHOICES = ("pending", "sent", "failed")

    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(
        db.Integer,
        db.ForeignKey("email_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable: when sending to non-registered emails (audience_mode='specific'),
    # there is no User row to link.
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    email = db.Column(db.String(255), nullable=False)  # snapshot at send-time
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    error = db.Column(db.Text, nullable=True)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        # Unique by (campaign_id, email) so a non-registered email can't be
        # queued twice in the same campaign even when user_id is null.
        db.UniqueConstraint(
            "campaign_id", "email", name="uq_email_campaign_recipient_email"
        ),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "user_id": self.user_id,
            "email": self.email,
            "status": self.status,
            "error": self.error,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
        }


class EmailUnsubscribeToken(db.Model):
    """One stable token per user, used in blast email footer links.
    Tokens never expire — a user who clicks an old email a year later still
    expects unsubscribe to work.
    """
    __tablename__ = "email_unsubscribe_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        unique=True,
        nullable=False,
        index=True,
    )
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", foreign_keys=[user_id])

    @classmethod
    def get_or_create_for_user(cls, user_id: int) -> "EmailUnsubscribeToken":
        existing = cls.query.filter_by(user_id=user_id).first()
        if existing:
            return existing
        tok = cls(user_id=user_id, token=secrets.token_urlsafe(48))
        db.session.add(tok)
        db.session.flush()
        return tok


class EmailGuestOptOut(db.Model):
    """Records emails (non-registered recipients) that have unsubscribed
    from blast emails sent via 'specific emails' mode. Registered users use
    User.email_opted_out instead.
    """
    __tablename__ = "email_guest_opt_outs"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    unsubscribed_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Review(db.Model):
    """User-submitted product review. Supports two creation modes:

    1. **User submission** (user_id set): standard flow. Eligible paying
       customers submit one review; admin approves/rejects. The displayed
       email + plan-tier badge are derived on the fly from the linked user.
    2. **Admin manual seed** (user_id null, manual_email + manual_plan_label
       set): used to backfill historical testimonials that aren't tied to a
       real user account. The admin types display identity directly.

    Plan-tier badge (e.g. "Subscriber Lifetime", "Beli Satuan • 3 game") is
    NOT stored on the row when user_id is set — it's derived at read time
    via app.reviews.service.derive_plan_label so it tracks current state.
    """
    __tablename__ = "reviews"

    STATUS_CHOICES = ("pending", "approved", "rejected")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    manual_email = db.Column(db.String(255), nullable=True)
    manual_plan_label = db.Column(db.String(80), nullable=True)
    rating = db.Column(db.Integer, nullable=False)  # 1..5
    headline = db.Column(db.String(200), nullable=True)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(
        db.String(20), default="pending", nullable=False, index=True
    )
    is_featured = db.Column(db.Boolean, default=False, nullable=False, index=True)
    admin_note = db.Column(db.Text, nullable=True)
    moderated_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", foreign_keys=[user_id])
    moderated_by = db.relationship("User", foreign_keys=[moderated_by_user_id])
    images = db.relationship(
        "ReviewImage",
        backref="review",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="ReviewImage.sort_order",
    )

    __table_args__ = (
        # One review per registered user. Manual seeds (user_id NULL) are
        # exempt — admins can add as many seeds as needed.
        db.Index(
            "uq_reviews_user_id",
            "user_id",
            unique=True,
            postgresql_where=db.text("user_id IS NOT NULL"),
            sqlite_where=db.text("user_id IS NOT NULL"),
        ),
    )


class ReviewImage(db.Model):
    """Image attached to a Review. Stored on disk under
    backend/uploads/reviews/<review_id>/, served via /uploads/...
    """
    __tablename__ = "review_images"

    id = db.Column(db.Integer, primary_key=True)
    review_id = db.Column(
        db.Integer,
        db.ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url = db.Column(db.String(500), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "url": self.url,
            "sort_order": self.sort_order,
        }


class CreatorApplication(db.Model):
    """Application submitted via the public /creator landing page.

    Anyone can submit (no Playfast account required) — admin reviews the
    queue in /admin/creator-applications and contacts the applicant via
    WhatsApp/email if accepted. Approval doesn't auto-create a promo code
    or trial subscription — those are issued manually via the existing
    admin UIs so the admin retains control over personalisation (code
    name, commission rate, trial duration).
    """
    __tablename__ = "creator_applications"

    STATUS_CHOICES = ("pending", "contacted", "approved", "rejected")
    PLATFORM_CHOICES = ("tiktok", "instagram", "youtube", "x", "facebook", "other")
    FOLLOWER_BUCKETS = ("<1K", "1-10K", "10-50K", "50-100K", "100K+")

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    whatsapp = db.Column(db.String(50), nullable=False)
    platform = db.Column(db.String(30), nullable=False)
    handle = db.Column(db.String(200), nullable=False)
    follower_bucket = db.Column(db.String(20), nullable=True)
    # JSON array of strings (URLs). At least one is required at submission
    # time, but we store as JSON so it's easy to evolve to N items later.
    content_links = db.Column(db.JSON, nullable=True)
    niche = db.Column(db.String(200), nullable=True)
    pitch = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    admin_note = db.Column(db.Text, nullable=True)
    reviewed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_user_id])

    def to_dict(self, admin: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "whatsapp": self.whatsapp,
            "platform": self.platform,
            "handle": self.handle,
            "follower_bucket": self.follower_bucket,
            "content_links": self.content_links or [],
            "niche": self.niche,
            "pitch": self.pitch,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }
        if admin:
            data["admin_note"] = self.admin_note
            data["reviewed_by_user_id"] = self.reviewed_by_user_id
            data["reviewed_by_email"] = (
                self.reviewed_by.email if self.reviewed_by else None
            )
            data["reviewed_at"] = (
                self.reviewed_at.isoformat() if self.reviewed_at else None
            )
        return data


class CartItem(db.Model):
    """A single game queued in a user's cart, ready to checkout.

    Unique constraint on (user_id, game_id) — a game can't appear twice in
    the same cart. Quantity is always 1 (one game = one access). Cart is
    deleted atomically when checkout-cart endpoint succeeds.
    """

    __tablename__ = "cart_items"
    __table_args__ = (
        db.UniqueConstraint("user_id", "game_id", name="uq_cart_user_game"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    game_id = db.Column(
        db.Integer, db.ForeignKey("games.id"), nullable=False
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship(
        "User", backref=db.backref("cart_items", lazy="dynamic")
    )
    game = db.relationship("Game")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "game_id": self.game_id,
            "game": self.game.to_dict() if self.game else None,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def add_for_user(cls, user_id: int, game_id: int) -> "CartItem":
        """Add a game to user's cart. Idempotent — if already in cart,
        returns the existing row without raising. Caller is responsible
        for premium/already-owned checks before calling.
        """
        existing = cls.query.filter_by(user_id=user_id, game_id=game_id).first()
        if existing:
            return existing
        item = cls(user_id=user_id, game_id=game_id)
        db.session.add(item)
        db.session.commit()
        return item

    @classmethod
    def remove_for_user(cls, user_id: int, item_id: int) -> bool:
        """Remove a specific cart item. Returns True if removed, False
        if not found or not owned by user.
        """
        item = cls.query.filter_by(id=item_id, user_id=user_id).first()
        if not item:
            return False
        db.session.delete(item)
        db.session.commit()
        return True

    @classmethod
    def clear_for_user(cls, user_id: int) -> int:
        """Delete all cart items for a user. Returns number deleted."""
        count = cls.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return count

    @classmethod
    def list_for_user(cls, user_id: int) -> "list[CartItem]":
        """Return cart items for a user, oldest first."""
        return (
            cls.query.filter_by(user_id=user_id)
            .order_by(cls.created_at.asc())
            .all()
        )


class EmailLog(db.Model):
    __tablename__ = "email_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    recipient_email = db.Column(db.String(255), nullable=False, index=True)
    type = db.Column(db.String(50), nullable=False, index=True)
    subject = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="queued", index=True)
    smtp_response = db.Column(db.Text, nullable=True)
    brevo_message_id = db.Column(db.String(255), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    log_metadata = db.Column("metadata", db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    brevo_event_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", backref=db.backref("email_logs", lazy="dynamic"))

    # Status constants — keep in sync with spec
    STATUS_QUEUED = "queued"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_DELIVERED = "delivered"
    STATUS_BOUNCED = "bounced"
    STATUS_SOFT_BOUNCED = "soft_bounced"
    STATUS_SPAM = "spam"
    STATUS_BLOCKED = "blocked"
    STATUS_INVALID_EMAIL = "invalid_email"
    STATUS_DEFERRED = "deferred"

    # Event types — keep in sync with email_service senders
    TYPE_VERIFICATION = "verification"
    TYPE_PASSWORD_RESET = "password_reset"
    TYPE_ORDER_WELCOME = "order_welcome"
    TYPE_SUBSCRIPTION_WELCOME = "subscription_welcome"
    TYPE_CART_WELCOME = "cart_welcome"
    TYPE_GAME_REQUEST_FULFILLED = "game_request_fulfilled"
    TYPE_ACCOUNT_FLAG = "account_flag"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "recipient_email": self.recipient_email,
            "type": self.type,
            "subject": self.subject,
            "status": self.status,
            "smtp_response": self.smtp_response,
            "brevo_message_id": self.brevo_message_id,
            "error_message": self.error_message,
            "metadata": self.log_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "brevo_event_at": self.brevo_event_at.isoformat() if self.brevo_event_at else None,
        }

    @classmethod
    def create_queued(
        cls,
        *,
        recipient_email: str,
        type: str,
        subject: str,
        user_id: int | None = None,
        metadata: dict | None = None,
    ) -> "EmailLog":
        log = cls(
            user_id=user_id,
            recipient_email=recipient_email,
            type=type,
            subject=subject,
            status=cls.STATUS_QUEUED,
            log_metadata=metadata,
        )
        db.session.add(log)
        db.session.commit()
        return log

    @classmethod
    def mark_sent(cls, log_id: int, smtp_response: str, brevo_message_id: str | None):
        log = db.session.get(cls, log_id)
        if not log:
            return
        if log.status == cls.STATUS_QUEUED:
            log.status = cls.STATUS_SENT
        log.smtp_response = smtp_response
        log.brevo_message_id = brevo_message_id
        log.sent_at = datetime.now(timezone.utc)
        db.session.commit()

    @classmethod
    def mark_failed(cls, log_id: int, error_message: str):
        log = db.session.get(cls, log_id)
        if not log:
            return
        log.status = cls.STATUS_FAILED
        log.error_message = error_message
        db.session.commit()

    # Brevo event -> status mapping
    BREVO_EVENT_MAP = {
        "delivered": STATUS_DELIVERED,
        "hard_bounce": STATUS_BOUNCED,
        "soft_bounce": STATUS_SOFT_BOUNCED,
        "spam": STATUS_SPAM,
        "blocked": STATUS_BLOCKED,
        "invalid_email": STATUS_INVALID_EMAIL,
        "deferred": STATUS_DEFERRED,
    }

    def apply_brevo_event(self, event: str, event_at: datetime, reason: str | None) -> bool:
        """Apply a Brevo webhook event. Returns True if applied, False if skipped (unknown/older)."""
        new_status = self.BREVO_EVENT_MAP.get(event)
        if not new_status:
            return False
        if self.brevo_event_at and event_at <= self.brevo_event_at:
            return False
        self.status = new_status
        self.brevo_event_at = event_at
        if reason:
            self.error_message = reason
        db.session.commit()
        return True
