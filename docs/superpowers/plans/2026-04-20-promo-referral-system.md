# Promo Code + Referral Program + Checkout UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship admin-managed promo codes (trackable discount codes), a user referral program (auto-generated per-user codes + credit rewards), and an inline checkout review modal that replaces the direct-to-QR flow.

**Architecture:** Three new DB tables (`promo_codes`, `promo_code_usages`, `referral_rewards`) + additive columns on `users`/`orders`/`subscriptions`. Pricing engine applies promo first, then referral credit, then writes breakdown to the order. Inline modal on game detail + subscribe pages collects promo/credit preferences before order creation. Schema changes use the existing idempotent `_run_schema_upgrades()` pattern.

**Tech Stack:** Flask + SQLAlchemy backend (no Alembic — uses ALTER TABLE ladder), Next.js + MUI + @tanstack/react-query frontend, manual QA.

---

### Task 1: Data models + schema upgrades

**Files:**
- Modify: `backend/app/models.py` (add 3 new models, extend 3 existing)
- Modify: `backend/app/__init__.py` (extend `_run_schema_upgrades` ALTER TABLE list + create new tables)

- [ ] **Step 1: Add the three new models to `backend/app/models.py`**

Append these at the bottom of the file:

```python
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
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

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
```

- [ ] **Step 2: Add columns to existing `User` model**

Find the `User` class in `backend/app/models.py` and add these columns (place them with the other columns, not inside any method):

```python
    referral_code = db.Column(db.String(12), unique=True, nullable=True, index=True)
    referred_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    referral_credit = db.Column(db.Integer, nullable=False, default=0)
```

Also update `User.to_dict()` to include the new fields:
```python
    # Inside to_dict(), add these keys to the returned dict:
    "referral_code": self.referral_code,
    "referred_by_user_id": self.referred_by_user_id,
    "referral_credit": self.referral_credit,
```

- [ ] **Step 3: Add columns to `Order` and `Subscription` models**

In the `Order` class, add:
```python
    amount_subtotal = db.Column(db.Integer, nullable=True)
    promo_discount = db.Column(db.Integer, nullable=False, default=0)
    credit_applied = db.Column(db.Integer, nullable=False, default=0)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=True)
```

In `Subscription` class, add the same 4 fields.

Update `Order.to_dict()` and `Subscription.to_dict()` to include these fields in the returned dict:
```python
    "amount_subtotal": self.amount_subtotal,
    "promo_discount": self.promo_discount,
    "credit_applied": self.credit_applied,
    "promo_code_id": self.promo_code_id,
```

- [ ] **Step 4: Add the schema upgrades**

In `backend/app/__init__.py` function `_run_schema_upgrades()`, extend the `alter_statements` list with these statements at the end:

```python
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
```

Then add the new tables below the existing Subscription/EmailVerificationToken creates:
```python
    from app.models import PromoCode, PromoCodeUsage, ReferralReward
    PromoCode.__table__.create(db.engine, checkfirst=True)
    PromoCodeUsage.__table__.create(db.engine, checkfirst=True)
    ReferralReward.__table__.create(db.engine, checkfirst=True)
```

- [ ] **Step 5: Backfill existing users with referral codes**

In the same `_run_schema_upgrades` function, after the table creation, add:

```python
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
```

- [ ] **Step 6: Add the 3 new site settings defaults**

In `backend/app/models.py`, find `SiteSetting.DEFAULTS` dict and add:
```python
    "referral_referee_discount_pct": "10",
    "referral_referrer_credit": "10000",
    "referral_min_order": "50000",
```

- [ ] **Step 7: Verify**

```bash
cd backend && python -c "
from app import create_app
app = create_app()
with app.app_context():
    from app.models import PromoCode, PromoCodeUsage, ReferralReward, User, Order, Subscription
    print('models OK')
    # Verify schema upgrade ran
    from app.extensions import db
    from sqlalchemy import inspect
    insp = inspect(db.engine)
    user_cols = [c['name'] for c in insp.get_columns('users')]
    assert 'referral_code' in user_cols, 'users.referral_code missing'
    assert 'referral_credit' in user_cols, 'users.referral_credit missing'
    order_cols = [c['name'] for c in insp.get_columns('orders')]
    assert 'promo_code_id' in order_cols, 'orders.promo_code_id missing'
    print('schema OK')
    # Count users with referral_code set
    total = User.query.count()
    with_code = User.query.filter(User.referral_code.isnot(None)).count()
    print(f'users: {with_code}/{total} have referral codes')
"
```

Expected: `models OK`, `schema OK`, and all users backfilled.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models.py backend/app/__init__.py
git commit -m "feat: data models for promo codes + referral program"
```

---

### Task 2: Promo code admin CRUD endpoints

**Files:**
- Modify: `backend/app/admin/routes.py` (add CRUD endpoints)

- [ ] **Step 1: Add imports**

At the top of `admin/routes.py`, add to the existing `from app.models import (...)` block:

```python
    PromoCode,
    PromoCodeUsage,
    ReferralReward,
```

- [ ] **Step 2: Add promo code admin endpoints**

Append at the end of `admin/routes.py`:

```python
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
    # Do NOT allow editing code/discount_type/discount_value after creation to
    # preserve usage-log accuracy; admin should deactivate + create new instead.

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
```

- [ ] **Step 3: Verify**

```bash
cd backend && python -c "from app.admin.routes import list_promo_codes, create_promo_code, update_promo_code, delete_promo_code, list_promo_code_usages, admin_bp; print('routes OK:', len(admin_bp.deferred_functions))"
```
Expected: prints route count (5 more than before).

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat: admin CRUD endpoints for promo codes"
```

---

### Task 3: Promo code validation endpoint + pricing helper

**Files:**
- Create: `backend/app/store/pricing.py` (new module — shared pricing logic)
- Modify: `backend/app/store/routes.py` (add validate endpoint)

- [ ] **Step 1: Create pricing helper module**

Create `backend/app/store/pricing.py`:

```python
"""Shared pricing helpers for promo codes + referral credit."""

from datetime import datetime, timezone
from app.models import PromoCode, PromoCodeUsage, User


def validate_promo_code(code: str, user_id: int, subtotal: int, order_type: str, game_id: int | None = None, plan: str | None = None):
    """Validate a promo code for a given user + order context.

    Returns:
        (promo, discount_amount, None)         on success
        (None, 0, error_message)                on failure
    """
    if not code:
        return None, 0, "Kode promo kosong"

    promo = PromoCode.query.filter_by(code=code.upper()).first()
    if not promo:
        return None, 0, "Kode promo tidak ditemukan"
    if not promo.is_active:
        return None, 0, "Kode promo tidak aktif"
    if promo.expires_at and promo.expires_at < datetime.now(timezone.utc):
        return None, 0, "Kode promo sudah expired"

    # Scope check
    scope = promo.scope or "all"
    if scope == "all":
        pass
    elif scope == "games":
        if order_type != "game":
            return None, 0, "Kode promo ini hanya untuk pembelian game"
    elif scope == "subscriptions":
        if order_type != "subscription":
            return None, 0, "Kode promo ini hanya untuk subscription"
    elif scope.startswith("game:"):
        scoped_id = int(scope.split(":")[1])
        if order_type != "game" or game_id != scoped_id:
            return None, 0, "Kode promo ini tidak berlaku untuk item ini"
    elif scope.startswith("sub:"):
        scoped_plan = scope.split(":")[1]
        if order_type != "subscription" or plan != scoped_plan:
            return None, 0, "Kode promo ini tidak berlaku untuk plan ini"
    else:
        return None, 0, "Kode promo tidak berlaku"

    # Min order check
    if subtotal < promo.min_order_amount:
        return None, 0, f"Minimum pembelian Rp {promo.min_order_amount:,} untuk pakai kode ini"

    # Max uses total
    if promo.max_uses_total is not None:
        total_uses = promo.usages.count()
        if total_uses >= promo.max_uses_total:
            return None, 0, "Kode promo sudah habis kuotanya"

    # Max uses per user
    user_uses = PromoCodeUsage.query.filter_by(promo_code_id=promo.id, user_id=user_id).count()
    if user_uses >= promo.max_uses_per_user:
        return None, 0, "Kamu sudah pernah pakai kode ini"

    # Compute discount
    if promo.discount_type == "percentage":
        discount = int(subtotal * promo.discount_value / 100)
    else:
        discount = min(promo.discount_value, subtotal)

    return promo, discount, None


def compute_final_amount(subtotal: int, user_id: int, promo_code: str | None, apply_credit: bool, order_type: str, game_id: int | None = None, plan: str | None = None):
    """Compute the final order amount after promo + credit.

    Returns dict:
        {
            subtotal, promo_discount, credit_applied, total,
            promo_code_id, first_order_discount_applied,
            error: str | None
        }
    """
    promo_discount = 0
    promo_code_id = None
    if promo_code:
        promo, discount, err = validate_promo_code(
            promo_code, user_id, subtotal, order_type, game_id=game_id, plan=plan
        )
        if err:
            return {"error": err}
        promo_discount = discount
        promo_code_id = promo.id

    interim = subtotal - promo_discount

    credit_applied = 0
    if apply_credit:
        user = User.query.get(user_id)
        if user and user.referral_credit > 0:
            credit_applied = min(user.referral_credit, interim)

    total = max(0, interim - credit_applied)

    return {
        "subtotal": subtotal,
        "promo_discount": promo_discount,
        "credit_applied": credit_applied,
        "total": total,
        "promo_code_id": promo_code_id,
        "error": None,
    }
```

- [ ] **Step 2: Add validate endpoint in `store/routes.py`**

Import at top:
```python
from app.store.pricing import validate_promo_code
```

Append near the subscription endpoints (after `my_subscriptions`):

```python
@store_bp.route("/promo-codes/validate", methods=["POST"])
@jwt_required()
def validate_promo():
    """Validate a promo code without persisting a usage.

    Body: { code, order_type: 'game'|'subscription', game_id?, plan?, subtotal }
    Returns: { valid: bool, discount_amount?: int, error?: str }
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    code = (data.get("code") or "").strip()
    order_type = data.get("order_type")
    subtotal = data.get("subtotal")

    if not code:
        return jsonify({"valid": False, "error": "Kode promo kosong"}), 400
    if order_type not in ("game", "subscription"):
        return jsonify({"valid": False, "error": "order_type must be 'game' or 'subscription'"}), 400
    if not isinstance(subtotal, int) or subtotal <= 0:
        return jsonify({"valid": False, "error": "subtotal must be a positive integer"}), 400

    promo, discount, err = validate_promo_code(
        code, user_id, subtotal, order_type,
        game_id=data.get("game_id"),
        plan=data.get("plan"),
    )
    if err:
        return jsonify({"valid": False, "error": err}), 200  # 200 so frontend can show message

    return jsonify({
        "valid": True,
        "discount_amount": discount,
        "code": promo.code,
        "discount_type": promo.discount_type,
        "discount_value": promo.discount_value,
    }), 200
```

- [ ] **Step 3: Verify**

```bash
cd backend && python -c "from app.store.pricing import validate_promo_code, compute_final_amount; from app.store.routes import validate_promo; print('pricing helpers OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/store/pricing.py backend/app/store/routes.py
git commit -m "feat: promo code validation endpoint + shared pricing helper"
```

---

### Task 4: Integrate promo + credit into order/subscription creation

**Files:**
- Modify: `backend/app/store/routes.py` — `create_order` (around line 596) and `subscribe` (around line 166)

- [ ] **Step 1: Update `create_order` to accept promo + credit**

Find the `create_order` function. Accept `promo_code` and `apply_credit` from the request body. Compute subtotal from the game price, then use `compute_final_amount` to get the final breakdown. Store all discount fields on the order. Deduct credit + insert `PromoCodeUsage` atomically.

Locate this section (around line 596 where `create_order` starts):

After the existing availability check and before the Midtrans `create_transaction` call, add pricing computation:

```python
    # ----- Compute pricing with promo + referral credit -----
    from app.store.pricing import compute_final_amount

    subtotal = game.price
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    # First-order referee auto-discount (applied before promo)
    user_obj = db.session.get(User, user_id)
    first_order_discount = 0
    if user_obj and user_obj.referred_by_user_id and not Order.query.filter_by(user_id=user_id, status="fulfilled").first():
        referee_pct = int(SiteSetting.get("referral_referee_discount_pct") or "10")
        first_order_discount = int(subtotal * referee_pct / 100)

    subtotal_after_first_order = subtotal - first_order_discount

    pricing = compute_final_amount(
        subtotal=subtotal_after_first_order,
        user_id=user_id,
        promo_code=promo_code_input,
        apply_credit=apply_credit,
        order_type="game",
        game_id=game.id,
    )
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["total"]
```

Then in the Order() construction, replace the `amount=...` field with the full breakdown:

```python
    order = Order(
        user_id=user_id,
        game_id=game.id,
        status="pending_payment",
        type="purchase",
        midtrans_order_id=midtrans_order_id,
        amount_subtotal=subtotal,
        promo_discount=pricing["promo_discount"] + first_order_discount,  # bundle both for display
        credit_applied=pricing["credit_applied"],
        amount=final_amount,
        promo_code_id=pricing["promo_code_id"],
    )
```

After `db.session.add(order)` and `db.session.flush()`, before the Midtrans snap creation:

```python
    # Deduct credit from user + insert PromoCodeUsage row (if promo applied)
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            order_id=order.id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)
```

Also handle the zero-amount edge case (when credit + discounts cover full price):

Right before the Midtrans `create_transaction` call, add:

```python
    # If credit + promos cover the full price, auto-fulfill without payment
    if final_amount == 0:
        order.payment_type = "credit"
        order.paid_at = datetime.now(timezone.utc)
        success = _fulfill_order(order)
        if not success:
            order.status = "fulfilled"
        db.session.commit()
        return jsonify({
            "message": "Order fulfilled via credit/discount",
            "order": order.to_dict(),
            "payment_mode": "credit",
        }), 201
```

Import `SiteSetting` + `PromoCodeUsage` at the top of `store/routes.py` if not already imported:
```python
from app.models import (
    ...,
    PromoCodeUsage,
    SiteSetting,  # already imported
    ...,
)
```

- [ ] **Step 2: Update `subscribe` to accept promo + credit**

Find the `subscribe` function (around line 166). Apply the same pattern: compute subtotal from the plan price, run `compute_final_amount`, store all fields on the Subscription, deduct credit, log PromoCodeUsage.

Add after the existing price lookup (around line 193-196 where `price` is read):

```python
    # ----- Compute pricing with promo + referral credit -----
    from app.store.pricing import compute_final_amount

    subtotal = price
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    pricing = compute_final_amount(
        subtotal=subtotal,
        user_id=user_id,
        promo_code=promo_code_input,
        apply_credit=apply_credit,
        order_type="subscription",
        plan=plan,
    )
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["total"]
```

Then update the Subscription(...) construction to include the new fields:

```python
    sub = Subscription(
        user_id=user_id,
        plan=plan,
        amount=final_amount,
        amount_subtotal=subtotal,
        promo_discount=pricing["promo_discount"],
        credit_applied=pricing["credit_applied"],
        promo_code_id=pricing["promo_code_id"],
        midtrans_order_id=midtrans_order_id,
    )
```

After `db.session.flush()`, add the same credit-deduction + PromoCodeUsage pattern:

```python
    user_obj = db.session.get(User, user_id)
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            subscription_id=sub.id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)
```

Handle zero-amount edge case before Midtrans creation (subscriptions can be 100% covered by lifetime credit):

```python
    if final_amount == 0:
        sub.payment_type = "credit"
        sub.paid_at = datetime.now(timezone.utc)
        sub.activate()
        db.session.commit()
        return jsonify({
            "message": "Subscription activated via credit/discount",
            "subscription": sub.to_dict(include_snap_token=True),
            "payment_mode": "credit",
        }), 201
```

- [ ] **Step 3: Verify**

```bash
cd backend && python -c "from app.store.routes import create_order, subscribe; print('endpoints OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat: apply promo code + referral credit during order creation"
```

---

### Task 5: Referral endpoints + register flow

**Files:**
- Modify: `backend/app/auth/routes.py` — `register` endpoint
- Modify: `backend/app/store/routes.py` — add referral endpoints

- [ ] **Step 1: Update `register` to accept referral_code**

In `backend/app/auth/routes.py`, find the `register` function. Before the `db.session.commit()` call, add referral handling:

Locate the block that creates the user:
```python
    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
```

Add after `db.session.flush()`:

```python
    # Generate unique referral code for this user
    import secrets, string
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        candidate = ''.join(secrets.choice(alphabet) for _ in range(6))
        if not User.query.filter_by(referral_code=candidate).first():
            user.referral_code = candidate
            break

    # Apply referrer link if referral_code was provided
    input_ref = (data.get("referral_code") or "").strip().upper()
    if input_ref:
        referrer = User.query.filter_by(referral_code=input_ref).first()
        if referrer and referrer.id != user.id and referrer.email != user.email:
            user.referred_by_user_id = referrer.id
        # If invalid/self/same-email, silently skip — soft error (don't block registration)
```

- [ ] **Step 2: Add referral endpoints in `store/routes.py`**

Append near the promo endpoints:

```python
# ---------------------------------------------------------------------------
# Referral (user-facing)
# ---------------------------------------------------------------------------


@store_bp.route("/referral/validate", methods=["POST"])
def validate_referral():
    """Validate a referral code at registration time. Does not require auth.

    Body: { code }
    Returns: { valid: bool, referrer_name?: str, error?: str }
    """
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    if not code:
        return jsonify({"valid": False, "error": "Kode referral kosong"}), 400

    referrer = User.query.filter_by(referral_code=code).first()
    if not referrer:
        return jsonify({"valid": False, "error": "Kode referral tidak ditemukan"}), 200

    # Mask email for privacy
    email = referrer.email
    at_idx = email.find("@")
    masked = email[0] + "***" + email[at_idx:] if at_idx > 1 else email

    return jsonify({"valid": True, "referrer_name": masked}), 200


@store_bp.route("/my-referral", methods=["GET"])
@jwt_required()
def my_referral():
    """Return the current user's referral code, credit, and referral list."""
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # List of users who used this user's code
    referred_users = User.query.filter_by(referred_by_user_id=user_id).all()
    rewards_by_referee = {
        r.referee_user_id: r
        for r in ReferralReward.query.filter_by(referrer_user_id=user_id).all()
    }

    referrals = []
    total_earned = 0
    for ref_user in referred_users:
        reward = rewards_by_referee.get(ref_user.id)
        at_idx = ref_user.email.find("@")
        masked = ref_user.email[0] + "***" + ref_user.email[at_idx:] if at_idx > 1 else ref_user.email
        status = "rewarded" if reward else "pending"
        referrals.append({
            "email_masked": masked,
            "joined_at": ref_user.created_at.isoformat(),
            "status": status,
            "credit_awarded": reward.credit_awarded if reward else 0,
        })
        if reward:
            total_earned += reward.credit_awarded

    return jsonify({
        "code": user.referral_code,
        "credit": user.referral_credit,
        "referrals": referrals,
        "total_earned": total_earned,
    }), 200
```

Also need to import `ReferralReward` at the top of `store/routes.py`:
```python
from app.models import (..., ReferralReward, ...)
```

- [ ] **Step 3: Verify**

```bash
cd backend && python -c "from app.auth.routes import register; from app.store.routes import validate_referral, my_referral; print('endpoints OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/auth/routes.py backend/app/store/routes.py
git commit -m "feat: referral code endpoints + register flow integration"
```

---

### Task 6: Referrer reward trigger on order fulfillment

**Files:**
- Modify: `backend/app/store/routes.py` — locate `_fulfill_order` helper and add post-fulfillment hook

- [ ] **Step 1: Locate `_fulfill_order`**

Find `_fulfill_order` in `backend/app/store/routes.py` (used by `create_order` and `confirm_manual_payment`). Add a helper function before it:

```python
def _maybe_award_referrer(order_or_sub, is_subscription=False):
    """If the order's user was referred AND this is their first fulfilled
    payment above the min threshold, award the referrer.
    """
    user = db.session.get(User, order_or_sub.user_id)
    if not user or not user.referred_by_user_id:
        return

    # Skip if reward was already given for this referee
    existing = ReferralReward.query.filter_by(referee_user_id=user.id).first()
    if existing:
        return

    # Check min order threshold
    min_order = int(SiteSetting.get("referral_min_order") or "50000")
    paid_amount = order_or_sub.amount_subtotal or order_or_sub.amount or 0
    if paid_amount < min_order:
        return

    # Check this is the first fulfilled payment (looking at both orders + subs)
    has_prior_order = Order.query.filter(
        Order.user_id == user.id,
        Order.status == "fulfilled",
        Order.id != (order_or_sub.id if not is_subscription else -1),
    ).first()
    has_prior_sub = Subscription.query.filter(
        Subscription.user_id == user.id,
        Subscription.status == "active",
        Subscription.id != (order_or_sub.id if is_subscription else -1),
    ).first()
    if has_prior_order or has_prior_sub:
        return

    # Award referrer
    credit_amount = int(SiteSetting.get("referral_referrer_credit") or "10000")
    referrer = db.session.get(User, user.referred_by_user_id)
    if not referrer:
        return

    referrer.referral_credit = (referrer.referral_credit or 0) + credit_amount
    reward = ReferralReward(
        referrer_user_id=referrer.id,
        referee_user_id=user.id,
        trigger_order_id=order_or_sub.id if not is_subscription else None,
        trigger_subscription_id=order_or_sub.id if is_subscription else None,
        credit_awarded=credit_amount,
    )
    db.session.add(reward)
```

- [ ] **Step 2: Call the helper in `_fulfill_order`**

Inside `_fulfill_order`, after the status is set to `fulfilled` but before the final commit (the exact location depends on the existing code — typically at the end of the function after all the assignment/status updates). Add:

```python
    _maybe_award_referrer(order, is_subscription=False)
```

- [ ] **Step 3: Call the helper in the subscription activation path**

Find `confirm_subscription_payment` in `admin/routes.py` and the `subscribe` function in `store/routes.py` where it handles the `final_amount == 0` zero-amount case (added in Task 4). In both places, after `sub.activate()`, call:

```python
    from app.store.routes import _maybe_award_referrer
    _maybe_award_referrer(sub, is_subscription=True)
```

Note: if the helper isn't accessible from `admin/routes.py`, move it into a shared module (e.g., `backend/app/store/referral.py`) OR keep in `store/routes.py` and use a late import like `from app.store.routes import _maybe_award_referrer`.

- [ ] **Step 4: Verify**

```bash
cd backend && python -c "from app.store.routes import _maybe_award_referrer, _fulfill_order; print('hooks OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/store/routes.py backend/app/admin/routes.py
git commit -m "feat: award referrer on referee first-fulfillment"
```

---

### Task 7: Admin referrals tracking endpoint

**Files:**
- Modify: `backend/app/admin/routes.py`

- [ ] **Step 1: Add endpoint**

Append at end of `admin/routes.py`:

```python
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
```

- [ ] **Step 2: Verify + commit**

```bash
cd backend && python -c "from app.admin.routes import list_referrals; print('OK')"
git add backend/app/admin/routes.py
git commit -m "feat: admin endpoint to list referral rewards"
```

---

### Task 8: Frontend API client methods

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add methods + types**

Add these type exports (place near existing `Subscription`, `Order` types):

```ts
export interface PromoCode {
  id: number
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  scope: string
  min_order_amount: number
  max_uses_total: number | null
  max_uses_per_user: number
  expires_at: string | null
  is_active: boolean
  created_at: string
  uses_count?: number
}

export interface PromoCodeUsage {
  id: number
  promo_code_id: number
  user_id: number
  order_id: number | null
  subscription_id: number | null
  discount_amount: number
  used_at: string
  user_email?: string | null
}

export interface MyReferralResponse {
  code: string
  credit: number
  total_earned: number
  referrals: Array<{
    email_masked: string
    joined_at: string
    status: 'pending' | 'rewarded'
    credit_awarded: number
  }>
}

export interface PromoValidateResponse {
  valid: boolean
  discount_amount?: number
  code?: string
  discount_type?: 'percentage' | 'fixed'
  discount_value?: number
  error?: string
}
```

In `storeApi`, add:

```ts
  validatePromoCode(params: { code: string; order_type: 'game' | 'subscription'; subtotal: number; game_id?: number; plan?: string }) {
    return request<PromoValidateResponse>('/api/store/promo-codes/validate', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },
  validateReferralCode(code: string) {
    return request<{ valid: boolean; referrer_name?: string; error?: string }>('/api/store/referral/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },
  getMyReferral() {
    return request<MyReferralResponse>('/api/store/my-referral')
  },
```

In `adminApi`, add:

```ts
  getPromoCodes() {
    return request<{ promo_codes: PromoCode[] }>('/api/admin/promo-codes')
  },
  createPromoCode(data: Partial<PromoCode>) {
    return request<{ promo_code: PromoCode }>('/api/admin/promo-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  updatePromoCode(id: number, data: Partial<PromoCode>) {
    return request<{ promo_code: PromoCode }>(`/api/admin/promo-codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },
  deletePromoCode(id: number) {
    return request<{ message: string }>(`/api/admin/promo-codes/${id}`, { method: 'DELETE' })
  },
  getPromoCodeUsages(id: number) {
    return request<{ usages: PromoCodeUsage[]; total_discount: number }>(`/api/admin/promo-codes/${id}/usages`)
  },
  getReferrals() {
    return request<{ referrals: any[]; total_credit_awarded: number; total_count: number }>('/api/admin/referrals')
  },
```

Also update `subscribe()` and `createOrder()` methods to accept promo + credit options:

```ts
  subscribe(plan: string, options?: { promo_code?: string; apply_credit?: boolean }) {
    return request<{ subscription: Subscription; payment_mode: string; snap_token?: string; manual_info?: any }>(
      '/api/store/subscription/subscribe',
      { method: 'POST', body: JSON.stringify({ plan, ...(options || {}) }) }
    )
  },
```

For `createOrder`, find the existing method and extend similarly. (The existing signature may need preserving — be additive.)

- [ ] **Step 2: Typecheck**

```bash
cd frontend && pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: api client methods for promo codes and referral"
```

---

### Task 9: CheckoutReviewModal shared component

**Files:**
- Create: `frontend/src/components/CheckoutReviewModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Switch from '@mui/material/Switch'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'

import { storeApi, formatIDR } from '@/lib/api'

export interface CheckoutItem {
  type: 'game' | 'subscription'
  label: string
  imageUrl?: string
  subtotal: number
  gameId?: number
  plan?: string
}

interface Props {
  open: boolean
  onClose: () => void
  item: CheckoutItem
  onConfirm: (args: { promo_code: string | null; apply_credit: boolean }) => Promise<void>
  isSubmitting: boolean
}

const CheckoutReviewModal = ({ open, onClose, item, onConfirm, isSubmitting }: Props) => {
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [applyCredit, setApplyCredit] = useState(true)

  const { data: referralData } = useQuery({
    queryKey: ['my-referral'],
    queryFn: () => storeApi.getMyReferral(),
    enabled: open,
  })

  const credit = referralData?.credit ?? 0
  const promoDiscount = appliedPromo?.discount ?? 0
  const interimTotal = Math.max(0, item.subtotal - promoDiscount)
  const creditApplied = applyCredit ? Math.min(credit, interimTotal) : 0
  const finalTotal = Math.max(0, interimTotal - creditApplied)

  useEffect(() => {
    if (!open) {
      setPromoInput('')
      setAppliedPromo(null)
      setPromoError('')
      setApplyCredit(true)
    }
  }, [open])

  const handleApplyPromo = async () => {
    const code = promoInput.trim()
    if (!code) return
    setPromoLoading(true)
    setPromoError('')
    try {
      const res = await storeApi.validatePromoCode({
        code,
        order_type: item.type,
        subtotal: item.subtotal,
        game_id: item.gameId,
        plan: item.plan,
      })
      if (res.valid && res.discount_amount) {
        setAppliedPromo({ code: res.code!, discount: res.discount_amount })
        setPromoError('')
      } else {
        setPromoError(res.error || 'Kode promo tidak valid')
        setAppliedPromo(null)
      }
    } catch (e: any) {
      setPromoError(e.message || 'Gagal validasi kode')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    setPromoError('')
  }

  const handleConfirm = () => {
    onConfirm({
      promo_code: appliedPromo?.code ?? null,
      apply_credit: applyCredit,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Review Pesanan</DialogTitle>
      <DialogContent dividers>
        {/* Item summary */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          {item.imageUrl && (
            <Box component='img' src={item.imageUrl} alt={item.label}
              sx={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 1 }}
            />
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{item.label}</Typography>
            <Typography variant='body2' color='text.secondary'>Subtotal: {formatIDR(item.subtotal)}</Typography>
          </Box>
        </Box>

        {/* Promo code input */}
        <Box sx={{ mb: 3 }}>
          <Typography variant='subtitle2' sx={{ mb: 1 }}>Kode Promo</Typography>
          {appliedPromo ? (
            <Alert severity='success' action={
              <Button size='small' onClick={handleRemovePromo}>Hapus</Button>
            }>
              Kode <strong>{appliedPromo.code}</strong> dipakai — diskon {formatIDR(appliedPromo.discount)}
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size='small'
                value={promoInput}
                onChange={e => setPromoInput(e.target.value.toUpperCase())}
                placeholder='DIKAMAIN'
                fullWidth
                disabled={promoLoading}
              />
              <Button
                variant='outlined'
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoInput.trim()}
              >
                {promoLoading ? 'Cek...' : 'Apply'}
              </Button>
            </Box>
          )}
          {promoError && <Alert severity='error' sx={{ mt: 1 }}>{promoError}</Alert>}
        </Box>

        {/* Credit toggle */}
        {credit > 0 && (
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(201,168,76,0.1)', borderRadius: 2 }}>
            <Box>
              <Typography variant='subtitle2'>Credit: {formatIDR(credit)}</Typography>
              <Typography variant='caption' color='text.secondary'>
                {applyCredit ? `Akan dipakai ${formatIDR(creditApplied)}` : 'Tidak dipakai'}
              </Typography>
            </Box>
            <Switch checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} />
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Price breakdown */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography color='text.secondary'>Subtotal</Typography>
            <Typography>{formatIDR(item.subtotal)}</Typography>
          </Box>
          {promoDiscount > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
              <Typography>Diskon Promo</Typography>
              <Typography>-{formatIDR(promoDiscount)}</Typography>
            </Box>
          )}
          {creditApplied > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
              <Typography>Credit Dipakai</Typography>
              <Typography>-{formatIDR(creditApplied)}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{formatIDR(finalTotal)}</Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} disabled={isSubmitting}>Batal</Button>
        <Button
          variant='contained'
          onClick={handleConfirm}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? 'Proses...' : finalTotal === 0 ? 'Konfirmasi (Gratis)' : 'Lanjut Bayar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CheckoutReviewModal
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CheckoutReviewModal.tsx
git commit -m "feat: shared CheckoutReviewModal for promo + credit review"
```

---

### Task 10: Integrate CheckoutReviewModal on game detail + subscribe pages

**Files:**
- Modify: `frontend/src/views/game/` (the game detail view — verify exact filename via `ls`)
- Modify: `frontend/src/views/SubscribePage.tsx`

- [ ] **Step 1: Identify the game detail view**

```bash
ls frontend/src/views/game/
```

Open the main game detail page component. Look for the existing "Buy" / "Beli" button handler that calls `storeApi.createOrder(...)`.

- [ ] **Step 2: Wire modal into game detail page**

Import the modal:
```tsx
import CheckoutReviewModal from '@/components/CheckoutReviewModal'
```

Replace the direct `createOrder` call with modal open. Pattern:

```tsx
const [modalOpen, setModalOpen] = useState(false)
const [submitting, setSubmitting] = useState(false)

const handleBuyClick = () => setModalOpen(true)

const handleConfirmPurchase = async ({ promo_code, apply_credit }: { promo_code: string | null; apply_credit: boolean }) => {
  setSubmitting(true)
  try {
    const result = await storeApi.createOrder(game.appid, {
      promo_code: promo_code ?? undefined,
      apply_credit,
    })
    // existing redirect logic: router.push(`/order/${result.order.id}`)
    router.push(`/order/${result.order.id}`)
  } catch (err: any) {
    setError(err.message || 'Gagal membuat pesanan')
  } finally {
    setSubmitting(false)
    setModalOpen(false)
  }
}
```

At the bottom of the return JSX (before closing root):

```tsx
<CheckoutReviewModal
  open={modalOpen}
  onClose={() => setModalOpen(false)}
  item={{
    type: 'game',
    label: game.name,
    imageUrl: gameHeaderImage(game.appid),
    subtotal: game.price,
    gameId: game.id,
  }}
  onConfirm={handleConfirmPurchase}
  isSubmitting={submitting}
/>
```

- [ ] **Step 3: Wire modal into SubscribePage**

In `frontend/src/views/SubscribePage.tsx`, replace the current `handleSubscribe` function.

Add state:
```tsx
const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
const [modalOpen, setModalOpen] = useState(false)
const [submitting, setSubmitting] = useState(false)
```

Change the plan button's onClick to open the modal instead of immediately subscribing:
```tsx
onClick={() => { setSelectedPlan(plan.plan); setModalOpen(true) }}
```

Add confirm handler:
```tsx
const handleConfirmSubscribe = async ({ promo_code, apply_credit }: { promo_code: string | null; apply_credit: boolean }) => {
  if (!selectedPlan) return
  setSubmitting(true)
  try {
    const result = await storeApi.subscribe(selectedPlan, { promo_code: promo_code ?? undefined, apply_credit })
    router.push(`/subscription/${result.subscription.id}`)
  } catch (err: any) {
    setError(err.message || 'Failed to subscribe')
  } finally {
    setSubmitting(false)
    setModalOpen(false)
  }
}
```

Before the final `</div>`/`</Snackbar>`:
```tsx
{selectedPlan && (
  <CheckoutReviewModal
    open={modalOpen}
    onClose={() => setModalOpen(false)}
    item={{
      type: 'subscription',
      label: `Playfast ${plans.find(p => p.plan === selectedPlan)?.label ?? selectedPlan}`,
      subtotal: plans.find(p => p.plan === selectedPlan)?.price ?? 0,
      plan: selectedPlan,
    }}
    onConfirm={handleConfirmSubscribe}
    isSubmitting={submitting}
  />
)}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
git add frontend/src/views/
git commit -m "feat: checkout review modal on game detail + subscribe pages"
```

---

### Task 11: Register page — referral code field

**Files:**
- Modify: `frontend/src/views/RegisterPage.tsx`

- [ ] **Step 1: Add state + validation**

Add state near other form state:
```tsx
const [referralCode, setReferralCode] = useState('')
const [referralValidation, setReferralValidation] = useState<{ valid: boolean; message: string } | null>(null)
```

Add a blur handler that calls `storeApi.validateReferralCode`:
```tsx
const handleReferralBlur = async () => {
  const code = referralCode.trim().toUpperCase()
  if (!code) { setReferralValidation(null); return }
  try {
    const res = await storeApi.validateReferralCode(code)
    if (res.valid) {
      setReferralValidation({ valid: true, message: `Kode valid — kamu akan di-refer oleh ${res.referrer_name}` })
    } else {
      setReferralValidation({ valid: false, message: res.error || 'Kode tidak ditemukan' })
    }
  } catch {
    setReferralValidation({ valid: false, message: 'Gagal validasi kode' })
  }
}
```

- [ ] **Step 2: Add the field + send it with register submit**

In the form JSX, add below the password confirm field:

```tsx
<TextField
  label='Kode Referral (opsional)'
  value={referralCode}
  onChange={e => setReferralCode(e.target.value.toUpperCase())}
  onBlur={handleReferralBlur}
  fullWidth
  margin='normal'
  placeholder='e.g. ARIF2X4K'
  helperText={referralValidation?.message || 'Kalau kamu dapet kode dari temen, masukin di sini buat diskon first order'}
  error={referralValidation?.valid === false}
  FormHelperTextProps={{ sx: { color: referralValidation?.valid ? 'success.main' : undefined } }}
/>
```

Pass referral_code in the register body — find the `register` API call and add:
```tsx
await authApi.register(email, password, referralCode.trim().toUpperCase() || undefined)
```

You may need to extend `authApi.register` to accept an optional third parameter. Find it in `api.ts` and add:

```ts
register(email: string, password: string, referral_code?: string) {
  return request(...)  // add referral_code to body
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
git add frontend/src/views/RegisterPage.tsx frontend/src/lib/api.ts
git commit -m "feat: referral code field on register page"
```

---

### Task 12: Admin — Promo Codes page

**Files:**
- Create: `frontend/src/views/admin/AdminPromoCodesPage.tsx`
- Create: `frontend/src/app/(dashboard)/admin/promo-codes/page.tsx`

- [ ] **Step 1: Create the route wrapper**

```tsx
// frontend/src/app/(dashboard)/admin/promo-codes/page.tsx
import type { Metadata } from 'next'
import AdminPromoCodesPage from '@/views/admin/AdminPromoCodesPage'

export const metadata: Metadata = { title: 'Promo Codes - Playfast Admin' }

export default function Page() {
  return <AdminPromoCodesPage />
}
```

- [ ] **Step 2: Create the view**

Create `frontend/src/views/admin/AdminPromoCodesPage.tsx` with these features:
- List all promo codes in a table (code, type, value, scope, uses / max, status, expires)
- "Create Promo" button → modal form
- Each row has: edit, deactivate, view usages, delete buttons
- Clicking "view usages" opens a sub-panel/modal showing the usages table

Full code (large — use MUI Table, Dialog, TextField, Select patterns matching existing admin pages like AdminAccountsPage):

```tsx
'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Switch from '@mui/material/Switch'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

import { adminApi, formatIDR } from '@/lib/api'
import type { PromoCode } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminPromoCodesPage = () => {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [usagesOpen, setUsagesOpen] = useState<number | null>(null)
  const [snack, setSnack] = useState('')

  const [newCode, setNewCode] = useState({
    code: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    scope: 'all',
    min_order_amount: 0,
    max_uses_total: null as number | null,
    max_uses_per_user: 1,
    is_active: true,
  })

  const { data } = useQuery({
    queryKey: ['admin-promo-codes'],
    queryFn: () => adminApi.getPromoCodes(),
    enabled: user?.role === 'admin',
  })

  const createMut = useMutation({
    mutationFn: (d: any) => adminApi.createPromoCode(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      setCreateOpen(false)
      setSnack('Promo code created')
      setNewCode({ ...newCode, code: '', description: '' })
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      adminApi.updatePromoCode(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promo-codes'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deletePromoCode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      setSnack('Deleted')
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const { data: usagesData } = useQuery({
    queryKey: ['promo-usages', usagesOpen],
    queryFn: () => adminApi.getPromoCodeUsages(usagesOpen!),
    enabled: usagesOpen !== null,
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const codes = data?.promo_codes ?? []

  const formatValue = (c: PromoCode) =>
    c.discount_type === 'percentage' ? `${c.discount_value}%` : formatIDR(c.discount_value)

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant='h4'>Promo Codes</Typography>
        <Button variant='contained' onClick={() => setCreateOpen(true)}>Create Promo</Button>
      </Box>

      <Card>
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Discount</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell align='center'>Uses</TableCell>
                <TableCell align='center'>Active</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {codes.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.code}</Typography>
                    {c.description && (
                      <Typography variant='caption' color='text.secondary'>{c.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatValue(c)}</TableCell>
                  <TableCell>{c.scope}</TableCell>
                  <TableCell align='center'>
                    {c.uses_count ?? 0}{c.max_uses_total ? `/${c.max_uses_total}` : ''}
                  </TableCell>
                  <TableCell align='center'>
                    <Switch
                      checked={c.is_active}
                      onChange={() => toggleActiveMut.mutate({ id: c.id, is_active: !c.is_active })}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <Button size='small' onClick={() => setUsagesOpen(c.id)}>Usages</Button>
                    <IconButton color='error' size='small' onClick={() => {
                      if (confirm(`Delete ${c.code}?`)) deleteMut.mutate(c.id)
                    }}>
                      <i className='tabler-trash' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Create Promo Code</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label='Code' value={newCode.code} onChange={e => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} fullWidth />
            <TextField label='Description' value={newCode.description} onChange={e => setNewCode({ ...newCode, description: e.target.value })} fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Discount Type</InputLabel>
                <Select
                  value={newCode.discount_type}
                  label='Discount Type'
                  onChange={e => setNewCode({ ...newCode, discount_type: e.target.value as any })}
                >
                  <MenuItem value='percentage'>Percentage (%)</MenuItem>
                  <MenuItem value='fixed'>Fixed (IDR)</MenuItem>
                </Select>
              </FormControl>
              <TextField label='Value' type='number' value={newCode.discount_value} onChange={e => setNewCode({ ...newCode, discount_value: +e.target.value })} fullWidth />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Scope</InputLabel>
              <Select value={newCode.scope} label='Scope' onChange={e => setNewCode({ ...newCode, scope: e.target.value })}>
                <MenuItem value='all'>All items</MenuItem>
                <MenuItem value='games'>Games only</MenuItem>
                <MenuItem value='subscriptions'>Subscriptions only</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label='Min Order (IDR)' type='number' value={newCode.min_order_amount} onChange={e => setNewCode({ ...newCode, min_order_amount: +e.target.value })} fullWidth />
              <TextField label='Max Uses Total' type='number' value={newCode.max_uses_total ?? ''} onChange={e => setNewCode({ ...newCode, max_uses_total: e.target.value ? +e.target.value : null })} fullWidth helperText='Empty = unlimited' />
              <TextField label='Max Per User' type='number' value={newCode.max_uses_per_user} onChange={e => setNewCode({ ...newCode, max_uses_per_user: +e.target.value })} fullWidth />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={() => createMut.mutate(newCode)} disabled={createMut.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Usages dialog */}
      <Dialog open={usagesOpen !== null} onClose={() => setUsagesOpen(null)} maxWidth='md' fullWidth>
        <DialogTitle>
          Usages
          {usagesData && <Typography variant='body2' color='text.secondary'>Total discount given: {formatIDR(usagesData.total_discount)}</Typography>}
        </DialogTitle>
        <DialogContent dividers>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Order/Sub</TableCell>
                <TableCell align='right'>Discount</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(usagesData?.usages ?? []).map(u => (
                <TableRow key={u.id}>
                  <TableCell>{u.user_email ?? '-'}</TableCell>
                  <TableCell>
                    {u.order_id ? `Order #${u.order_id}` : u.subscription_id ? `Sub #${u.subscription_id}` : '-'}
                  </TableCell>
                  <TableCell align='right'>{formatIDR(u.discount_amount)}</TableCell>
                  <TableCell>{new Date(u.used_at).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsagesOpen(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </div>
  )
}

export default AdminPromoCodesPage
```

- [ ] **Step 3: Add nav link in admin menu**

Find the admin navigation component (likely `frontend/src/@menu/...` or similar — check `frontend/src/data/navigation/verticalMenuData.tsx` or related). Add an entry for `/admin/promo-codes` with label "Promo Codes".

If that file is not easily locatable, ask the user.

- [ ] **Step 4: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
git add frontend/src/views/admin/AdminPromoCodesPage.tsx "frontend/src/app/(dashboard)/admin/promo-codes/page.tsx"
git commit -m "feat: admin promo codes management page"
```

---

### Task 13: Admin — Referrals tracking page + User Profile referral dashboard

**Files:**
- Create: `frontend/src/views/admin/AdminReferralsPage.tsx` + route at `frontend/src/app/(dashboard)/admin/referrals/page.tsx`
- Modify: `frontend/src/views/ProfilePage.tsx` — add referral dashboard section

- [ ] **Step 1: Admin referrals page (route + view)**

Route wrapper:
```tsx
// frontend/src/app/(dashboard)/admin/referrals/page.tsx
import type { Metadata } from 'next'
import AdminReferralsPage from '@/views/admin/AdminReferralsPage'

export const metadata: Metadata = { title: 'Referrals - Playfast Admin' }

export default function Page() { return <AdminReferralsPage /> }
```

View:
```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import Alert from '@mui/material/Alert'

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminReferralsPage = () => {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['admin-referrals'],
    queryFn: () => adminApi.getReferrals(),
    enabled: user?.role === 'admin',
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Typography variant='h4'>Referrals</Typography>
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography variant='caption' color='text.secondary'>Total Referrals</Typography>
          <Typography variant='h5'>{data?.total_count ?? 0}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography variant='caption' color='text.secondary'>Total Credit Awarded</Typography>
          <Typography variant='h5'>{formatIDR(data?.total_credit_awarded ?? 0)}</Typography>
        </CardContent></Card>
      </Box>
      <Card>
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Referrer</TableCell>
                <TableCell>Referee</TableCell>
                <TableCell>Trigger</TableCell>
                <TableCell align='right'>Credit</TableCell>
                <TableCell>Awarded</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.referrals ?? []).map((r: any) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.referrer_email}</TableCell>
                  <TableCell>{r.referee_email}</TableCell>
                  <TableCell>
                    {r.trigger_order_id ? `Order #${r.trigger_order_id}` : r.trigger_subscription_id ? `Sub #${r.trigger_subscription_id}` : '-'}
                  </TableCell>
                  <TableCell align='right'>{formatIDR(r.credit_awarded)}</TableCell>
                  <TableCell>{new Date(r.awarded_at).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  )
}

export default AdminReferralsPage
```

Add nav entry for `/admin/referrals` (same location as promo codes nav from Task 12).

- [ ] **Step 2: User profile referral dashboard**

In `frontend/src/views/ProfilePage.tsx`, add a new section. Add query:

```tsx
const { data: refData } = useQuery({
  queryKey: ['my-referral'],
  queryFn: () => storeApi.getMyReferral(),
})
```

In the JSX, add a new Card section (before existing sections or after a natural grouping):

```tsx
<Card sx={{ mb: 3 }}>
  <CardContent>
    <Typography variant='h6' sx={{ mb: 2 }}>Program Referral</Typography>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
      <Box>
        <Typography variant='caption' color='text.secondary'>Kode referral kamu</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant='h6' sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
            {refData?.code ?? '…'}
          </Typography>
          <Button size='small' onClick={() => {
            navigator.clipboard.writeText(refData?.code ?? '')
            setSnack('Kode disalin')
          }}>Copy</Button>
        </Box>
      </Box>
      <Box>
        <Typography variant='caption' color='text.secondary'>Credit balance</Typography>
        <Typography variant='h6'>{formatIDR(refData?.credit ?? 0)}</Typography>
      </Box>
      <Box>
        <Typography variant='caption' color='text.secondary'>Total earned</Typography>
        <Typography variant='h6'>{formatIDR(refData?.total_earned ?? 0)}</Typography>
      </Box>
    </Box>
    <Typography variant='subtitle2' sx={{ mb: 1 }}>Orang yang kamu refer</Typography>
    {(refData?.referrals?.length ?? 0) === 0 ? (
      <Typography color='text.secondary' variant='body2'>Belum ada referral.</Typography>
    ) : (
      <Box component='ul' sx={{ pl: 3, m: 0 }}>
        {refData!.referrals.map((r, i) => (
          <li key={i}>
            <Typography variant='body2'>
              {r.email_masked} — {r.status === 'rewarded' ? `+${formatIDR(r.credit_awarded)}` : 'belum purchase'}
            </Typography>
          </li>
        ))}
      </Box>
    )}
  </CardContent>
</Card>
```

Ensure `storeApi`, `formatIDR`, and `Button`/`Card`/etc. imports are present; snackbar state (`setSnack`) must exist or use a new local state.

- [ ] **Step 3: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
git add frontend/src/views/admin/AdminReferralsPage.tsx "frontend/src/app/(dashboard)/admin/referrals/page.tsx" frontend/src/views/ProfilePage.tsx
git commit -m "feat: admin referrals page + user profile referral dashboard"
```

---

### Task 14: Display promo/credit breakdown on order/subscription detail pages

**Files:**
- Modify: `frontend/src/views/OrderConfirmPage.tsx` — add breakdown display
- Modify: `frontend/src/views/SubscriptionConfirmPage.tsx` — add breakdown display

- [ ] **Step 1: OrderConfirmPage — show breakdown in details card**

Find the details card (`<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>` with Status / Harga / Payment rows). Below "Harga" row, insert conditional rows:

```tsx
{(order.promo_discount ?? 0) > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
    <Typography>Diskon Promo</Typography>
    <Typography>-{formatIDR(order.promo_discount)}</Typography>
  </Box>
)}
{(order.credit_applied ?? 0) > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'error.main' }}>
    <Typography>Credit Dipakai</Typography>
    <Typography>-{formatIDR(order.credit_applied)}</Typography>
  </Box>
)}
```

Update the `Order` TypeScript type in `api.ts` to include the new fields:
```ts
amount_subtotal: number | null
promo_discount: number
credit_applied: number
promo_code_id: number | null
```

- [ ] **Step 2: SubscriptionConfirmPage — same breakdown**

In `frontend/src/views/SubscriptionConfirmPage.tsx` details card, add the same two conditional rows below the "Harga" row. Update the Subscription type with the same 4 new fields.

- [ ] **Step 3: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
git add frontend/src/views/OrderConfirmPage.tsx frontend/src/views/SubscriptionConfirmPage.tsx frontend/src/lib/api.ts
git commit -m "feat: show promo + credit breakdown on order/subscription detail pages"
```

---

## Final Verification

After all tasks, run:

```bash
cd frontend && pnpm tsc --noEmit
cd ../backend && python -c "
from app import create_app
app = create_app()
with app.app_context():
    from app.models import PromoCode, PromoCodeUsage, ReferralReward, User
    from app.store.routes import (
        create_order, subscribe, validate_promo, my_referral,
        validate_referral, _maybe_award_referrer
    )
    from app.admin.routes import (
        list_promo_codes, create_promo_code, update_promo_code,
        delete_promo_code, list_promo_code_usages, list_referrals
    )
    print('all imports OK')
"
```

Both should succeed. Then `git log --oneline HEAD~14..` should show 14 feat commits.

## End-to-End Smoke Test

1. **Admin creates promo code "TEST10" — 10% percentage, scope=all, max_uses=5, max_per_user=1.**
2. **As regular user A:** register normally (no referral code) → verify auto-generated referral code in profile.
3. **As new user B:** register with user A's referral code → verify validation shows "kode valid".
4. **User B clicks Buy on a Rp 60k game** → modal opens → shows subtotal 60k + first-order discount -6k (10%) = 54k → apply TEST10 → additional -5400 → total 48600 → Lanjut Bayar → order created with correct breakdown → QR shown.
5. **Admin marks order as paid** → status fulfilled → backend awards user A Rp 10,000 credit.
6. **User A checks profile** → sees Rp 10,000 credit balance.
7. **User A buys another game Rp 100k** → modal shows credit auto-apply → total 90k.
8. **User B tries to use TEST10 again** → rejected ("sudah pernah pakai").
9. **Admin checks /admin/promo-codes/1/usages** → sees user B's order.
10. **Admin checks /admin/referrals** → sees A→B referral with Rp 10k credit.

## Risk Checklist

- [ ] If `_run_schema_upgrades()` fails on deployment because of a missing column error, the idempotent try/except wrapper should absorb it — verify by running the script twice on a test DB.
- [ ] If the backfill loop hangs on a very large user base, batch it (process 100 users at a time, commit each batch).
- [ ] If the referral discount + promo + credit stack pushes the total to zero, the order creation skips payment entirely — verify `_fulfill_order` handles a zero-amount order correctly (existing code path for subscriber-based access should cover this, but double-check).
- [ ] Frontend modal state: ensure the modal resets cleanly between opens (currently handled via `useEffect` on `open` change).
