# Subscription Business Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subscription model where users pay monthly/3-monthly/yearly for access to all games, coexisting with per-game purchases.

**Architecture:** New `Subscription` model for payment/status tracking. Subscribers create orders that auto-fulfill (skip payment). Order model gets a `type` column to distinguish subscription vs purchase orders. Expiry is evaluated lazily. Prices stored in SiteSettings.

**Tech Stack:** Flask + SQLAlchemy (backend), Next.js + React + MUI + TanStack Query (frontend), Midtrans (payments)

---

### Task 1: Subscription model + Order type column + SiteSettings defaults

**Files:**
- Modify: `backend/app/models.py` (add Subscription class, modify Order, modify SiteSetting.DEFAULTS)
- Modify: `backend/app/__init__.py` (add schema upgrade ALTER statements)

- [ ] **Step 1: Add Subscription model to models.py**

Add after the `PasswordResetToken` class (end of file), and add the import `timedelta` is already imported at the top:

```python
class Subscription(db.Model):
    __tablename__ = "subscriptions"

    PLAN_DURATIONS = {
        "monthly": 30,
        "3monthly": 90,
        "yearly": 365,
    }

    PLAN_LABELS = {
        "monthly": "Monthly",
        "3monthly": "3 Months",
        "yearly": "Yearly",
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

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "plan": self.plan,
            "plan_label": self.PLAN_LABELS.get(self.plan, self.plan),
            "status": self.status,
            "amount": self.amount,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "payment_type": self.payment_type,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat(),
        }
```

- [ ] **Step 2: Add `type` column to Order model**

In the `Order` class in `backend/app/models.py`, add after the `status` column (after line 177):

```python
    type = db.Column(
        db.String(20), default="purchase", nullable=False
    )  # purchase, subscription
```

And update `to_dict` to include the type field — add `"type": self.type,` to the result dict in the `to_dict` method, after `"status"`.

- [ ] **Step 3: Add subscription price defaults to SiteSetting.DEFAULTS**

In `SiteSetting.DEFAULTS` dict in `backend/app/models.py`, add these three keys after the existing entries:

```python
        "sub_price_monthly": "50000",
        "sub_price_3monthly": "120000",
        "sub_price_yearly": "400000",
```

- [ ] **Step 4: Add schema upgrade statements**

In `backend/app/__init__.py`, in the `_run_schema_upgrades` function, add these to the `alter_statements` list:

```python
        # Order type column for subscription vs purchase
        "ALTER TABLE orders ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'purchase'",
```

And after the alter_statements loop, add table creation for subscriptions:

```python
    from app.models import Subscription
    Subscription.__table__.create(db.engine, checkfirst=True)
```

- [ ] **Step 5: Commit**

```
git add backend/app/models.py backend/app/__init__.py
git commit -m "feat: add Subscription model, Order type column, and subscription price settings"
```

---

### Task 2: Subscription store endpoints (plans, subscribe, status)

**Files:**
- Modify: `backend/app/store/routes.py` (add subscription endpoints + helper)

- [ ] **Step 1: Add subscription imports and helper**

At the top of `backend/app/store/routes.py`, add `Subscription` to the models import (line 19-29). Then add a helper function after the `DEFAULT_PLAY_INSTRUCTIONS` constant (after line 105):

```python
def _get_active_subscription(user_id: int):
    """Return the user's active subscription, or None. Expires stale subscriptions."""
    sub = (
        Subscription.query
        .filter_by(user_id=user_id, status="active")
        .order_by(Subscription.expires_at.desc())
        .first()
    )
    if sub and not sub.is_active:
        sub.status = "expired"
        # Revoke all subscription-type assignments for this user
        sub_orders = Order.query.filter_by(user_id=user_id, type="subscription", status="fulfilled").all()
        for order in sub_orders:
            if order.assignment and not order.assignment.is_revoked:
                order.assignment.is_revoked = True
                order.assignment.revoked_at = datetime.now(timezone.utc)
        db.session.commit()
        return None
    return sub
```

- [ ] **Step 2: Add GET /api/store/subscription/plans endpoint**

```python
@store_bp.route("/subscription/plans", methods=["GET"])
def subscription_plans():
    """Return available subscription plans with prices."""
    plans = []
    for plan_key, duration in Subscription.PLAN_DURATIONS.items():
        price_str = SiteSetting.get(f"sub_price_{plan_key}")
        price = int(price_str) if price_str else 0
        if price > 0:
            plans.append({
                "plan": plan_key,
                "label": Subscription.PLAN_LABELS.get(plan_key, plan_key),
                "price": price,
                "duration_days": duration,
            })
    return jsonify({"plans": plans}), 200
```

- [ ] **Step 3: Add POST /api/store/subscription/subscribe endpoint**

```python
@store_bp.route("/subscription/subscribe", methods=["POST"])
@jwt_required()
def subscribe():
    """Create a new subscription with pending_payment status."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    plan = data.get("plan", "")

    if plan not in Subscription.PLAN_DURATIONS:
        return jsonify({"error": "Invalid plan. Choose: monthly, 3monthly, yearly"}), 400

    # Check for existing active subscription
    active_sub = _get_active_subscription(user_id)
    if active_sub:
        return jsonify({"error": "You already have an active subscription", "subscription": active_sub.to_dict()}), 409

    # Check for existing pending subscription
    pending_sub = Subscription.query.filter_by(
        user_id=user_id, status="pending_payment"
    ).first()
    if pending_sub and pending_sub.snap_token:
        return jsonify({
            "message": "Existing pending subscription found",
            "subscription": pending_sub.to_dict(),
            "snap_token": pending_sub.snap_token,
        }), 200

    price_str = SiteSetting.get(f"sub_price_{plan}")
    price = int(price_str) if price_str else 0
    if price <= 0:
        return jsonify({"error": "Subscription plan not available"}), 400

    user = db.session.get(User, user_id)
    timestamp = int(datetime.now(timezone.utc).timestamp())
    midtrans_order_id = f"SUB-{user_id}-{plan}-{timestamp}"

    sub = Subscription(
        user_id=user_id,
        plan=plan,
        amount=price,
        midtrans_order_id=midtrans_order_id,
    )
    db.session.add(sub)
    db.session.flush()

    payment_mode = SiteSetting.get("payment_mode")

    if payment_mode == "manual":
        db.session.commit()
        return jsonify({
            "message": "Subscription created, awaiting manual payment",
            "subscription": sub.to_dict(),
            "payment_mode": "manual",
            "manual_info": {
                "qris_image_url": SiteSetting.get("manual_qris_image_url"),
                "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
                "instructions": SiteSetting.get("manual_payment_instructions"),
            },
        }), 201
    else:
        try:
            snap = _get_snap()
            transaction = snap.create_transaction({
                "transaction_details": {
                    "order_id": midtrans_order_id,
                    "gross_amount": price,
                },
                "item_details": [{
                    "id": f"sub_{plan}",
                    "price": price,
                    "quantity": 1,
                    "name": f"Playfast {Subscription.PLAN_LABELS.get(plan, plan)} Subscription",
                }],
                "customer_details": {
                    "email": user.email if user else "",
                },
            })
            snap_token = transaction["token"]
            sub.snap_token = snap_token
            db.session.commit()

            return jsonify({
                "message": "Subscription created, awaiting payment",
                "subscription": sub.to_dict(),
                "payment_mode": "midtrans",
                "snap_token": snap_token,
            }), 201
        except Exception as e:
            db.session.rollback()
            logger.exception("Failed to create Midtrans transaction for subscription: %s", e)
            return jsonify({"error": "Payment service unavailable, please try again later"}), 502
```

- [ ] **Step 4: Add GET /api/store/subscription/status endpoint**

```python
@store_bp.route("/subscription/status", methods=["GET"])
@jwt_required()
def subscription_status():
    """Return the current user's subscription status."""
    user_id = int(get_jwt_identity())
    active_sub = _get_active_subscription(user_id)

    if active_sub:
        return jsonify({
            "is_subscribed": True,
            "subscription": active_sub.to_dict(),
        }), 200

    # Check for pending subscription
    pending_sub = Subscription.query.filter_by(
        user_id=user_id, status="pending_payment"
    ).first()

    return jsonify({
        "is_subscribed": False,
        "subscription": pending_sub.to_dict() if pending_sub else None,
    }), 200
```

- [ ] **Step 5: Commit**

```
git add backend/app/store/routes.py
git commit -m "feat: add subscription store endpoints (plans, subscribe, status)"
```

---

### Task 3: Extend Midtrans webhook for subscription payments

**Files:**
- Modify: `backend/app/store/routes.py` (modify `midtrans_webhook` function)

- [ ] **Step 1: Add subscription handling to the webhook**

In the `midtrans_webhook` function in `backend/app/store/routes.py`, after the signature verification block (after line 499), before looking up the order, add a branch for subscription payments:

```python
    # Handle subscription payments (SUB- prefix)
    if order_id.startswith("SUB-"):
        sub = Subscription.query.filter_by(midtrans_order_id=order_id).first()
        if not sub:
            logger.warning("Midtrans webhook: subscription not found for %s", order_id)
            return jsonify({"error": "Subscription not found"}), 404

        if transaction_status in ("capture", "settlement"):
            if transaction_status == "capture" and fraud_status not in ("accept", ""):
                sub.status = "cancelled"
                db.session.commit()
                return jsonify({"status": "cancelled"}), 200

            if sub.status == "pending_payment":
                sub.payment_type = payment_type
                sub.paid_at = datetime.now(timezone.utc)
                sub.activate()
                db.session.commit()
                logger.info("Subscription %s activated for user %s", sub.id, sub.user_id)

            return jsonify({"status": "ok"}), 200

        elif transaction_status in ("cancel", "deny", "expire"):
            if sub.status == "pending_payment":
                sub.status = "cancelled"
                db.session.commit()
            return jsonify({"status": "cancelled"}), 200

        elif transaction_status == "pending":
            return jsonify({"status": "pending"}), 200

        return jsonify({"status": "ignored"}), 200

    # Look up order by midtrans_order_id (existing code continues below)
```

- [ ] **Step 2: Commit**

```
git add backend/app/store/routes.py
git commit -m "feat: extend Midtrans webhook to handle subscription payments"
```

---

### Task 4: Modify order creation for subscribers (auto-fulfill)

**Files:**
- Modify: `backend/app/store/routes.py` (modify `create_order` function)

- [ ] **Step 1: Add subscription check to create_order**

In the `create_order` function in `backend/app/store/routes.py`, after the availability check (after line 400, the `if not available:` block), add the subscription auto-fulfill logic:

```python
    # Check if user has active subscription — auto-fulfill without payment
    active_sub = _get_active_subscription(user_id)
    if active_sub:
        order = Order(
            user_id=user_id,
            game_id=game.id,
            status="pending_payment",
            type="subscription",
            amount=0,
        )
        db.session.add(order)
        db.session.flush()

        order.payment_type = "subscription"
        order.paid_at = datetime.now(timezone.utc)
        success = _fulfill_order(order)
        if not success:
            order.status = "fulfilled"
            db.session.commit()

        return jsonify({
            "message": "Game access granted via subscription",
            "order": order.to_dict(),
            "payment_mode": "subscription",
        }), 201
```

- [ ] **Step 2: Commit**

```
git add backend/app/store/routes.py
git commit -m "feat: auto-fulfill orders for subscribed users"
```

---

### Task 5: Modify my-games to show subscription badge + handle expiry

**Files:**
- Modify: `backend/app/store/routes.py` (modify `my_games` function)

- [ ] **Step 1: Trigger expiry check in my_games**

In the `my_games` function, right after `user_id = int(get_jwt_identity())`, add:

```python
    # Trigger lazy expiry check for subscription
    _get_active_subscription(user_id)
```

- [ ] **Step 2: Include order type in my-games response**

In the `my_games` function, where the game dict is built for purchased games (the `gd["type"] = "purchased"` line), change to include a distinction for subscription-sourced games. Replace:

```python
            gd["type"] = "purchased"
```

with:

```python
            gd["type"] = "subscription" if (hasattr(a, 'order') and a.order and a.order.type == "subscription") else "purchased"
```

Since Assignment has `order` relationship via `order_id`, we need to load the order. The relationship `a.order` already exists (defined in Assignment model via the `order` backref from `Order.assignment_record`). Actually, check — Assignment has `order = db.relationship("Order", ...)` via `order_id`. Let's use the query directly instead:

Replace:

```python
            gd["type"] = "purchased"
```

with:

```python
            source_order = db.session.get(Order, a.order_id)
            gd["type"] = "subscription" if (source_order and source_order.type == "subscription") else "purchased"
```

- [ ] **Step 3: Commit**

```
git add backend/app/store/routes.py
git commit -m "feat: show subscription badge in my-games and trigger expiry check"
```

---

### Task 6: Admin subscription endpoints

**Files:**
- Modify: `backend/app/admin/routes.py` (add subscription list + manual confirm endpoints)

- [ ] **Step 1: Add Subscription import**

At the top of `backend/app/admin/routes.py`, add `Subscription` to the models import.

- [ ] **Step 2: Add GET /api/admin/subscriptions endpoint**

Add before the settings routes:

```python
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
```

- [ ] **Step 3: Add POST /api/admin/subscriptions/<id>/confirm endpoint**

```python
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
```

- [ ] **Step 4: Commit**

```
git add backend/app/admin/routes.py
git commit -m "feat: add admin subscription list and manual confirm endpoints"
```

---

### Task 7: Frontend API types and methods for subscriptions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add Subscription interface**

After the `Order` interface (around line 190), add:

```typescript
export interface SubscriptionPlan {
  plan: string
  label: string
  price: number
  duration_days: number
}

export interface Subscription {
  id: number
  user_id: number
  plan: string
  plan_label: string
  status: string
  amount: number
  starts_at: string | null
  expires_at: string | null
  payment_type: string | null
  paid_at: string | null
  created_at: string
  user_email?: string
}
```

- [ ] **Step 2: Add `type` to Order interface**

In the `Order` interface, add after `status: string`:

```typescript
  type?: 'purchase' | 'subscription'
```

- [ ] **Step 3: Add storeApi subscription methods**

In the `storeApi` object, add these methods:

```typescript
  getSubscriptionPlans() {
    return request<{ plans: SubscriptionPlan[] }>('/api/store/subscription/plans')
  },
  subscribe(plan: string) {
    return request<{
      subscription: Subscription
      payment_mode: string
      snap_token?: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>('/api/store/subscription/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan })
    })
  },
  getSubscriptionStatus() {
    return request<{ is_subscribed: boolean; subscription: Subscription | null }>('/api/store/subscription/status')
  },
```

- [ ] **Step 4: Add adminApi subscription methods**

In the `adminApi` object, add:

```typescript
  async getSubscriptions(params?: { status?: string; page?: number }) {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.page) search.set('page', String(params.page))
    const qs = search.toString()
    return request<{ subscriptions: Subscription[]; total: number; page: number; pages: number }>(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`)
  },
  confirmSubscription(id: number) {
    return request<{ message: string; subscription: Subscription }>(`/api/admin/subscriptions/${id}/confirm`, { method: 'POST' })
  },
```

- [ ] **Step 5: Commit**

```
git add frontend/src/lib/api.ts
git commit -m "feat: add subscription API types and methods"
```

---

### Task 8: Subscribe page (user-facing)

**Files:**
- Create: `frontend/src/views/SubscribePage.tsx`
- Create: `frontend/src/app/(dashboard)/subscribe/page.tsx`

- [ ] **Step 1: Create the subscribe page view**

Create `frontend/src/views/SubscribePage.tsx`:

```tsx
'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'

import { storeApi, formatIDR } from '@/lib/api'
import type { ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const SubscribePage = () => {
  const router = useRouter()
  const { user } = useAuth()
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [snackMsg, setSnackMsg] = useState('')

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => storeApi.getSubscriptionPlans(),
  })

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => storeApi.getSubscriptionStatus(),
    enabled: !!user,
  })

  const plans = plansData?.plans ?? []
  const isSubscribed = statusData?.is_subscribed ?? false
  const currentSub = statusData?.subscription

  const handleSubscribe = async (plan: string) => {
    if (!user) {
      router.push(`/register?redirect=/subscribe`)
      return
    }

    setError('')
    setBuying(plan)

    try {
      const result = await storeApi.subscribe(plan)
      const { subscription, payment_mode, snap_token } = result

      if (payment_mode === 'midtrans' && snap_token && typeof window !== 'undefined' && (window as any).snap) {
        (window as any).snap.pay(snap_token, {
          onSuccess: () => { setSnackMsg('Subscription activated!'); router.push('/my-games') },
          onPending: () => setSnackMsg('Payment pending. You will get access once payment is confirmed.'),
          onError: () => setError('Payment failed. Please try again.'),
          onClose: () => setBuying(null),
        })
      } else if (payment_mode === 'manual') {
        setSnackMsg('Subscription created! Please complete payment via QRIS/WhatsApp.')
        setBuying(null)
      } else {
        setBuying(null)
      }
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Failed to subscribe')
      setBuying(null)
    }
  }

  const bestValue = 'yearly'

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant='h3' sx={{ fontWeight: 800, mb: 1 }}>
          Playfast Premium
        </Typography>
        <Typography variant='h6' color='text.secondary' sx={{ maxWidth: 600, mx: 'auto' }}>
          Subscribe once, play everything. Access all games with a single subscription.
        </Typography>
      </Box>

      {isSubscribed && currentSub && (
        <Alert severity='success' sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>
          You are subscribed to the <strong>{currentSub.plan_label}</strong> plan.
          {currentSub.expires_at && (
            <> Expires on <strong>{new Date(currentSub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
          )}
        </Alert>
      )}

      {error && (
        <Alert severity='error' sx={{ maxWidth: 600, mx: 'auto', width: '100%' }}>{error}</Alert>
      )}

      {plansLoading || statusLoading ? (
        <Grid container spacing={3} justifyContent='center'>
          {[1, 2, 3].map(i => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant='rounded' height={280} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={3} justifyContent='center'>
          {plans.map(plan => {
            const isBest = plan.plan === bestValue
            const monthlyEquiv = plan.plan === 'monthly'
              ? plan.price
              : plan.plan === '3monthly'
                ? Math.round(plan.price / 3)
                : Math.round(plan.price / 12)

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={plan.plan}>
                <Card
                  sx={{
                    height: '100%',
                    border: '2px solid',
                    borderColor: isBest ? 'primary.main' : 'divider',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {isBest && (
                    <Chip
                      label='Best Value'
                      color='primary'
                      size='small'
                      sx={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <CardContent sx={{ textAlign: 'center', py: 4, px: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>
                      {plan.label}
                    </Typography>
                    <Typography variant='h3' color='primary.main' sx={{ fontWeight: 800, mb: 0.5 }}>
                      {formatIDR(plan.price)}
                    </Typography>
                    <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
                      {plan.plan !== 'monthly' && `${formatIDR(monthlyEquiv)}/month · `}{plan.duration_days} days
                    </Typography>

                    <Box sx={{ flexGrow: 1 }} />

                    <Button
                      variant={isBest ? 'contained' : 'outlined'}
                      size='large'
                      fullWidth
                      disabled={isSubscribed || buying !== null}
                      onClick={() => handleSubscribe(plan.plan)}
                      sx={{ fontWeight: 700, py: 1.5 }}
                    >
                      {buying === plan.plan ? 'Processing...' : isSubscribed ? 'Already Subscribed' : 'Subscribe'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* Features */}
      <Grid container spacing={2} sx={{ mt: 2, maxWidth: 900, mx: 'auto' }}>
        {[
          { icon: 'tabler-device-gamepad-2', title: 'All Games', desc: 'Access every game in the catalog' },
          { icon: 'tabler-shield-lock', title: 'Steam Guard', desc: 'Automatic 2FA codes included' },
          { icon: 'tabler-bolt', title: 'Instant Access', desc: 'Get credentials immediately after subscribing' },
          { icon: 'tabler-refresh', title: 'Auto-Renew Ready', desc: 'Renew anytime before expiry' },
        ].map(f => (
          <Grid size={{ xs: 12, sm: 6 }} key={f.title}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <Box
                sx={{
                  width: 44, height: 44, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(201,168,76,0.08)', flexShrink: 0,
                }}
              >
                <i className={f.icon} style={{ fontSize: 22, color: '#c9a84c' }} />
              </Box>
              <Box>
                <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>{f.title}</Typography>
                <Typography variant='caption' color='text.secondary'>{f.desc}</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Snackbar open={!!snackMsg} autoHideDuration={4000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default SubscribePage
```

- [ ] **Step 2: Create the route page**

Create `frontend/src/app/(dashboard)/subscribe/page.tsx`:

```tsx
import type { Metadata } from 'next'

import SubscribePage from '@views/SubscribePage'

export const metadata: Metadata = {
  title: 'Subscribe - Playfast Premium',
  description: 'Subscribe to Playfast Premium for unlimited access to all games.',
}

export default function SubscribeRoute() {
  return <SubscribePage />
}
```

- [ ] **Step 3: Commit**

```
git add frontend/src/views/SubscribePage.tsx frontend/src/app/\(dashboard\)/subscribe/page.tsx
git commit -m "feat: add subscription page for users"
```

---

### Task 9: Modify game detail page for subscribers

**Files:**
- Modify: `frontend/src/views/game/GameDetailPage.tsx`

- [ ] **Step 1: Add subscription status query**

In `GameDetailPage`, add a subscription status query after the existing orders query (around line 52). Add `storeApi` is already imported. Add:

```typescript
  const { data: subStatus } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => storeApi.getSubscriptionStatus(),
    enabled: !!user,
  })

  const isSubscribed = subStatus?.is_subscribed ?? false
```

- [ ] **Step 2: Modify the buy button for subscribers**

Replace the entire action area block (the section starting with `{existingOrder ? (` around line 225 through the closing of the ternary around line 289) with:

```tsx
              {existingOrder ? (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip
                    label='Sudah Dimiliki'
                    color='info'
                    variant='tonal'
                    icon={<i className='tabler-check' style={{ fontSize: 16 }} />}
                  />
                  <Button
                    variant='contained'
                    size='large'
                    startIcon={<i className='tabler-player-play' />}
                    onClick={() => router.push(`/play/${existingOrder.id}`)}
                  >
                    Buka Halaman Main
                  </Button>
                </Box>
              ) : user && isSubscribed ? (
                <Button
                  variant='contained'
                  size='large'
                  disabled={buying}
                  onClick={handleBuy}
                  startIcon={<i className='tabler-player-play' />}
                  sx={{
                    minWidth: 220, py: 1.5, fontSize: '1rem', fontWeight: 700,
                    boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                    '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                  }}
                >
                  {buying ? 'Memproses...' : 'Main Sekarang (Premium)'}
                </Button>
              ) : user ? (
                <Button
                  variant='contained'
                  size='large'
                  disabled={buying}
                  onClick={() => setConfirmOpen(true)}
                  startIcon={<i className='tabler-shopping-cart' />}
                  sx={{
                    minWidth: 220, py: 1.5, fontSize: '1rem', fontWeight: 700,
                    boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                    '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                  }}
                >
                  {buying ? 'Memproses...' : 'Dapatkan Game Ini'}
                </Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    component={Link}
                    href={`/login?redirect=/game/${appid}`}
                    variant='contained'
                    size='large'
                    startIcon={<i className='tabler-login' />}
                    sx={{
                      py: 1.5, fontSize: '1rem', fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(201,168,76,0.2)',
                      '&:hover': { boxShadow: '0 6px 24px rgba(201,168,76,0.3)' },
                    }}
                  >
                    Masuk untuk Beli
                  </Button>
                  <Button
                    component={Link}
                    href={`/register?redirect=/game/${appid}`}
                    variant='outlined'
                    size='large'
                    startIcon={<i className='tabler-user-plus' />}
                    sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
                  >
                    Daftar
                  </Button>
                </Box>
              )}
```

- [ ] **Step 3: Modify handleBuy to handle subscription auto-fulfill redirect**

In the `handleBuy` function, after the `const result = await storeApi.createOrder(appid)` line, add handling for subscription mode:

```typescript
      if (result.payment_mode === 'subscription') {
        // Auto-fulfilled, go directly to play page
        router.push(`/play/${result.order.id}`)
        return
      }
```

Add this right before the existing `if (payment_mode === 'midtrans' ...)` check.

- [ ] **Step 4: Commit**

```
git add frontend/src/views/game/GameDetailPage.tsx
git commit -m "feat: show 'Play Now' button for subscribers on game detail page"
```

---

### Task 10: Add subscription badge to My Games page

**Files:**
- Modify: `frontend/src/views/play/PlayPage.tsx` — no, this is the play page, not my-games. Let me check.

Actually, the my-games page view needs to be found.

- Modify: The view that renders `/my-games`

- [ ] **Step 1: Find and update the my-games view**

The my-games page is at `frontend/src/app/(dashboard)/my-games/page.tsx`. Find the view component it renders and update the badge logic. Where `type === 'purchased'` shows "Purchased" and `type === 'bonus'` shows "Bonus", add `type === 'subscription'` showing "Premium".

Look for the `type` field rendering in the my-games view and add a case for `"subscription"`:

Where the type chip/badge is rendered, update it to handle 3 types:

```tsx
<Chip
  size='small'
  label={game.type === 'purchased' ? 'Purchased' : game.type === 'subscription' ? 'Premium' : 'Bonus'}
  color={game.type === 'purchased' ? 'success' : game.type === 'subscription' ? 'warning' : 'info'}
  variant='tonal'
/>
```

The exact location depends on the my-games view file — find the Chip or badge that renders `game.type` and update it.

- [ ] **Step 2: Commit**

```
git add frontend/src/views/
git commit -m "feat: show Premium badge for subscription-sourced games in My Games"
```

---

### Task 11: Add Subscribe link to navigation

**Files:**
- Modify: `frontend/src/components/layout/vertical/VerticalMenu.tsx`

- [ ] **Step 1: Add Premium menu item**

In `VerticalMenu.tsx`, inside the "Jelajahi" MenuSection, add a Premium/Subscribe link after the "Toko" MenuItem (after line 83):

```tsx
          <MenuItem href='/subscribe' icon={<i className='tabler-crown' />}>
            Premium
          </MenuItem>
```

- [ ] **Step 2: Commit**

```
git add frontend/src/components/layout/vertical/VerticalMenu.tsx
git commit -m "feat: add Premium link to navigation menu"
```

---

### Task 12: Admin settings — subscription pricing fields

**Files:**
- Modify: `frontend/src/views/admin/AdminSettingsPage.tsx`

- [ ] **Step 1: Add Subscription Pricing card**

In `AdminSettingsPage.tsx`, add a new Card section after the Manual Payment Settings card (before the Snackbar, around line 197). This card is always visible:

```tsx
      {/* Subscription Pricing */}
      <Card>
        <CardHeader
          title='Subscription Pricing'
          avatar={<i className='tabler-crown' style={{ fontSize: 24 }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Monthly Price (IDR)'
                value={form.sub_price_monthly || ''}
                onChange={e => handleChange('sub_price_monthly', e.target.value)}
                placeholder='50000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='3-Month Price (IDR)'
                value={form.sub_price_3monthly || ''}
                onChange={e => handleChange('sub_price_3monthly', e.target.value)}
                placeholder='120000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Yearly Price (IDR)'
                value={form.sub_price_yearly || ''}
                onChange={e => handleChange('sub_price_yearly', e.target.value)}
                placeholder='400000'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
```

- [ ] **Step 2: Commit**

```
git add frontend/src/views/admin/AdminSettingsPage.tsx
git commit -m "feat: add subscription pricing fields to admin settings page"
```

---

### Task 13: Admin subscriptions page

**Files:**
- Create: `frontend/src/views/admin/AdminSubscriptionsPage.tsx`
- Create: `frontend/src/app/(dashboard)/admin/subscriptions/page.tsx`

- [ ] **Step 1: Create admin subscriptions view**

Create `frontend/src/views/admin/AdminSubscriptionsPage.tsx`:

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
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  active: 'success',
  pending_payment: 'warning',
  expired: 'error',
  cancelled: 'info',
}

const AdminSubscriptionsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', statusFilter, page],
    queryFn: () => adminApi.getSubscriptions({ status: statusFilter || undefined, page }),
    enabled: user?.role === 'admin',
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => adminApi.confirmSubscription(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Failed: ${err.message}`),
  })

  const subs = data?.subscriptions ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Subscriptions</Typography>
          <Typography color='text.secondary'>{total} subscriptions</Typography>
        </Box>
      </Box>

      <Card>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size='small' sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label='Status' onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <MenuItem value=''>All</MenuItem>
              <MenuItem value='active'>Active</MenuItem>
              <MenuItem value='pending_payment'>Pending</MenuItem>
              <MenuItem value='expired'>Expired</MenuItem>
              <MenuItem value='cancelled'>Cancelled</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-crown' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>No subscriptions</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Starts</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subs.map(sub => (
                  <TableRow key={sub.id} hover>
                    <TableCell>{sub.user_email}</TableCell>
                    <TableCell><Chip size='small' label={sub.plan_label} variant='tonal' /></TableCell>
                    <TableCell>
                      <Chip size='small' label={sub.status} color={statusColors[sub.status] ?? 'default'} variant='tonal' />
                    </TableCell>
                    <TableCell>{formatIDR(sub.amount)}</TableCell>
                    <TableCell>{sub.starts_at ? new Date(sub.starts_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell>{sub.paid_at ? new Date(sub.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell align='right'>
                      {sub.status === 'pending_payment' && (
                        <Tooltip title='Confirm Payment'>
                          <IconButton
                            size='small'
                            color='success'
                            onClick={() => confirmMutation.mutate(sub.id)}
                            disabled={confirmMutation.isPending}
                          >
                            <i className='tabler-check' />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color='primary' />
            </Box>
          )}
        </Card>
      )}

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminSubscriptionsPage
```

- [ ] **Step 2: Create the route page**

Create `frontend/src/app/(dashboard)/admin/subscriptions/page.tsx`:

```tsx
import AdminSubscriptionsPage from '@views/admin/AdminSubscriptionsPage'

export default function AdminSubscriptionsRoute() {
  return <AdminSubscriptionsPage />
}
```

- [ ] **Step 3: Commit**

```
git add frontend/src/views/admin/AdminSubscriptionsPage.tsx frontend/src/app/\(dashboard\)/admin/subscriptions/page.tsx
git commit -m "feat: add admin subscriptions management page"
```

---

### Task 14: Add Subscriptions link to admin navigation

**Files:**
- Modify: `frontend/src/components/layout/vertical/VerticalMenu.tsx`

- [ ] **Step 1: Add admin subscriptions menu item**

In `VerticalMenu.tsx`, inside the admin "Kelola" SubMenu, add after the "Pesanan" MenuItem (after line 121):

```tsx
              <MenuItem href='/admin/subscriptions' icon={<i className='tabler-crown' />}>
                Langganan
              </MenuItem>
```

- [ ] **Step 2: Commit**

```
git add frontend/src/components/layout/vertical/VerticalMenu.tsx
git commit -m "feat: add Subscriptions link to admin navigation"
```
