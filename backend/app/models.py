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
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    orders = db.relationship("Order", backref="user", lazy="dynamic")
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
    )  # pending_payment, fulfilled, cancelled, revoked, expired
    type = db.Column(
        db.String(20), default="purchase", nullable=False
    )  # purchase, subscription
    snap_token = db.Column(db.String(255), nullable=True)
    midtrans_order_id = db.Column(db.String(100), nullable=True, unique=True, index=True)
    payment_type = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    amount = db.Column(db.Integer, nullable=True)  # actual amount paid in IDR
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
            "payment_type": self.payment_type,
            "amount": self.amount,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
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
        "payment_mode": "midtrans_sandbox",  # midtrans_sandbox | midtrans_production | manual
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
        "sub_price_yearly": "400000",
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


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    PLAN_DURATIONS = {
        "monthly": 30,
        "3monthly": 90,
        "yearly": 365,
        "lifetime": 36500,
    }

    PLAN_LABELS = {
        "monthly": "Monthly",
        "3monthly": "3 Months",
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
    )  # pending_payment, active, expired, cancelled
    amount = db.Column(db.Integer, nullable=False)
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    midtrans_order_id = db.Column(
        db.String(100), nullable=True, unique=True, index=True
    )
    snap_token = db.Column(db.String(255), nullable=True)
    payment_type = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = db.relationship("User", backref=db.backref("subscriptions", lazy="dynamic"))

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
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "midtrans_order_id": self.midtrans_order_id,
            "payment_type": self.payment_type,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_snap_token:
            data["snap_token"] = self.snap_token
        return data
