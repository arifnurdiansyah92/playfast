# Promo Code + Referral Program + Checkout UX Refactor

**Status:** Design
**Date:** 2026-04-20

## Motivation

Playfast is onboarding its first creator partnership (Dika Main Game) and needs trackable promo codes before the sponsorship launches. Simultaneously the user wants a user-referral program to drive organic growth post-launch. Both features share the same checkout touchpoint: the current flow dumps users onto a QR payment screen immediately after clicking "Buy", leaving no room to review the order or apply a discount.

This design addresses all three in one coordinated change — the checkout refactor is the shared foundation for applying both promo codes and referral credit.

## Scope

In scope:
- **Promo Code System** — admin-created discount codes entered at checkout, with CRUD management and per-code usage tracking
- **Referral Program** — every user auto-gets a unique referral code, referred users get a first-order discount, referrers earn rupiah credit applied to their future orders
- **Checkout UX Refactor** — replace the direct-to-QR flow with a "review → apply code → pay" step for both game orders and subscriptions

Out of scope:
- Leaderboards / social features for referrals (cards at most — no feed)
- Stacking promo codes (user can only apply one code per order)
- Promo codes that apply automatically without user input (all require explicit entry)
- Payout of referral credit to external bank accounts (credit is only usable inside Playfast)
- Multi-currency (all amounts are IDR)
- Automated tests (project convention — manual QA)

## Architecture overview

Three logical components, one implementation project because they share the checkout touchpoint:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Promo Code      │    │ Referral Program │    │ Checkout Review │
│ (admin CRUD +   │    │ (per-user codes, │    │ (applies both   │
│  per-order      │──┐ │  credit balance, │──┐ │  promo + credit │
│  discount)      │  │ │  first-order    │  │ │  before QR/Snap)│
└─────────────────┘  │ └──────────────────┘  │ └─────────────────┘
                     ▼                       ▼
              ┌───────────────────────────────────────┐
              │   Order/Subscription pricing engine   │
              │   subtotal → promo → credit → total   │
              └───────────────────────────────────────┘
```

### Pricing engine rules

Given an `order.amount_subtotal` (the raw price):

1. If a promo code is applied and valid: `promo_discount = apply_promo(subtotal, promo)`
2. Interim total: `subtotal - promo_discount`
3. If the user has `referral_credit > 0`: `credit_applied = min(user.referral_credit, interim_total)`
4. Final total: `max(0, interim_total - credit_applied)`
5. Persist to the order: `subtotal`, `promo_discount`, `credit_applied`, `total`, `promo_code_id` (if any)

A subtotal of Rp 100,000 with a 20% promo and Rp 30,000 credit becomes:
- promo_discount = 20,000 → interim = 80,000
- credit_applied = 30,000 → final = 50,000

## Data model

### New model: `PromoCode`

```python
class PromoCode(db.Model):
    __tablename__ = "promo_codes"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False, index=True)  # stored uppercase
    description = db.Column(db.String(200), nullable=True)

    discount_type = db.Column(db.String(20), nullable=False)  # 'percentage' | 'fixed'
    discount_value = db.Column(db.Integer, nullable=False)  # 20 means 20% or 20000 IDR

    # Scope of what the code can discount
    scope = db.Column(db.String(30), nullable=False, default="all")
    # Values:
    #   'all'             → any order
    #   'games'           → game purchases only
    #   'subscriptions'   → any subscription plan
    #   'game:<game_id>'  → a specific game
    #   'sub:<plan>'      → a specific subscription plan (monthly/yearly/etc)

    min_order_amount = db.Column(db.Integer, nullable=False, default=0)
    max_uses_total = db.Column(db.Integer, nullable=True)  # null = unlimited
    max_uses_per_user = db.Column(db.Integer, nullable=False, default=1)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)

    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
```

### New model: `PromoCodeUsage`

```python
class PromoCodeUsage(db.Model):
    __tablename__ = "promo_code_usages"

    id = db.Column(db.Integer, primary_key=True)
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=True)
    discount_amount = db.Column(db.Integer, nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
```

One of `order_id` / `subscription_id` must be set. Usage rows are written once the order is created with the promo applied (not on payment completion) — since applying a code at checkout is what "consumes" the `max_uses_per_user`. If the order is cancelled, we can optionally delete the usage row (out of scope for V1).

### User model additions

```python
# Added to existing User model
referral_code = db.Column(db.String(12), unique=True, nullable=True, index=True)
referred_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
referral_credit = db.Column(db.Integer, nullable=False, default=0)  # IDR
```

A one-time migration backfills `referral_code` for existing users (generate 6-char uppercase alphanumeric, retry on collision).

### New model: `ReferralReward`

```python
class ReferralReward(db.Model):
    __tablename__ = "referral_rewards"

    id = db.Column(db.Integer, primary_key=True)
    referrer_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    referee_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    trigger_order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    trigger_subscription_id = db.Column(db.Integer, db.ForeignKey("subscriptions.id"), nullable=True)
    credit_awarded = db.Column(db.Integer, nullable=False)
    awarded_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
```

One reward per referee (enforced by unique index on `referee_user_id`). Awarded when the referee's first fulfilled order crosses the min-threshold.

### Order / Subscription additions

Both `Order` and `Subscription` gain four columns:

```python
amount_subtotal = db.Column(db.Integer, nullable=True)  # price before discounts
promo_discount = db.Column(db.Integer, nullable=False, default=0)
credit_applied = db.Column(db.Integer, nullable=False, default=0)
promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), nullable=True)
# existing `amount` column becomes the final total
```

Existing rows get `amount_subtotal = amount`, `promo_discount = 0`, `credit_applied = 0` via migration.

### Site settings

Three new entries in `SiteSetting.DEFAULTS`:

```python
"referral_referee_discount_pct": "10",   # new user's first-order discount
"referral_referrer_credit": "10000",     # referrer earns this many IDR per successful referral
"referral_min_order": "50000",           # minimum first-order amount to trigger reward
```

## Backend

### Promo code endpoints

Admin (all under `@admin_required`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/promo-codes` | list all codes with usage counts |
| POST | `/api/admin/promo-codes` | create new code |
| PUT | `/api/admin/promo-codes/<id>` | edit code (including `is_active` toggle) |
| DELETE | `/api/admin/promo-codes/<id>` | delete code (only if never used; otherwise return 409) |
| GET | `/api/admin/promo-codes/<id>/usages` | list users + orders that used this code |

Public/user (all under `@jwt_required()`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/store/promo-codes/validate` | body: `{code, order_type, game_id?, plan?}` → returns `{valid, discount_amount, error?}` without persisting |

The validate endpoint is what the checkout page calls when the user clicks "Apply Promo". It simulates the discount without creating usage — actual usage is recorded when the order is created.

### Referral endpoints

All user endpoints require `@jwt_required()`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/store/my-referral` | returns `{code, credit, referrals: [...], total_earned}` |
| POST | `/api/store/referral/validate` | body: `{code}` → returns `{valid, referrer_name?, error?}` — used during registration to validate before submit |

Admin:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/referrals` | list all referrals with user emails, credit awarded, trigger order |

### Registration flow change

Existing `POST /api/auth/register` gains an optional `referral_code` field in the body. Flow:

1. Validate referral_code (if provided): must exist, not belong to self (email/device check comes later), user is still eligible
2. On successful registration:
   - Generate the new user's own `referral_code` (6-char uppercase alphanumeric, retry on collision)
   - If `referred_by` valid → set `user.referred_by_user_id`
   - Do NOT award referrer yet — that happens on referee's first fulfilled order

### Order/subscription creation change

When creating an order (game purchase or subscription), the request body gains two optional fields: `promo_code` (string) and `apply_credit` (bool, default true).

1. Compute `amount_subtotal` from game/plan price
2. Validate promo_code if provided → compute `promo_discount`
3. If `apply_credit` and `user.referral_credit > 0` → compute `credit_applied = min(user.referral_credit, subtotal - promo_discount)`
4. `amount = subtotal - promo_discount - credit_applied`
5. Persist all four fields on the order. On successful creation:
   - Deduct `credit_applied` from `user.referral_credit`
   - Insert `PromoCodeUsage` row (if promo used)
6. Minimum order validation: the `amount` (final total) can be zero or positive — if zero, the order skips payment and is auto-fulfilled ("100% discount" edge case, rare but must be handled). This is only possible when credit covers the whole thing; promo codes alone can't reach 100% (typically capped at 90% via admin validation).

### Referrer reward trigger

On order/subscription status transition to `fulfilled` (game) or `active` (subscription):

1. Check if `order.user.referred_by_user_id` is set and the user has no prior fulfilled orders (i.e., this is their first)
2. Check `order.amount_subtotal >= referral_min_order` (configurable, default Rp 50k)
3. If yes → create `ReferralReward` row + add `referral_referrer_credit` (Rp 10k default) to referrer's `referral_credit`
4. This trigger fires once per referee (enforced by unique index on `ReferralReward.referee_user_id`)

**Important:** the referee's discount of 10% is applied automatically on their first order — the checkout validates `user.referred_by_user_id != null AND no prior fulfilled orders` and applies it without requiring a code input. This makes the promo/referral distinction cleaner: promo codes are explicit user input; referral discount is automatic for eligible users.

## Frontend

### Register form (`RegisterPage.tsx`)

Add one new field: **Kode Referral (opsional)**. On blur, call `/api/store/referral/validate` and show a confirmation line: "Kode valid — kamu akan di-refer oleh <nama referrer>" or an error state.

### Checkout flow — inline review modal

The user enters the promo code + credit preference BEFORE the order is created, via an inline modal on the game detail page (for game purchases) or subscribe page (for subscriptions). Once confirmed, the order is created with the final amount and the user is redirected to the existing payment page (`/order/[id]` or `/subscription/[id]`) which shows QR/Snap — no post-creation editing of discounts.

**CheckoutReviewModal** (new shared component, used from both `GameDetailPage` and `SubscribePage`):

Sections (top to bottom):
1. **Item summary:** game image + name, or subscription plan label
2. **Promo code input:** `<input>` + "Apply" button. On apply: calls `/api/store/promo-codes/validate` → shows success with discount amount OR error. Applied code collapses into "Kode DIKAMAIN dipakai — (ganti / hapus)".
3. **First-order referral discount (conditional):** if eligible (user has `referred_by` and no prior fulfilled orders), show info line: "Diskon 10% untuk first order kamu otomatis di-apply — dari referral <nama>."
4. **Credit balance (conditional):** if `user.referral_credit > 0`, show "Kamu punya Rp X,XXX credit" with toggle "Pakai credit" (default on). Toggling recomputes the total live.
5. **Price breakdown:**
   - Subtotal: Rp XX,XXX
   - Diskon Promo: −Rp X,XXX (if any)
   - Diskon First Order: −Rp X,XXX (if any)
   - Credit Dipakai: −Rp X,XXX (if any)
   - **Total: Rp X,XXX** (bold, larger)
6. **Primary action:** "Lanjut Bayar" button → `POST /api/store/orders` with `{game_id, promo_code, apply_credit}` → on success, `router.push('/order/<id>')`. For subscriptions: `POST /api/store/subscription/subscribe` with same shape → `router.push('/subscription/<id>')`.

The existing `/order/[id]` and `/subscription/[id]` detail pages stay payment-focused: they display the breakdown (new fields from the updated Order/Subscription schema) and the QR/Snap. No promo input on those pages.

### Preview calculation endpoint

To let the modal show the live total without creating an order, the validate endpoint returns the discount amount but the frontend does the subtotal/credit math locally using values from the current user (fetched from `/api/store/my-referral` for credit) and the item price (already known on the detail page). The referral first-order discount % is exposed via `/api/store/payment-config` (existing endpoint gains a `referral_discount_pct` field when the current user is eligible).

### User profile — referral dashboard

New section on `/profile` (or new `/profile/referral` subpage):
- Kode referral: `ARIF2X4K` with copy button + share button (WhatsApp/copy-link)
- Credit saldo: Rp XX,XXX
- Total earnings all-time: Rp XX,XXX
- List of referred users (email masked: `a***@gmail.com`) with status (`pending` = not yet purchased, `rewarded` = reward claimed)

### Admin — promo code management

New page `/admin/promo-codes`:
- List table: code, type, value, scope, uses, status, created_at, actions (edit, deactivate, view usages)
- "Create Promo Code" button → modal form
- Per-code detail page `/admin/promo-codes/[id]` showing all usages with user email, order ID, discount given, date

### Admin — referral tracking

New page `/admin/referrals`:
- Summary stats: total referrals, total credit awarded, total referee revenue generated
- List table: referrer, referee, trigger order, credit awarded, date
- Filter: by referrer

## Data flow — game purchase with promo

```
User clicks "Beli" on /game/[appid]
  ↓
Opens inline CheckoutModal
  ↓
User inputs promo code "DIKAMAIN" → clicks Apply
  ↓
POST /api/store/promo-codes/validate { code, order_type: 'game', game_id }
  ↓
Returns { valid: true, discount_amount: 10000 }
  ↓
Modal shows: subtotal 50000, promo −10000, credit −5000 (if has), total 35000
  ↓
User clicks "Lanjut Bayar"
  ↓
POST /api/store/orders { game_id, promo_code: 'DIKAMAIN', apply_credit: true }
  ↓
Backend: creates order with amount_subtotal=50000, promo_discount=10000,
  credit_applied=5000, amount=35000, promo_code_id=<id>
  Deducts 5000 from user.referral_credit
  Inserts PromoCodeUsage row
  ↓
Returns { order: { id, amount, ... }, payment_mode, snap_token/manual_info }
  ↓
Frontend: router.push('/order/[id]')
  ↓
Order detail page shows breakdown + QR/Snap (existing behavior, just with new fields)
  ↓
User pays → status transitions to fulfilled
  ↓
Backend checks: user.referred_by_user_id set + no prior fulfilled orders + amount_subtotal >= min → award referrer credit + insert ReferralReward
```

## Error handling

**Promo code validation errors** (all return 400 with `error` message):
- Code doesn't exist: "Kode promo tidak ditemukan"
- Code expired: "Kode promo sudah expired"
- Code inactive: "Kode promo tidak aktif"
- Total uses exceeded: "Kode promo sudah habis kuotanya"
- Per-user uses exceeded: "Kamu sudah pernah pakai kode ini"
- Scope mismatch: "Kode promo ini tidak berlaku untuk item ini"
- Min order not met: "Minimum pembelian Rp <min> untuk pakai kode ini"

**Referral errors:**
- Self-referral attempt: "Kamu gak bisa refer diri sendiri"
- Same-email referral attempt: "Kode referral tidak valid" (don't leak "same email")
- Unknown code during register: "Kode referral tidak ditemukan" (soft error — allow registration to proceed, just don't set `referred_by`)

**Credit application:**
- If `apply_credit` is true but user has no credit: silently ignored (no error)
- Credit deduction happens atomically with order creation (transactional)

## Testing

Per project convention, no automated tests. Manual QA covers:

1. **Admin create + track promo code:**
   - Create code "TESTCODE" 10% off, scope=all, max 5 uses per user=1
   - Verify visible in list
   - User applies at checkout → order created with discount → usage logged
   - Admin views usages → sees user + order
   - 2nd attempt by same user → rejected

2. **Promo edge cases:**
   - Expired code → rejected
   - Inactive code → rejected
   - Scope=game:1, user tries on game_id=2 → rejected
   - Min order not met → rejected

3. **Referral end-to-end:**
   - User A registers (no referrer) → has auto-generated referral_code
   - User B registers using A's code → `referred_by_user_id = A.id` set
   - User B makes first order Rp 60k (above min) → 10% auto-applied → final 54k
   - B pays → status fulfilled → A's credit = 10000 → ReferralReward row created
   - A makes next order Rp 100k → credit auto-applies → final 90k
   - B tries second order → first-order discount NOT auto-applied

4. **Referral anti-fraud:**
   - User self-register with own code → rejected
   - Second user with same email (already exists anyway) → can't register

5. **Checkout UX:**
   - Empty-promo submit works (no code entered)
   - Invalid promo → error shown, can retry
   - Credit toggle off → recomputes total without credit
   - Total becomes zero when credit covers all → skip payment, auto-fulfill

## Risk & mitigation

- **Promo code abuse:** user shares DIKAMAIN with network, everyone uses once. Mitigated by `max_uses_total` cap per code (admin sets reasonable ceiling).
- **Referral credit farming:** user creates many accounts to refer themselves. Mitigated by same-email check at register + manual admin monitoring (admin dashboard shows activity patterns).
- **Race condition on credit deduction:** two concurrent orders could both try to spend the same credit. Mitigated by DB-level atomic update + re-fetch before each use; if the credit balance is insufficient at the time of deduction, the second order falls back to zero credit applied (not an error).
- **Backfill migration for existing users:** existing users get `referral_code` generated and `referral_credit = 0`. Only one-time on deployment.

## Decisions summary (locked in)

1. Promo code and referral code are **separate** systems (user's explicit requirement)
2. Referee gets **automatic** first-order discount (no code input) when they have `referred_by_user_id` set
3. Promo codes **cannot stack** with each other (one code per order)
4. Promo codes + referral credit **can stack** (both apply on the same order)
5. Referral reward triggers on **first fulfilled order above min_order threshold** (not on registration, not on every order)
6. Credit is **non-expiring** and **non-withdrawable** (platform credit only)
7. Checkout review uses **inline modal** before order creation (not a post-creation review page)
8. Admin UI is **page-based** (not modals) for both promo management and referral tracking

## Open questions

None. All decisions pinned above.
