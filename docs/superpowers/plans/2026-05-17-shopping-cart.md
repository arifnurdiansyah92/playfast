# Shopping Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User non-Premium bisa kumpulkan beberapa game di cart, lalu checkout dalam 1 transaksi pembayaran. Tiap game tetap jadi Order terpisah (preserve existing fulfillment/refund/assignment logic), digrupkan via `checkout_group_id`.

**Architecture:** New `cart_items` table per-user. `orders.checkout_group_id` column groups related Orders that share 1 payment gateway transaction. Cart checkout endpoint creates N Orders + 1 Midtrans/Tripay transaction. Existing webhook handlers extended via `.all()` lookup to process all Orders in a group atomically.

**Tech Stack:** Flask 3, SQLAlchemy, Flask-JWT-Extended, Midtrans SDK + Tripay, Next.js (App Router), React Query, MUI. Spec: `docs/superpowers/specs/2026-05-17-shopping-cart-design.md`. Codebase tidak punya pytest harness — pakai manual smoke test per task ikut konvensi existing.

---

## File Structure

**Backend:**
- Modify `backend/app/models.py` — add `CartItem` model
- Modify `backend/app/__init__.py` — register `CartItem.__table__.create` + ALTER TABLE orders
- Modify `backend/app/store/pricing.py` — add `compute_cart_amount` helper
- Modify `backend/app/store/routes.py` — add cart endpoints + cart checkout endpoint + modify webhook handlers
- Modify `backend/app/email_service.py` — add `send_cart_welcome_email`

**Frontend:**
- Modify `frontend/src/lib/api.ts` — add `CartItem`, `Cart`, `cartApi`
- Create `frontend/src/views/CartPage.tsx`
- Create `frontend/src/views/CartCheckoutPage.tsx`
- Create `frontend/src/app/(dashboard)/cart/page.tsx`
- Create `frontend/src/app/(dashboard)/cart/checkout/page.tsx`
- Modify `frontend/src/views/GameDetailPage.tsx` (or equivalent) — dual buttons
- Modify `frontend/src/components/layout/horizontal/HorizontalMenu.tsx` — cart icon
- Modify `frontend/src/components/layout/vertical/VerticalMenu.tsx` — cart link

---

## Task 1: DB schema — CartItem model + orders.checkout_group_id

**Files:**
- Modify: `backend/app/models.py` (append CartItem class at end, near EmailLog)
- Modify: `backend/app/__init__.py` (register table + ALTER TABLE statements)

- [ ] **Step 1: Add CartItem model**

Append to `backend/app/models.py` (right before `class EmailLog`):

```python
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
```

- [ ] **Step 2: Register table creation + checkout_group_id column**

In `backend/app/__init__.py`:

a) Append to `alter_statements` list (near other recent ALTERs):

```python
        # Shopping cart: group related orders into one payment transaction
        "ALTER TABLE orders ADD COLUMN checkout_group_id VARCHAR(40)",
        "CREATE INDEX IF NOT EXISTS ix_orders_checkout_group_id ON orders (checkout_group_id)",
```

b) After the EmailLog table creation block at the bottom of `_run_schema_upgrades`, add:

```python
    from app.models import CartItem
    CartItem.__table__.create(db.engine, checkfirst=True)
```

- [ ] **Step 3: Smoke test — backend starts cleanly**

```bash
cd backend && python -c "from app import create_app; app = create_app(); print('OK')"
```

Expected: prints `OK` (DB connect errors tolerated, but model loading must succeed).

Verify table + column via in-memory SQLite if Postgres unreachable:

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db
from app.models import CartItem, Order
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
db.init_app(app)
with app.app_context():
    db.create_all()
    assert 'checkout_group_id' in [c.name for c in Order.__table__.columns]
    assert 'user_id' in [c.name for c in CartItem.__table__.columns]
    assert 'game_id' in [c.name for c in CartItem.__table__.columns]
    print('Schema OK')
"
```

Expected: `Schema OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/__init__.py
git commit -m "feat(cart): CartItem model + orders.checkout_group_id migration"
```

---

## Task 2: CartItem helpers — add/remove/clear

**Files:**
- Modify: `backend/app/models.py` (extend CartItem class with classmethods)

- [ ] **Step 1: Add helper classmethods**

Inside `CartItem` class, after `to_dict`:

```python
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
```

- [ ] **Step 2: Smoke test**

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db
from app.models import CartItem, Game, User
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
db.init_app(app)
with app.app_context():
    db.create_all()
    u = User(email='t@t.com')
    u.set_password('xx')
    g = Game(appid=1, name='G', price=10000)
    db.session.add_all([u, g])
    db.session.commit()
    item1 = CartItem.add_for_user(u.id, g.id)
    item2 = CartItem.add_for_user(u.id, g.id)  # idempotent
    assert item1.id == item2.id, 'add should be idempotent'
    assert len(CartItem.list_for_user(u.id)) == 1
    assert CartItem.remove_for_user(u.id, item1.id) is True
    assert len(CartItem.list_for_user(u.id)) == 0
    CartItem.add_for_user(u.id, g.id)
    assert CartItem.clear_for_user(u.id) == 1
    print('CartItem helpers OK')
"
```

Expected: `CartItem helpers OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(cart): CartItem helper classmethods (add/remove/clear/list)"
```

---

## Task 3: Pricing — compute_cart_amount helper

**Files:**
- Modify: `backend/app/store/pricing.py`

- [ ] **Step 1: Add cart-aware pricing helper**

Append to `backend/app/store/pricing.py`:

```python
def compute_cart_amount(
    cart_items: list,
    user_id: int,
    promo_code: str | None,
    apply_credit: bool,
):
    """Compute final cart amount with promo + first-order discount + credit.

    cart_items is a list of dicts: [{"game_id": int, "unit_price": int}, ...]
    Returns dict with:
        cart_subtotal, first_order_discount, promo_discount, credit_applied,
        cart_total, promo_code_id, per_item_breakdown, error
    per_item_breakdown is a list aligned with cart_items, each containing
    `subtotal`, `discount`, `credit`, `final` so the caller can persist
    prorated values into each Order.
    """
    cart_subtotal = sum(it["unit_price"] for it in cart_items)
    if cart_subtotal <= 0 or not cart_items:
        return {
            "cart_subtotal": 0, "first_order_discount": 0,
            "promo_discount": 0, "credit_applied": 0,
            "cart_total": 0, "promo_code_id": None,
            "per_item_breakdown": [],
            "error": "Cart is empty",
        }

    user = User.query.filter_by(id=user_id).first()
    if not user:
        return {
            "cart_subtotal": cart_subtotal, "first_order_discount": 0,
            "promo_discount": 0, "credit_applied": 0,
            "cart_total": cart_subtotal, "promo_code_id": None,
            "per_item_breakdown": [],
            "error": "User not found",
        }

    # First-order referee discount (one-time, applies only if no fulfilled order yet)
    from app.models import Order, SiteSetting
    first_order_discount = 0
    if user.referred_by_user_id and not Order.query.filter_by(
        user_id=user_id, status="fulfilled"
    ).first():
        referee_pct = int(SiteSetting.get("referral_referee_discount_pct") or "10")
        first_order_discount = int(cart_subtotal * referee_pct / 100)

    interim_after_first = cart_subtotal - first_order_discount

    promo_discount = 0
    promo_code_id = None
    if promo_code:
        promo, discount, err = validate_promo_code(
            promo_code, user_id, interim_after_first, "game"
        )
        if err:
            return {
                "cart_subtotal": cart_subtotal,
                "first_order_discount": 0, "promo_discount": 0,
                "credit_applied": 0, "cart_total": cart_subtotal,
                "promo_code_id": None, "per_item_breakdown": [],
                "error": err,
            }
        promo_discount = discount
        promo_code_id = promo.id

    interim_after_promo = interim_after_first - promo_discount

    credit_applied = 0
    if apply_credit and user.referral_credit > 0:
        credit_applied = min(user.referral_credit, interim_after_promo)

    cart_total = max(0, interim_after_promo - credit_applied)

    # Prorate total discount per item: share = unit_price / cart_subtotal
    total_discount_per_item = first_order_discount + promo_discount
    per_item = []
    accumulated_discount = 0
    accumulated_credit = 0
    for idx, it in enumerate(cart_items):
        is_last = idx == len(cart_items) - 1
        if is_last:
            item_discount = total_discount_per_item - accumulated_discount
            item_credit = credit_applied - accumulated_credit
        else:
            share = it["unit_price"] / cart_subtotal
            item_discount = round(total_discount_per_item * share)
            item_credit = round(credit_applied * share)
            accumulated_discount += item_discount
            accumulated_credit += item_credit
        per_item.append({
            "game_id": it["game_id"],
            "subtotal": it["unit_price"],
            "discount": item_discount,
            "credit": item_credit,
            "final": max(0, it["unit_price"] - item_discount - item_credit),
        })

    return {
        "cart_subtotal": cart_subtotal,
        "first_order_discount": first_order_discount,
        "promo_discount": promo_discount,
        "credit_applied": credit_applied,
        "cart_total": cart_total,
        "promo_code_id": promo_code_id,
        "per_item_breakdown": per_item,
        "error": None,
    }
```

- [ ] **Step 2: Smoke test pricing math**

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db
from app.models import CartItem, Game, User
from app.store.pricing import compute_cart_amount
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
db.init_app(app)
with app.app_context():
    db.create_all()
    u = User(email='t@t.com'); u.set_password('xx'); db.session.add(u); db.session.commit()
    items = [
        {'game_id': 1, 'unit_price': 50000},
        {'game_id': 2, 'unit_price': 75000},
        {'game_id': 3, 'unit_price': 25000},
    ]
    r = compute_cart_amount(items, u.id, None, False)
    assert r['cart_subtotal'] == 150000
    assert r['cart_total'] == 150000
    assert sum(b['final'] for b in r['per_item_breakdown']) == r['cart_total'], \
        'per-item finals must sum to cart_total'
    print('Cart pricing math OK:', r['per_item_breakdown'])
"
```

Expected: `Cart pricing math OK: [...]` with three entries summing to 150000.

- [ ] **Step 3: Commit**

```bash
git add backend/app/store/pricing.py
git commit -m "feat(cart): compute_cart_amount with prorated per-item discounts"
```

---

## Task 4: Cart CRUD endpoints

**Files:**
- Modify: `backend/app/store/routes.py` (append new section)

- [ ] **Step 1: Add imports**

In `backend/app/store/routes.py`, ensure `CartItem` is included in the `from app.models import (...)` block:

```python
from app.models import (
    ...,
    CartItem,
    ...,
)
```

- [ ] **Step 2: Add cart CRUD section**

Append to `backend/app/store/routes.py`:

```python
# ---------------------------------------------------------------------------
# Cart (per-user, DB-persisted)
# ---------------------------------------------------------------------------

CART_MAX_ITEMS = 20


def _user_owns_game(user_id: int, game_id: int) -> bool:
    """Has user already bought + been fulfilled for this game?"""
    return (
        Order.query.filter_by(
            user_id=user_id, game_id=game_id, status="fulfilled"
        ).first()
        is not None
    )


def _user_has_active_subscription(user_id: int) -> bool:
    """Is user currently on an active Premium plan?"""
    now = datetime.now(timezone.utc)
    return (
        Subscription.query.filter(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            Subscription.expires_at > now,
        ).first()
        is not None
    )


@store_bp.route("/cart", methods=["GET"])
@jwt_required()
def get_cart():
    user_id = int(get_jwt_identity())
    items = CartItem.list_for_user(user_id)
    cart_subtotal = sum((it.game.price if it.game else 0) for it in items)
    return jsonify({
        "items": [it.to_dict() for it in items],
        "cart_subtotal": cart_subtotal,
        "item_count": len(items),
    }), 200


@store_bp.route("/cart/items", methods=["POST"])
@jwt_required()
def add_cart_item():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    try:
        game_id = int(data.get("game_id") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid game_id"}), 400
    if game_id <= 0:
        return jsonify({"error": "Invalid game_id"}), 400

    if _user_has_active_subscription(user_id):
        return jsonify({
            "error": "Premium subscriber — semua game sudah bisa langsung dimainkan",
            "code": "premium_active",
        }), 400

    game = db.session.get(Game, game_id)
    if not game or not game.is_enabled:
        return jsonify({"error": "Game tidak tersedia"}), 404

    if _user_owns_game(user_id, game_id):
        return jsonify({
            "error": "Kamu sudah punya akses ke game ini",
            "code": "already_owned",
        }), 400

    current_count = CartItem.query.filter_by(user_id=user_id).count()
    if current_count >= CART_MAX_ITEMS:
        return jsonify({
            "error": f"Keranjang penuh (maks {CART_MAX_ITEMS} game)",
            "code": "cart_full",
        }), 400

    item = CartItem.add_for_user(user_id, game_id)
    return jsonify({
        "item": item.to_dict(),
        "cart_item_count": current_count + (0 if current_count > 0 and CartItem.query.filter_by(
            user_id=user_id, game_id=game_id
        ).count() > 1 else 1),
    }), 201


@store_bp.route("/cart/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
def remove_cart_item(item_id: int):
    user_id = int(get_jwt_identity())
    ok = CartItem.remove_for_user(user_id, item_id)
    if not ok:
        return jsonify({"error": "Item tidak ditemukan"}), 404
    return jsonify({"message": "Removed"}), 200


@store_bp.route("/cart", methods=["DELETE"])
@jwt_required()
def clear_cart():
    user_id = int(get_jwt_identity())
    count = CartItem.clear_for_user(user_id)
    return jsonify({"message": f"Cleared {count} item(s)"}), 200
```

- [ ] **Step 3: Smoke test endpoints**

```bash
cd backend && python -c "
import json
from flask import Flask
from app.extensions import db, jwt
from app.models import CartItem, Game, User, Order
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
app.config['JWT_SECRET_KEY'] = 'test'
db.init_app(app); jwt.init_app(app)
from app.store.routes import store_bp
app.register_blueprint(store_bp)
with app.app_context():
    db.create_all()
    u = User(email='t@t.com'); u.set_password('xx'); db.session.add(u)
    g = Game(appid=1, name='G', price=10000, is_enabled=True); db.session.add(g)
    db.session.commit()
    from flask_jwt_extended import create_access_token
    token = create_access_token(identity=str(u.id))
    c = app.test_client()
    h = {'Authorization': f'Bearer {token}'}
    r = c.get('/api/store/cart', headers=h); assert r.status_code == 200, r.data
    r = c.post('/api/store/cart/items', headers=h, json={'game_id': g.id})
    assert r.status_code == 201, r.data
    r = c.get('/api/store/cart', headers=h)
    body = r.get_json()
    assert body['item_count'] == 1
    item_id = body['items'][0]['id']
    r = c.delete(f'/api/store/cart/items/{item_id}', headers=h)
    assert r.status_code == 200
    r = c.get('/api/store/cart', headers=h)
    assert r.get_json()['item_count'] == 0
    # Test already-owned guard
    o = Order(user_id=u.id, game_id=g.id, status='fulfilled', type='purchase')
    db.session.add(o); db.session.commit()
    r = c.post('/api/store/cart/items', headers=h, json={'game_id': g.id})
    assert r.status_code == 400 and r.get_json().get('code') == 'already_owned', r.data
    print('Cart CRUD endpoints OK')
"
```

Expected: `Cart CRUD endpoints OK`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat(cart): CRUD endpoints (GET / POST item / DELETE item / DELETE clear)"
```

---

## Task 5: Cart checkout endpoint

**Files:**
- Modify: `backend/app/store/routes.py` (append after CRUD endpoints)

- [ ] **Step 1: Add helper + endpoint**

Append to `backend/app/store/routes.py`:

```python
import secrets


def _generate_checkout_group_id(user_id: int) -> str:
    """Generate a readable, collision-safe checkout group id."""
    ts = int(datetime.now(timezone.utc).timestamp())
    suffix = secrets.token_hex(2)  # 4 hex chars
    return f"CG-{ts}-{user_id}-{suffix}"


def _validate_cart_items_for_checkout(user_id: int, items: list) -> tuple[list, list]:
    """Pre-validate cart items at checkout time.

    Returns (valid_items, failed_items). Each failed_item is a dict with
    `game_id` and `reason`.
    """
    valid = []
    failed = []
    for it in items:
        if not it.game or not it.game.is_enabled:
            failed.append({"game_id": it.game_id, "reason": "Game tidak tersedia"})
            continue
        # Has at least one active GameAccount on an active SteamAccount?
        from app.models import GameAccount, SteamAccount
        has_account = (
            GameAccount.query.join(SteamAccount)
            .filter(
                GameAccount.game_id == it.game.id,
                SteamAccount.is_active == True,  # noqa: E712
            )
            .first()
            is not None
        )
        if not has_account:
            failed.append({"game_id": it.game_id, "reason": "Stok akun habis untuk game ini"})
            continue
        if _user_owns_game(user_id, it.game_id):
            failed.append({"game_id": it.game_id, "reason": "Kamu sudah punya game ini"})
            continue
        valid.append(it)
    return valid, failed


@store_bp.route("/checkout-cart", methods=["POST"])
@jwt_required()
def checkout_cart():
    """Checkout the entire cart in a single payment transaction.

    Creates N Orders (one per game), all sharing the same `checkout_group_id`
    and same `midtrans_order_id` / `tripay_reference`. Webhook handler will
    fulfill them atomically when payment is confirmed.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    promo_code_input = (data.get("promo_code") or "").strip() or None
    apply_credit = bool(data.get("apply_credit", True))

    if _user_has_active_subscription(user_id):
        return jsonify({"error": "Premium subscriber — tidak perlu cart"}), 400

    items = CartItem.list_for_user(user_id)
    if not items:
        return jsonify({"error": "Keranjang kosong"}), 400

    valid_items, failed_items = _validate_cart_items_for_checkout(user_id, items)
    if failed_items:
        return jsonify({
            "error": "Beberapa item tidak bisa di-checkout",
            "failed_items": failed_items,
        }), 400

    user_obj = db.session.get(User, user_id)

    pricing_input = [
        {"game_id": it.game.id, "unit_price": it.game.price} for it in valid_items
    ]
    from app.store.pricing import compute_cart_amount
    pricing = compute_cart_amount(pricing_input, user_id, promo_code_input, apply_credit)
    if pricing.get("error"):
        return jsonify({"error": pricing["error"]}), 400

    final_amount = pricing["cart_total"]
    checkout_group_id = _generate_checkout_group_id(user_id)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"CART-{user_id}-{timestamp}"

    # Create N Orders with prorated discounts
    orders = []
    for it, breakdown in zip(valid_items, pricing["per_item_breakdown"]):
        order = Order(
            user_id=user_id,
            game_id=it.game.id,
            status="pending_payment",
            type="purchase",
            midtrans_order_id=midtrans_order_id,
            checkout_group_id=checkout_group_id,
            amount_subtotal=breakdown["subtotal"],
            promo_discount=breakdown["discount"],
            credit_applied=breakdown["credit"],
            amount=breakdown["final"],
            promo_code_id=pricing["promo_code_id"],
        )
        db.session.add(order)
        orders.append(order)
    db.session.flush()

    # One PromoCodeUsage row for the cart (attribute to first order in group)
    if pricing["promo_code_id"]:
        usage = PromoCodeUsage(
            promo_code_id=pricing["promo_code_id"],
            user_id=user_id,
            order_id=orders[0].id,
            discount_amount=pricing["promo_discount"],
        )
        db.session.add(usage)

    # Deduct credit
    if pricing["credit_applied"] > 0:
        user_obj.referral_credit = max(0, user_obj.referral_credit - pricing["credit_applied"])

    # Clear cart (commit happens after gateway interaction)
    CartItem.query.filter_by(user_id=user_id).delete()

    # Zero-total path: auto-fulfill all orders without payment
    if final_amount == 0:
        for order in orders:
            order.payment_type = "credit"
            order.paid_at = datetime.now(timezone.utc)
            success = _fulfill_order(order)
            if not success:
                db.session.rollback()
                return jsonify({"error": "Fulfillment failed for one or more games"}), 503
        db.session.commit()
        return jsonify({
            "message": "Cart fulfilled via credit/discount",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "credit",
            "total": 0,
        }), 201

    payment_mode = SiteSetting.get("payment_mode")
    item_summary = ", ".join((it.game.name or "")[:30] for it in valid_items)[:90]

    if payment_mode == "manual":
        db.session.commit()
        return jsonify({
            "message": "Cart created, awaiting manual payment",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "manual",
            "total": final_amount,
            "manual_info": {
                "qris_image_url": SiteSetting.get("manual_qris_image_url"),
                "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
                "instructions": SiteSetting.get("manual_payment_instructions"),
            },
        }), 201

    if payment_mode == "tripay":
        from app.tripay import service as tripay
        if not tripay.is_configured():
            db.session.rollback()
            return jsonify({"error": "Tripay belum dikonfigurasi"}), 503
        try:
            frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")
            tx = tripay.create_transaction(
                merchant_ref=midtrans_order_id,
                amount=final_amount,
                customer_email=user_obj.email if user_obj else "",
                customer_name=(user_obj.email.split("@")[0] if user_obj and user_obj.email else "Customer"),
                item_name=f"Cart: {item_summary}"[:90],
                callback_url=f"{frontend_url}/callback/tripay",
                return_url=f"{frontend_url}/cart/success?cg={checkout_group_id}",
            )
            for order in orders:
                order.tripay_reference = tx.get("reference")
                order.snap_token = tx.get("checkout_url")
            db.session.commit()
            return jsonify({
                "message": "Cart created, awaiting payment",
                "checkout_group_id": checkout_group_id,
                "orders": [o.to_dict() for o in orders],
                "payment_mode": "tripay",
                "total": final_amount,
                "checkout_url": tx.get("checkout_url"),
                "tripay_reference": tx.get("reference"),
            }), 201
        except Exception as e:
            db.session.rollback()
            logger.exception("Tripay create failed for cart checkout: %s", e)
            return jsonify({"error": f"Payment service error: {type(e).__name__}"}), 502

    # Midtrans mode
    try:
        snap = _get_snap()
        item_details = [
            {
                "id": str(b["game_id"]),
                "price": b["final"] if b["final"] > 0 else 1,  # Midtrans requires price >= 1
                "quantity": 1,
                "name": (next((it.game.name for it in valid_items if it.game.id == b["game_id"]), "Game"))[:50],
            }
            for b in pricing["per_item_breakdown"]
        ]
        # Adjust totals so Midtrans gross_amount matches sum(item_details.price)
        adjust = final_amount - sum(d["price"] for d in item_details)
        if adjust != 0 and item_details:
            item_details[-1]["price"] += adjust
        transaction = snap.create_transaction({
            "transaction_details": {
                "order_id": midtrans_order_id,
                "gross_amount": final_amount,
            },
            "item_details": item_details,
            "customer_details": {
                "email": user_obj.email if user_obj else "",
            },
        })
        snap_token = transaction["token"]
        for order in orders:
            order.snap_token = snap_token
        db.session.commit()
        return jsonify({
            "message": "Cart created, awaiting payment",
            "checkout_group_id": checkout_group_id,
            "orders": [o.to_dict() for o in orders],
            "payment_mode": "midtrans",
            "total": final_amount,
            "snap_token": snap_token,
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.exception("Midtrans cart checkout failed: %s", e)
        return jsonify({"error": "Payment service unavailable"}), 502
```

- [ ] **Step 2: Smoke test checkout endpoint**

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db, jwt
from app.models import CartItem, Game, User, Order, SiteSetting, SteamAccount, GameAccount
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
app.config['JWT_SECRET_KEY'] = 'test'
db.init_app(app); jwt.init_app(app)
from app.store.routes import store_bp
app.register_blueprint(store_bp)
with app.app_context():
    db.create_all()
    u = User(email='t@t.com'); u.set_password('xx'); db.session.add(u)
    sa = SteamAccount(account_name='acc1', mafile_data={}, password='p', is_active=True)
    g1 = Game(appid=1, name='G1', price=50000, is_enabled=True)
    g2 = Game(appid=2, name='G2', price=75000, is_enabled=True)
    db.session.add_all([sa, g1, g2]); db.session.commit()
    db.session.add_all([
        GameAccount(steam_account_id=sa.id, game_id=g1.id),
        GameAccount(steam_account_id=sa.id, game_id=g2.id),
    ])
    db.session.add_all([
        CartItem(user_id=u.id, game_id=g1.id),
        CartItem(user_id=u.id, game_id=g2.id),
    ])
    SiteSetting.set('payment_mode', 'manual')
    db.session.commit()
    from flask_jwt_extended import create_access_token
    token = create_access_token(identity=str(u.id))
    c = app.test_client()
    h = {'Authorization': f'Bearer {token}'}
    r = c.post('/api/store/checkout-cart', headers=h, json={})
    assert r.status_code == 201, r.data
    body = r.get_json()
    assert body['total'] == 125000
    assert len(body['orders']) == 2
    cg = body['checkout_group_id']
    rows = Order.query.filter_by(checkout_group_id=cg).all()
    assert len(rows) == 2
    assert rows[0].midtrans_order_id == rows[1].midtrans_order_id
    assert CartItem.query.filter_by(user_id=u.id).count() == 0, 'cart must be cleared'
    print('Cart checkout OK')
"
```

Expected: `Cart checkout OK`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat(cart): checkout-cart endpoint with prorated pricing + group orders"
```

---

## Task 6: Modify webhook handlers to handle group orders

**Files:**
- Modify: `backend/app/store/routes.py` (Midtrans webhook + Tripay callback)

- [ ] **Step 1: Update Midtrans webhook to process all orders in group**

In `backend/app/store/routes.py`, replace the existing order lookup in `midtrans_webhook` (currently `Order.query.filter_by(midtrans_order_id=order_id).first()`) and the subsequent fulfillment block with a group-aware version.

Find:

```python
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
```

Replace with:

```python
    # Look up orders by midtrans_order_id (could be 1 single-buy order or N cart orders)
    orders = Order.query.filter_by(midtrans_order_id=order_id).all()
    if not orders:
        logger.warning("Midtrans webhook: order not found for %s", order_id)
        return jsonify({"error": "Order not found"}), 404

    is_cart = orders[0].checkout_group_id is not None
    logger.info(
        "Midtrans webhook: order=%s status=%s fraud=%s payment_type=%s order_count=%d cart=%s",
        order_id, transaction_status, fraud_status, payment_type, len(orders), is_cart,
    )

    if transaction_status in ("capture", "settlement"):
        if transaction_status == "capture" and fraud_status not in ("accept", ""):
            logger.warning(
                "Midtrans webhook: fraud detected for %s (fraud_status=%s)",
                order_id, fraud_status,
            )
            for o in orders:
                if o.status == "pending_payment":
                    o.status = "cancelled"
            db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        pending_orders = [o for o in orders if o.status == "pending_payment"]
        for o in pending_orders:
            o.payment_type = payment_type
            o.paid_at = datetime.now(timezone.utc)
        db.session.flush()

        fulfilled_orders = []
        for o in pending_orders:
            success = _fulfill_order(o)
            if not success:
                logger.error(
                    "Midtrans webhook: payment received but fulfillment failed for order %s",
                    o.id,
                )
                o.status = "fulfilled"  # mark fulfilled so admin sees + can rotate
            fulfilled_orders.append(o)
        db.session.commit()

        if is_cart and fulfilled_orders:
            _send_cart_welcome(fulfilled_orders)

        return jsonify({"status": "ok"}), 200

    elif transaction_status in ("cancel", "deny", "expire"):
        for o in orders:
            if o.status == "pending_payment":
                o.status = "cancelled"
        db.session.commit()
        logger.info("Midtrans webhook: orders for %s cancelled (%s)", order_id, transaction_status)
        return jsonify({"status": "cancelled"}), 200
```

- [ ] **Step 2: Update Tripay callback similarly**

In `tripay_callback`, the order lookup currently uses `.first()`. Replace from:

```python
    # Order path — anything else, look up by reference first
    order = (
        Order.query.filter_by(tripay_reference=reference).first()
        or Order.query.filter_by(midtrans_order_id=merchant_ref).first()
    )
    if not order:
        logger.warning("Tripay callback: order not found ref=%s merchant_ref=%s", reference, merchant_ref)
        return jsonify({"success": False, "message": "Order not found"}), 404

    if status == tripay.STATUS_PAID:
        if order.status == "pending_payment":
            if paid_amount and order.amount and paid_amount < order.amount:
                logger.warning(
                    "Tripay callback amount mismatch order %s: expected %s got %s",
                    order.id, order.amount, paid_amount,
                )
                return jsonify({"success": False, "message": "Amount mismatch"}), 400

            order.payment_type = f"tripay:{payment_method}"
            order.paid_at = datetime.now(timezone.utc)
            db.session.flush()

            success = _fulfill_order(order)
            if not success:
                logger.error("Tripay callback: paid but fulfillment failed for order %s", order.id)
                # Mirror the Midtrans path — leave as fulfilled so admin can
                # rotate manually rather than leaving it stuck pending.
```

Read further to find the end of this block — verify the existing pattern continues with marking status fulfilled then returning, then replace the whole block from `order = (...)` down through the matching success/fail return with:

```python
    # Look up order(s) — Tripay returns to single-buy by reference,
    # cart-checkout by merchant_ref. Take all matches in case of cart.
    orders = (
        Order.query.filter_by(tripay_reference=reference).all()
        or Order.query.filter_by(midtrans_order_id=merchant_ref).all()
    )
    if not orders:
        logger.warning("Tripay callback: order not found ref=%s merchant_ref=%s", reference, merchant_ref)
        return jsonify({"success": False, "message": "Order not found"}), 404

    is_cart = orders[0].checkout_group_id is not None
    expected_total = sum(o.amount or 0 for o in orders)

    if status == tripay.STATUS_PAID:
        pending = [o for o in orders if o.status == "pending_payment"]
        if not pending:
            return jsonify({"success": True, "status": "already_processed"}), 200

        if paid_amount and expected_total and paid_amount < expected_total:
            logger.warning(
                "Tripay callback amount mismatch group %s: expected %s got %s",
                merchant_ref, expected_total, paid_amount,
            )
            return jsonify({"success": False, "message": "Amount mismatch"}), 400

        for o in pending:
            o.payment_type = f"tripay:{payment_method}"
            o.paid_at = datetime.now(timezone.utc)
        db.session.flush()

        fulfilled = []
        for o in pending:
            success = _fulfill_order(o)
            if not success:
                logger.error("Tripay callback: paid but fulfillment failed for order %s", o.id)
                o.status = "fulfilled"
            fulfilled.append(o)
        db.session.commit()

        if is_cart and fulfilled:
            _send_cart_welcome(fulfilled)

        return jsonify({"success": True}), 200

    if status in (tripay.STATUS_EXPIRED, tripay.STATUS_FAILED):
        for o in orders:
            if o.status == "pending_payment":
                o.status = "cancelled"
        db.session.commit()
        return jsonify({"success": True}), 200

    return jsonify({"success": True, "status": "ignored"}), 200
```

Important: The existing single-buy flow still works because for non-cart orders, `orders` list has length 1 and the same logic applies. `_send_cart_welcome` is only called when `is_cart=True`.

- [ ] **Step 3: Add stub for `_send_cart_welcome` (real email comes in Task 7)**

Just above the cart CRUD section, add a stub:

```python
def _send_cart_welcome(orders: list):
    """Send a single cart-fulfilled email summarizing all games at once.

    Stub — wired up properly in Task 7. For now just log.
    """
    logger.info("TODO _send_cart_welcome: %d orders", len(orders))
```

This keeps the webhook code compilable for smoke testing. Task 7 replaces the stub with real logic.

- [ ] **Step 4: Smoke test the webhook still works for single-buy and cart**

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db, jwt
from app.models import CartItem, Game, User, Order, SiteSetting, SteamAccount, GameAccount
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
app.config['JWT_SECRET_KEY'] = 'test'
db.init_app(app); jwt.init_app(app)
from app.store.routes import store_bp
app.register_blueprint(store_bp)
with app.app_context():
    db.create_all()
    u = User(email='t@t.com'); u.set_password('xx'); db.session.add(u)
    sa = SteamAccount(account_name='acc1', mafile_data={}, password='p', is_active=True)
    g1 = Game(appid=1, name='G1', price=50000, is_enabled=True)
    g2 = Game(appid=2, name='G2', price=75000, is_enabled=True)
    db.session.add_all([sa, g1, g2]); db.session.commit()
    db.session.add_all([
        GameAccount(steam_account_id=sa.id, game_id=g1.id),
        GameAccount(steam_account_id=sa.id, game_id=g2.id),
    ])
    SiteSetting.set('payment_mode', 'manual')
    db.session.commit()
    # Single-buy: 1 order with checkout_group_id=None
    o = Order(user_id=u.id, game_id=g1.id, status='pending_payment', type='purchase',
              midtrans_order_id='SINGLE-1', amount=50000)
    db.session.add(o); db.session.commit()
    rows = Order.query.filter_by(midtrans_order_id='SINGLE-1').all()
    assert len(rows) == 1 and rows[0].checkout_group_id is None
    # Cart: 2 orders sharing midtrans_order_id
    o1 = Order(user_id=u.id, game_id=g1.id, status='pending_payment', type='purchase',
               midtrans_order_id='CART-1', checkout_group_id='CG-1', amount=50000)
    o2 = Order(user_id=u.id, game_id=g2.id, status='pending_payment', type='purchase',
               midtrans_order_id='CART-1', checkout_group_id='CG-1', amount=75000)
    db.session.add_all([o1, o2]); db.session.commit()
    rows = Order.query.filter_by(midtrans_order_id='CART-1').all()
    assert len(rows) == 2 and all(r.checkout_group_id == 'CG-1' for r in rows)
    print('Group order lookup OK')
"
```

Expected: `Group order lookup OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat(cart): webhook handlers process all orders in checkout group"
```

---

## Task 7: Cart welcome email

**Files:**
- Modify: `backend/app/email_service.py` (add `send_cart_welcome_email`)
- Modify: `backend/app/store/routes.py` (replace `_send_cart_welcome` stub)

- [ ] **Step 1: Add `send_cart_welcome_email` to email_service.py**

Append to `backend/app/email_service.py` (after `send_subscription_welcome_email`):

```python
def send_cart_welcome_email(
    to: str,
    games: list,
    play_base_url: str,
    *,
    user_id: int | None = None,
    checkout_group_id: str | None = None,
):
    """Sent when a cart purchase fulfills successfully — N games in 1 email.

    `games` is a list of dicts: [{"name": str, "order_id": int}, ...]
    Each game gets a row in a table with a per-order play link.
    """
    safety = _play_safety_fragment()
    hero = _hero_block(
        gradient="linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)",
        eyebrow=f"Cart Aktif · {len(games)} Game",
    )

    game_rows = ""
    for g in games:
        play_url = f"{play_base_url}/play/{g['order_id']}"
        game_rows += f"""
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #232743; color: #d8dee6; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 14px;">
            {g['name']}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #232743; text-align: right;">
            <a href="{play_url}" style="color: #c9a84c; text-decoration: none; font-weight: 600; font-size: 13px;">Main →</a>
          </td>
        </tr>"""

    content = f"""\
      {hero}
      <div style="padding: 36px 32px 32px 32px;">
        <h2 style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 0 12px; font-size: 26px; font-weight: 800; line-height: 1.25;">
          Cart kamu sudah aktif!
        </h2>
        <p style="color: #b0b8c4; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
          {len(games)} game sudah ready dimainkan. Klik link di tabel untuk akses tiap game — kredensial Steam ada di halaman main masing-masing.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #131527; border: 1px solid #232743; border-radius: 10px; margin: 0 0 28px;">
          {game_rows}
        </table>
        {safety}
      </div>"""

    metadata = {
        "checkout_group_id": checkout_group_id,
        "game_count": len(games),
        "order_ids": [g["order_id"] for g in games],
    }
    send_email(
        to,
        f"Cart aktif: {len(games)} game ready dimainkan",
        _base_template(content),
        email_type="cart_welcome",
        user_id=user_id,
        metadata=metadata,
    )
```

Also add `"cart_welcome"` as a recognized type in EmailLog. In `backend/app/models.py` inside `EmailLog` class constants section:

```python
    TYPE_CART_WELCOME = "cart_welcome"
```

And update the resend endpoint (Task 6 of the email-logs feature) to either handle or explicitly reject cart_welcome resend. For now, the existing else-branch already returns 400 "Resend not supported for type 'X'" — that's fine for v1.

- [ ] **Step 2: Replace stub in `backend/app/store/routes.py`**

Replace the `_send_cart_welcome` stub from Task 6 with:

```python
def _send_cart_welcome(orders: list):
    """Send a single cart-welcome email summarizing all fulfilled orders.

    All orders must belong to same user + same checkout_group_id.
    """
    if not orders:
        return
    from app.email_service import send_cart_welcome_email
    user = orders[0].user if hasattr(orders[0], "user") else db.session.get(User, orders[0].user_id)
    if not user:
        return
    frontend_url = (current_app.config.get("FRONTEND_URL") or "http://localhost:3000").rstrip("/")
    games = [
        {"name": (o.game.name if o.game else "Game"), "order_id": o.id}
        for o in orders
    ]
    send_cart_welcome_email(
        user.email,
        games,
        play_base_url=frontend_url,
        user_id=user.id,
        checkout_group_id=orders[0].checkout_group_id,
    )
```

- [ ] **Step 3: Smoke test email render**

```bash
cd backend && python -c "
from flask import Flask
from app.extensions import db
from app.models import User, Game
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
app.config.update({'SMTP_HOST':'localhost','SMTP_PORT':25,'SMTP_USER':'','SMTP_PASSWORD':'','MAIL_SENDER':'noreply@playfast.id'})
db.init_app(app)
with app.app_context():
    db.create_all()
    from app.email_service import _base_template, _hero_block, _play_safety_fragment
    # Just verify the function imports and renders (don't actually send)
    from app import email_service
    # Manually call the body generator
    safety = _play_safety_fragment()
    hero = _hero_block(gradient='linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)', eyebrow='Cart Aktif · 2 Game')
    print('Email rendering imports OK, hero length:', len(hero))
"
```

Expected: `Email rendering imports OK, hero length: <number>`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/email_service.py backend/app/store/routes.py backend/app/models.py
git commit -m "feat(cart): cart-welcome email summarizing all fulfilled games"
```

---

## Task 8: Frontend API client + types

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add Cart types**

Near other store-related types in `frontend/src/lib/api.ts` (search for `interface Order` for placement), add:

```typescript
export interface CartItem {
  id: number
  user_id: number
  game_id: number
  game: {
    id: number
    appid: number
    name: string
    price: number
    header_image: string | null
    custom_header_image: string | null
    custom_name: string | null
  } | null
  created_at: string
}

export interface CartResponse {
  items: CartItem[]
  cart_subtotal: number
  item_count: number
}

export interface CartCheckoutBody {
  promo_code?: string
  apply_credit?: boolean
}

export interface CartCheckoutResponse {
  message: string
  checkout_group_id: string
  orders: Order[]
  payment_mode: 'manual' | 'midtrans' | 'tripay' | 'credit'
  total: number
  snap_token?: string
  checkout_url?: string
  tripay_reference?: string
  manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
}
```

(Type `Order` should already exist — verify by searching `interface Order` in the same file. If the existing type has more fields, that's fine, use it.)

- [ ] **Step 2: Add `cartApi` namespace**

After the existing `adminApi` (or `creatorApi`) export, add:

```typescript
export const cartApi = {
  list() {
    return request<CartResponse>('/api/store/cart')
  },

  add(gameId: number) {
    return request<{ item: CartItem; cart_item_count: number }>(
      '/api/store/cart/items',
      { method: 'POST', body: JSON.stringify({ game_id: gameId }) }
    )
  },

  remove(itemId: number) {
    return request<{ message: string }>(`/api/store/cart/items/${itemId}`, { method: 'DELETE' })
  },

  clear() {
    return request<{ message: string }>('/api/store/cart', { method: 'DELETE' })
  },

  checkout(body: CartCheckoutBody) {
    return request<CartCheckoutResponse>('/api/store/checkout-cart', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
```

- [ ] **Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to these changes).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(cart): frontend API types + cartApi methods"
```

---

## Task 9: Cart icon in navbar + Cart pages

**Files:**
- Create: `frontend/src/views/CartPage.tsx`
- Create: `frontend/src/views/CartCheckoutPage.tsx`
- Create: `frontend/src/app/(dashboard)/cart/page.tsx`
- Create: `frontend/src/app/(dashboard)/cart/checkout/page.tsx`
- Modify: `frontend/src/components/layout/horizontal/HorizontalMenu.tsx`
- Modify: `frontend/src/components/layout/vertical/VerticalMenu.tsx`

- [ ] **Step 1: Create `/cart` view**

Create `frontend/src/views/CartPage.tsx`:

```typescript
'use client'

import Link from 'next/link'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

import { cartApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatIDR = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function CartPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => cartApi.remove(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  const clearMutation = useMutation({
    mutationFn: () => cartApi.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  })

  if (!user) return <Alert severity='info'>Login dulu untuk lihat keranjang.</Alert>

  return (
    <div className='flex flex-col gap-4'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>Keranjang</Typography>
        <Typography variant='body2' color='text.secondary'>
          Game yang siap di-checkout. Bayar sekali, semua langsung dimainkan.
        </Typography>
      </Box>

      {isError && <Alert severity='error'>{(error as any)?.message || 'Gagal memuat keranjang'}</Alert>}

      {isLoading && (
        <Card><CardContent><Skeleton variant='rounded' height={120} /></CardContent></Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>Keranjang kosong</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              Mulai jelajahi katalog game di Playfast.
            </Typography>
            <Button component={Link} href='/store' variant='contained' color='warning'>
              Buka Toko
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent>
            {data.items.map((item, idx) => {
              const game = item.game
              if (!game) return null
              const displayName = game.custom_name || game.name
              const image = game.custom_header_image || game.header_image
              return (
                <Box key={item.id}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', py: 2 }}>
                    {image && (
                      <Box
                        component='img'
                        src={image}
                        alt={displayName}
                        sx={{ width: 120, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                      />
                    )}
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{displayName}</Typography>
                      <Typography variant='caption' color='text.secondary'>
                        AppID {game.appid}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, minWidth: 100, textAlign: 'right' }}>
                      {formatIDR(game.price)}
                    </Typography>
                    <IconButton
                      size='small'
                      color='error'
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(item.id)}
                    >
                      <i className='tabler-trash' />
                    </IconButton>
                  </Box>
                  {idx < data.items.length - 1 && <Divider />}
                </Box>
              )
            })}
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant='caption' color='text.secondary'>Subtotal ({data.item_count} game)</Typography>
                <Typography variant='h5' sx={{ fontWeight: 700 }}>{formatIDR(data.cart_subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant='outlined'
                  color='error'
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate()}
                >
                  Kosongkan
                </Button>
                <Button
                  component={Link}
                  href='/cart/checkout'
                  variant='contained'
                  color='warning'
                  size='large'
                >
                  Lanjut Bayar
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `/cart/checkout` view**

Create `frontend/src/views/CartCheckoutPage.tsx`:

```typescript
'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery, useMutation } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'

import { cartApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatIDR = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function CartCheckoutPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [promo, setPromo] = useState('')
  const [applyCredit, setApplyCredit] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [failedItems, setFailedItems] = useState<Array<{ game_id: number; reason: string }> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
  })

  const checkoutMutation = useMutation({
    mutationFn: () => cartApi.checkout({
      promo_code: promo || undefined,
      apply_credit: applyCredit,
    }),
    onSuccess: res => {
      setErrorMsg(null)
      setFailedItems(null)
      if (res.payment_mode === 'midtrans' && res.snap_token) {
        // Open Midtrans Snap
        const w = window as any
        if (w.snap) {
          w.snap.pay(res.snap_token, {
            onSuccess: () => router.push(`/cart/success?cg=${res.checkout_group_id}`),
            onPending: () => router.push(`/cart/success?cg=${res.checkout_group_id}`),
            onError: () => setErrorMsg('Pembayaran gagal'),
          })
        } else {
          setErrorMsg('Midtrans Snap belum di-load')
        }
      } else if (res.payment_mode === 'tripay' && res.checkout_url) {
        window.location.href = res.checkout_url
      } else if (res.payment_mode === 'credit') {
        router.push(`/cart/success?cg=${res.checkout_group_id}`)
      } else {
        // manual mode — show instructions
        router.push(`/cart/success?cg=${res.checkout_group_id}`)
      }
    },
    onError: (err: any) => {
      setFailedItems(err?.body?.failed_items || null)
      setErrorMsg(err?.message || 'Gagal checkout')
    },
  })

  if (!user) return <Alert severity='info'>Login dulu.</Alert>
  if (isLoading) return <Skeleton variant='rounded' height={400} />
  if (!data || data.items.length === 0) {
    return <Alert severity='info'>Keranjang kosong. <a href='/cart'>Kembali ke keranjang</a></Alert>
  }

  return (
    <div className='flex flex-col gap-4'>
      <Typography variant='h4' sx={{ fontWeight: 700 }}>Checkout Keranjang</Typography>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 2 }}>Ringkasan</Typography>
          {data.items.map(item => {
            const game = item.game
            if (!game) return null
            return (
              <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 1 }}>
                <Typography>{game.custom_name || game.name}</Typography>
                <Typography>{formatIDR(game.price)}</Typography>
              </Box>
            )
          })}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Subtotal</Typography>
            <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{formatIDR(data.cart_subtotal)}</Typography>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 2 }}>Promo & Credit</Typography>
          <TextField
            fullWidth
            size='small'
            label='Kode promo (opsional)'
            value={promo}
            onChange={e => setPromo(e.target.value.toUpperCase())}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={<Switch checked={applyCredit} onChange={e => setApplyCredit(e.target.checked)} />}
            label='Pakai referral credit jika tersedia'
          />
        </CardContent>
      </Card>

      {errorMsg && <Alert severity='error'>{errorMsg}</Alert>}
      {failedItems && failedItems.length > 0 && (
        <Alert severity='warning'>
          Beberapa game tidak bisa di-checkout:
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {failedItems.map(f => (
              <li key={f.game_id}>Game #{f.game_id}: {f.reason}</li>
            ))}
          </ul>
          Buka <a href='/cart'>keranjang</a> dan hapus item yang bermasalah, lalu coba lagi.
        </Alert>
      )}

      <Button
        variant='contained'
        color='warning'
        size='large'
        disabled={checkoutMutation.isPending}
        onClick={() => checkoutMutation.mutate()}
        sx={{ alignSelf: 'flex-end', minWidth: 200 }}
      >
        {checkoutMutation.isPending ? 'Memproses…' : 'Bayar Sekarang'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create App Router wrappers**

Create `frontend/src/app/(dashboard)/cart/page.tsx`:

```typescript
import type { Metadata } from 'next'

import CartPage from '@/views/CartPage'

export const metadata: Metadata = { title: 'Keranjang - Playfast' }

export default function Page() {
  return <CartPage />
}
```

Create `frontend/src/app/(dashboard)/cart/checkout/page.tsx`:

```typescript
import type { Metadata } from 'next'

import CartCheckoutPage from '@/views/CartCheckoutPage'

export const metadata: Metadata = { title: 'Checkout - Playfast' }

export default function Page() {
  return <CartCheckoutPage />
}
```

- [ ] **Step 4: Add cart icon to HorizontalMenu**

In `frontend/src/components/layout/horizontal/HorizontalMenu.tsx`, add an import for the cart count query at top:

```typescript
import { useQuery } from '@tanstack/react-query'
import { cartApi } from '@/lib/api'
```

Inside the component body (early in the function), add:

```typescript
  const { data: cartData } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
    enabled: !!user,
    staleTime: 30000,
  })
  const cartCount = cartData?.item_count || 0
```

Then insert a MenuItem for cart, immediately BEFORE the Creator Program / Bantuan entries:

```tsx
        {user && (
          <MenuItem
            href='/cart'
            icon={
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <i className='tabler-shopping-cart' />
                {cartCount > 0 && (
                  <Box
                    component='span'
                    sx={{
                      position: 'absolute', top: -6, right: -8,
                      bgcolor: '#c9a84c', color: '#000', borderRadius: '999px',
                      fontSize: 10, fontWeight: 700, minWidth: 18, height: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      px: 0.5,
                    }}
                  >
                    {cartCount}
                  </Box>
                )}
              </Box>
            }
          >
            Keranjang
          </MenuItem>
        )}
```

(Import `Box` from `@mui/material/Box` at the top of the file if not already imported.)

- [ ] **Step 5: Add cart link to VerticalMenu**

In `frontend/src/components/layout/vertical/VerticalMenu.tsx`, inside the `{user && (<>...)}` block, add (before "Bantuan"):

```tsx
              <MenuItem href='/cart' icon={<i className='tabler-shopping-cart' />}>
                Keranjang
              </MenuItem>
```

(Skip the badge in vertical menu — too cluttered. Keep it simple.)

- [ ] **Step 6: Type check + dev server smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

Start dev server. Open `/cart` while logged in. Verify:
- Empty cart state shows "Keranjang kosong"
- Cart icon in navbar shows badge with count when items added (after Task 10's game-page integration)
- "Kosongkan" works
- Navigate to `/cart/checkout` shows summary

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/CartPage.tsx frontend/src/views/CartCheckoutPage.tsx "frontend/src/app/(dashboard)/cart/page.tsx" "frontend/src/app/(dashboard)/cart/checkout/page.tsx" frontend/src/components/layout/horizontal/HorizontalMenu.tsx frontend/src/components/layout/vertical/VerticalMenu.tsx
git commit -m "feat(cart): /cart + /cart/checkout pages + navbar cart icon"
```

---

## Task 10: Game detail page — dual buttons + guards

**Files:**
- Modify: `frontend/src/views/GameDetailPage.tsx` (or wherever the game-buy button lives)

- [ ] **Step 1: Locate the existing buy button**

The game page lives at one of:
- `frontend/src/views/GameDetailPage.tsx`
- `frontend/src/views/store/GameDetail*.tsx`
- `frontend/src/app/(dashboard)/store/[id]/page.tsx`

Search:

```bash
grep -rn "Beli\|onClick.*checkout\|storeApi.checkout" frontend/src/views frontend/src/app
```

Identify the file containing the existing "Beli" button. That's the file to modify.

- [ ] **Step 2: Add cart mutation + dual buttons**

In that file, add imports if not present:

```typescript
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { cartApi } from '@/lib/api'
```

Add inside the component function:

```typescript
  const queryClient = useQueryClient()
  const [cartFeedback, setCartFeedback] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)

  const addCartMutation = useMutation({
    mutationFn: () => cartApi.add(game.id),
    onSuccess: () => {
      setCartFeedback({ severity: 'success', message: 'Game berhasil ditambah ke keranjang' })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
    onError: (err: any) => {
      const code = err?.body?.code
      let message = err?.message || 'Gagal menambah ke keranjang'
      if (code === 'premium_active') message = 'Kamu sudah Premium — semua game bisa langsung dimainkan.'
      else if (code === 'already_owned') message = 'Game ini sudah kamu miliki.'
      else if (code === 'cart_full') message = 'Keranjang penuh (maks 20 game).'
      setCartFeedback({ severity: 'info', message })
    },
  })
```

Replace the existing single "Beli" button with dual buttons. Find the existing button and replace its enclosing Box with:

```tsx
<Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
  <Button
    variant='contained'
    color='warning'
    size='large'
    onClick={handleBuyNow} // existing single-buy handler
    disabled={isBuying}
    sx={{ flex: '1 1 auto', minWidth: 180 }}
  >
    Beli Sekarang
  </Button>
  <Button
    variant='outlined'
    size='large'
    startIcon={<i className='tabler-shopping-cart' />}
    onClick={() => addCartMutation.mutate()}
    disabled={addCartMutation.isPending}
    sx={{ minWidth: 180 }}
  >
    Tambah Keranjang
  </Button>
</Box>
{cartFeedback && (
  <Alert
    severity={cartFeedback.severity}
    onClose={() => setCartFeedback(null)}
    sx={{ mt: 2 }}
  >
    {cartFeedback.message}
  </Alert>
)}
```

(Replace `handleBuyNow`, `isBuying` with the existing names in the file. The exact existing button code will tell you what to use.)

- [ ] **Step 3: Type check + dev test**

```bash
cd frontend && npx tsc --noEmit
```

Open a game detail page in dev server. Verify:
- Two buttons appear side-by-side
- Clicking "Tambah Keranjang" shows success Alert and cart badge in navbar increments
- Clicking again on same game shows "sudah ada di keranjang" (or success since add is idempotent — verify endpoint behavior)
- Logging out + login as a user with Premium subscription: clicking shows "Kamu sudah Premium…" info alert
- Logging in as a user who already owns the game: clicking shows "Game ini sudah kamu miliki"

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/GameDetailPage.tsx
# (adjust path to actual file modified)
git commit -m "feat(cart): dual Beli Sekarang + Tambah Keranjang on game page"
```

---

## Task 11: Final smoke test (end-to-end happy path)

**Files:** none — manual test only.

- [ ] **Step 1: Setup**

Ensure backend + frontend are running locally with a test Postgres DB (or sandbox-pointed production DB acceptable if user authorizes). Set payment mode to `midtrans` sandbox or `tripay` sandbox.

- [ ] **Step 2: End-to-end test**

1. Log in as a non-Premium test user.
2. Navigate to store. Pick a game and click "Tambah Keranjang". Badge increments.
3. Pick second game. Add. Badge = 2.
4. Click cart icon in navbar → `/cart`. Verify both games listed with correct prices + subtotal.
5. Click "Lanjut Bayar" → `/cart/checkout`. Apply a known valid promo code. Verify the success flow opens Midtrans snap / Tripay redirect.
6. Complete sandbox payment.
7. Verify: redirected back to success page.
8. Check `Order.query.filter_by(checkout_group_id=<group_id>).all()` returns 2 fulfilled orders.
9. Check email_logs has 1 row of type `cart_welcome` for the user.
10. Check email inbox — 1 cart-welcome email with 2 game rows.

- [ ] **Step 3: Edge cases**

- Try checkout cart with empty cart → 400
- Try add same game twice → second is idempotent
- Try add game while Premium → 400 with friendly message
- Try add game already owned → 400
- Refund 1 of 2 orders via admin page → only that 1 refunded (existing flow works)

- [ ] **Step 4: Note completion**

Report findings to user. No commit needed for this task — it's verification.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Tasks |
|---|---|
| cart_items table | Task 1 |
| orders.checkout_group_id | Task 1 |
| Cart endpoints (GET/POST/DELETE) | Task 4 |
| Cart checkout endpoint | Task 5 |
| Pricing prorate logic | Task 3 |
| Webhook handling for group orders | Task 6 |
| Cart welcome email | Task 7 |
| Frontend API client + types | Task 8 |
| Cart pages | Task 9 |
| Cart icon in navbar | Task 9 |
| Dual buttons on game page | Task 10 |
| Premium / already-owned guards | Task 4 (server) + Task 10 (UX) |
| E2E smoke test | Task 11 |

All spec items covered.

**2. Placeholder scan:**

- Task 6 has a `_send_cart_welcome` stub that Task 7 replaces. The stub is **explicitly** identified as temporary with a real replacement in Task 7. Not a placeholder violation — it's a sequencing decision that keeps each task self-contained.
- Task 10 says "adjust to actual file" — this is necessary because the game-page filename varies; the search command in Step 1 of Task 10 locates the exact file.

**3. Type consistency:**

- Backend `Order` model fields used in cart code: `user_id`, `game_id`, `status`, `type`, `midtrans_order_id`, `tripay_reference`, `checkout_group_id`, `amount_subtotal`, `promo_discount`, `credit_applied`, `amount`, `snap_token`, `payment_type`, `paid_at`, `promo_code_id` — all match existing schema + the new column added in Task 1.
- Frontend types: `CartItem.game` has `id`, `appid`, `name`, `price`, `header_image`, `custom_header_image`, `custom_name`. These match `Game.to_dict()` output verified via `backend/app/models.py`.
- Promo code id field consistent across pricing helper output (`promo_code_id`) and Order column (`promo_code_id`).

**4. Open items from spec resolved during planning:**

- "Email rendering for cart": handled in Task 7 with a table of game rows.
- "PromoCodeUsage granularity": pinned in Task 5 — 1 per cart, attributed to first Order in group.
- "Cart max size": pinned in Task 4 at `CART_MAX_ITEMS = 20`.
- "Existing single-buy endpoint preserved": Task 6 modifications use `.all()` lookup that returns a 1-element list for single-buy orders — same behavior preserved.
