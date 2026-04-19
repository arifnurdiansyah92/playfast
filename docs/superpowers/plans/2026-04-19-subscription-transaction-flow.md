# Subscription Transaction Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give subscription purchases the same transaction-detail UX as game purchases — QRIS/Snap on a dedicated page with status polling, plus a Subscription tab in transaction history.

**Architecture:** Three new backend endpoints under `/api/store/subscription/*`, one new frontend view mirroring `OrderConfirmPage` pattern, redirect from `SubscribePage` to detail page after subscribing (removes inline Snap popup), and a parent-level Tabs in `OrderHistoryPage` separating "Pesanan Game" from "Subscription". Subscription model stays separate from Order — this is pure UX alignment, not schema consolidation.

**Tech Stack:** Flask + SQLAlchemy backend, Next.js + MUI + @tanstack/react-query frontend. Matches existing project conventions; no new dependencies.

**Testing note:** Per project policy, no automated tests. Each task lists a concrete manual-verification step the implementer can run.

---

### Task 1: Backend — single-subscription detail endpoint

**Files:**
- Modify: `backend/app/store/routes.py` (add new route after `subscription_status` at line 281)

- [ ] **Step 1: Extend `Subscription.to_dict` to include `midtrans_order_id` and `snap_token`**

File: `backend/app/models.py`, method `Subscription.to_dict` (currently at lines 526-539).

The detail endpoint needs these two fields. Currently `to_dict` omits them. Add them to the returned dict. Replace the existing return with:

```python
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
            "midtrans_order_id": self.midtrans_order_id,
            "snap_token": self.snap_token,
            "payment_type": self.payment_type,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat(),
        }
```

- [ ] **Step 2: Add the detail endpoint after `subscription_status` (around line 281)**

```python
@store_bp.route("/subscription/<int:sub_id>", methods=["GET"])
@jwt_required()
def subscription_detail(sub_id: int):
    """Return full detail for a single subscription owned by the current user."""
    user_id = int(get_jwt_identity())
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404
    if sub.user_id != user_id:
        return jsonify({"error": "Subscription not found"}), 403

    payment_mode = SiteSetting.get("payment_mode")
    response = {
        "subscription": sub.to_dict(),
        "payment_mode": payment_mode,
    }
    if payment_mode == "manual":
        response["manual_info"] = {
            "qris_image_url": SiteSetting.get("manual_qris_image_url"),
            "whatsapp_number": SiteSetting.get("manual_whatsapp_number"),
            "instructions": SiteSetting.get("manual_payment_instructions"),
        }
    return jsonify(response), 200
```

- [ ] **Step 3: Manual verify**

With the Flask backend running, log in as a test user, subscribe to a plan (you can do this via the existing `/subscribe` page), note the subscription ID from the network response, then:

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:5000/api/store/subscription/{sub_id}
```

Expected: 200 with `subscription`, `payment_mode`, and `manual_info` (if manual mode). Confirm `snap_token` and `midtrans_order_id` are present in the subscription object.

Also test 404: `curl -H "Authorization: Bearer $JWT" http://localhost:5000/api/store/subscription/999999` → expect 404.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/store/routes.py
git commit -m "feat: subscription detail endpoint with payment info"
```

---

### Task 2: Backend — subscription status polling endpoint

**Files:**
- Modify: `backend/app/store/routes.py` (append after the Task 1 endpoint)

- [ ] **Step 1: Add the polling endpoint**

Append directly after `subscription_detail`:

```python
@store_bp.route("/subscription/<int:sub_id>/status", methods=["GET"])
@jwt_required()
def subscription_poll_status(sub_id: int):
    """Lightweight status poll for the detail page. Auth-checked."""
    user_id = int(get_jwt_identity())
    sub = db.session.get(Subscription, sub_id)
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404
    if sub.user_id != user_id:
        return jsonify({"error": "Subscription not found"}), 403

    return jsonify({
        "status": sub.status,
        "paid_at": sub.paid_at.isoformat() if sub.paid_at else None,
        "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
    }), 200
```

- [ ] **Step 2: Manual verify**

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:5000/api/store/subscription/{sub_id}/status
```

Expected: 200 with `{status, paid_at, expires_at}`. Status reflects current DB state.

- [ ] **Step 3: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat: subscription status polling endpoint"
```

---

### Task 3: Backend — my-subscriptions list endpoint

**Files:**
- Modify: `backend/app/store/routes.py` (append after Task 2)

- [ ] **Step 1: Add the list endpoint**

```python
@store_bp.route("/my-subscriptions", methods=["GET"])
@jwt_required()
def my_subscriptions():
    """Return all subscriptions for the current user, newest first."""
    user_id = int(get_jwt_identity())
    subs = (
        Subscription.query
        .filter_by(user_id=user_id)
        .order_by(Subscription.created_at.desc())
        .all()
    )
    return jsonify({"subscriptions": [s.to_dict() for s in subs]}), 200
```

- [ ] **Step 2: Manual verify**

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:5000/api/store/my-subscriptions
```

Expected: 200 with `{subscriptions: [...]}`. Array contains the test user's subscription(s), ordered newest first.

- [ ] **Step 3: Commit**

```bash
git add backend/app/store/routes.py
git commit -m "feat: my-subscriptions list endpoint for history"
```

---

### Task 4: Frontend — storeApi methods

**Files:**
- Modify: `frontend/src/lib/api.ts` (within `storeApi` object, add after `getSubscriptionStatus` at line 309)

- [ ] **Step 1: Add the three new methods**

Find this existing block (around lines 295-311):

```ts
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
      body: JSON.stringify({ plan }),
    })
  },
  getSubscriptionStatus() {
    return request<{ is_subscribed: boolean; subscription: Subscription | null }>('/api/store/subscription/status')
  },
```

Add the three new methods directly after `getSubscriptionStatus`:

```ts
  getSubscriptionById(subId: number | string) {
    return request<{
      subscription: Subscription
      payment_mode: string
      manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
    }>(`/api/store/subscription/${subId}`)
  },
  pollSubscriptionStatus(subId: number | string) {
    return request<{ status: string; paid_at: string | null; expires_at: string | null }>(`/api/store/subscription/${subId}/status`)
  },
  getMySubscriptions() {
    return request<{ subscriptions: Subscription[] }>('/api/store/my-subscriptions')
  },
```

- [ ] **Step 2: Ensure `Subscription` type includes `snap_token` and `midtrans_order_id`**

Find the `Subscription` interface in the same file. If `snap_token` and `midtrans_order_id` are missing, add them:

```ts
export interface Subscription {
  id: number
  user_id: number
  plan: string
  plan_label: string
  status: string
  amount: number
  starts_at: string | null
  expires_at: string | null
  midtrans_order_id: string | null
  snap_token: string | null
  payment_type: string | null
  paid_at: string | null
  created_at: string
}
```

If the interface already exists but is missing fields, add only the missing ones. If it already has all fields, leave it alone.

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: storeApi methods for subscription detail and history"
```

---

### Task 5: Frontend — SubscriptionConfirmPage view

**Files:**
- Create: `frontend/src/views/SubscriptionConfirmPage.tsx`

- [ ] **Step 1: Create the view file**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

import { storeApi, formatIDR } from '@/lib/api'
import type { Subscription } from '@/lib/api'

type DetailResponse = {
  subscription: Subscription
  payment_mode: string
  manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
}

const ManualPaymentSection = ({ subId, amount, planLabel, manualInfo }: {
  subId: number
  amount: number
  planLabel: string
  manualInfo: { qris_image_url: string; whatsapp_number: string; instructions: string }
}) => {
  const waNumber = manualInfo.whatsapp_number || ''
  const waMessage = encodeURIComponent(
    `Halo admin, saya sudah transfer untuk subscription #${subId} - ${planLabel} (${formatIDR(amount)}). Mohon dikonfirmasi.`
  )

  return (
    <Box sx={{ mt: 3, textAlign: 'left' }}>
      {manualInfo.instructions && (
        <Typography color='text.secondary' sx={{ mb: 2, textAlign: 'center' }}>
          {manualInfo.instructions}
        </Typography>
      )}
      {manualInfo.qris_image_url ? (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box
            component='img'
            src={manualInfo.qris_image_url}
            alt='QRIS'
            sx={{ maxWidth: 280, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          />
        </Box>
      ) : (
        <Alert severity='info' sx={{ mb: 3 }}>
          QRIS belum tersedia. Silakan hubungi admin via WhatsApp.
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <Typography variant='h5' sx={{ fontWeight: 700 }}>{formatIDR(amount)}</Typography>
      </Box>
      {waNumber && (
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant='contained'
            size='large'
            href={`https://wa.me/${waNumber}?text=${waMessage}`}
            target='_blank'
            startIcon={<i className='tabler-brand-whatsapp' />}
            sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' }, fontWeight: 700, px: 4 }}
          >
            Konfirmasi via WhatsApp
          </Button>
        </Box>
      )}
    </Box>
  )
}

interface Props {
  subId: string
}

const SubscriptionConfirmPage = ({ subId }: Props) => {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchDetail = useCallback(() => {
    storeApi.getSubscriptionById(subId).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => {
      setNotFound(true)
      setLoading(false)
    })
  }, [subId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    if (!data || data.subscription.status !== 'pending_payment') return

    const interval = setInterval(() => {
      storeApi.pollSubscriptionStatus(subId).then(res => {
        if (res.status !== 'pending_payment') {
          fetchDetail()
        }
      }).catch(() => {})
    }, 8000)

    return () => clearInterval(interval)
  }, [data?.subscription.status, subId, fetchDetail])

  if (loading) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Skeleton height={60} />
        <Skeleton height={200} sx={{ mt: 2 }} />
      </Box>
    )
  }

  if (notFound || !data) return <Alert severity='error'>Subscription tidak ditemukan</Alert>

  const sub = data.subscription
  const isPending = sub.status === 'pending_payment'
  const isActive = sub.status === 'active'
  const isExpired = sub.status === 'expired' || sub.status === 'cancelled'
  const isMidtrans = data.payment_mode !== 'manual'

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        {isPending && (
          <>
            <CircularProgress size={56} sx={{ mb: 2 }} />
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Menunggu Pembayaran
            </Typography>
            <Typography color='text.secondary'>
              Selesaikan pembayaran untuk mengaktifkan subscription.
            </Typography>
            {isMidtrans && sub.snap_token ? (
              <Button
                variant='contained'
                size='large'
                sx={{ mt: 3, px: 4 }}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).snap) {
                    (window as any).snap.pay(sub.snap_token, {
                      onSuccess: () => fetchDetail(),
                      onPending: () => {},
                      onError: () => {},
                      onClose: () => {},
                    })
                  }
                }}
              >
                Bayar Sekarang
              </Button>
            ) : data.manual_info ? (
              <ManualPaymentSection
                subId={sub.id}
                amount={sub.amount}
                planLabel={sub.plan_label}
                manualInfo={data.manual_info}
              />
            ) : null}
          </>
        )}
        {isActive && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'success.lightOpacity',
            }}>
              <i className='tabler-check' style={{ fontSize: 36, color: 'var(--mui-palette-success-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Subscription Aktif!
            </Typography>
            <Typography color='text.secondary'>
              Kamu sekarang bisa akses semua game di Playfast.
              {sub.expires_at && (
                <> Aktif hingga <strong>{new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
              )}
            </Typography>
          </>
        )}
        {isExpired && (
          <>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'error.lightOpacity',
            }}>
              <i className='tabler-x' style={{ fontSize: 36, color: 'var(--mui-palette-error-main)' }} />
            </Box>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Subscription Berakhir
            </Typography>
            <Typography color='text.secondary'>
              Subscription ini sudah tidak aktif. Silakan subscribe lagi untuk melanjutkan akses.
            </Typography>
          </>
        )}
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant='h6' sx={{ fontWeight: 700 }}>Playfast {sub.plan_label}</Typography>
            <Typography variant='body2' color='text.secondary'>Subscription #{sub.id}</Typography>
            <Typography variant='body2' color='text.secondary'>
              {new Date(sub.created_at).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Status</Typography>
              <Typography sx={{ fontWeight: 600, color: isActive ? 'success.main' : isPending ? 'warning.main' : 'error.main' }}>
                {isActive ? 'Aktif' : isPending ? 'Menunggu Pembayaran' : 'Berakhir'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography color='text.secondary'>Harga</Typography>
              <Typography sx={{ fontWeight: 600 }}>{formatIDR(sub.amount)}</Typography>
            </Box>
            {sub.payment_type && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Metode Pembayaran</Typography>
                <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{sub.payment_type.replace(/_/g, ' ')}</Typography>
              </Box>
            )}
            {sub.expires_at && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color='text.secondary'>Berlaku Sampai</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 2 }}>
        {isActive && (
          <Button
            variant='contained'
            size='large'
            fullWidth
            startIcon={<i className='tabler-device-gamepad-2' />}
            component={Link}
            href='/store'
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            Browse Games
          </Button>
        )}
        {isExpired && (
          <Button
            variant='contained'
            size='large'
            fullWidth
            component={Link}
            href='/subscribe'
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            Subscribe Lagi
          </Button>
        )}
        <Button
          variant='outlined'
          size='large'
          component={Link}
          href='/orders'
          sx={{ minWidth: 140, py: 1.5, ...(isActive || isExpired ? {} : { flex: 1 }) }}
        >
          Riwayat Transaksi
        </Button>
      </Box>
    </Box>
  )
}

export default SubscriptionConfirmPage
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/SubscriptionConfirmPage.tsx
git commit -m "feat: SubscriptionConfirmPage view with QR and status polling"
```

---

### Task 6: Frontend — route wrapper

**Files:**
- Create: `frontend/src/app/(dashboard)/subscription/[subId]/page.tsx`

- [ ] **Step 1: Create the route file**

```tsx
import type { Metadata } from 'next'

import SubscriptionConfirmPage from '@views/SubscriptionConfirmPage'

export const metadata: Metadata = {
  title: 'Subscription - Playfast',
}

export default async function Page({ params }: { params: Promise<{ subId: string }> }) {
  const { subId } = await params

  return <SubscriptionConfirmPage subId={subId} />
}
```

Note: The `params` as `Promise` pattern matches Next.js 15 conventions. If the project uses the older sync `params` pattern, check `/app/(dashboard)/order/[orderId]/page.tsx` and match that style. You can open that file to see the current convention. If that file uses plain `params: { orderId: string }` without Promise, use the same shape here.

- [ ] **Step 2: Verify route resolves**

Run `pnpm dev` in `frontend/`. Navigate to `http://localhost:3000/subscription/999999` (a non-existent ID) and verify the page loads with the "Subscription tidak ditemukan" alert from the view component. No Next.js routing errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(dashboard)/subscription/[subId]/page.tsx"
git commit -m "feat: /subscription/[subId] route"
```

---

### Task 7: Frontend — update SubscribePage to redirect

**Files:**
- Modify: `frontend/src/views/SubscribePage.tsx` (handler at lines 46-77)

- [ ] **Step 1: Replace the `handleSubscribe` body**

Find the current `handleSubscribe` function (starts at line 46). Replace its entire body with:

```tsx
  const handleSubscribe = async (plan: string) => {
    if (!user) {
      router.push('/register?redirect=/subscribe')
      return
    }

    setError('')
    setBuying(plan)

    try {
      const result = await storeApi.subscribe(plan)
      // Consistent UX: all payment modes go through the detail page.
      // The detail page renders QR (manual) or a Snap retry button (midtrans).
      router.push(`/subscription/${result.subscription.id}`)
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Failed to subscribe')
      setBuying(null)
    }
  }
```

The key behavioral changes:
- No more inline `window.snap.pay(...)` popup
- No more "Please complete payment via QRIS/WhatsApp" snackbar — the detail page shows QR
- Single redirect for both modes

Remove unused imports if any (`setSnackMsg` may now be unused if nothing else uses it — check and remove only if truly unused).

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors. If `setSnackMsg` was removed but `snackMsg` / `Snackbar` are still used elsewhere in the component (e.g. the existing `Snackbar` JSX at line 208), keep them; only remove truly orphaned imports.

- [ ] **Step 3: Manual browser verify**

Run the backend and frontend locally. Set `payment_mode=manual` in admin settings, upload a QRIS image, set a WhatsApp number. Log in as a regular user, go to `/subscribe`, click a plan's Subscribe button. Expect:
- Browser URL changes to `/subscription/{id}`
- Detail page shows QRIS image, plan name, amount, WhatsApp button
- No leftover snackbar from the old flow

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/SubscribePage.tsx
git commit -m "feat: SubscribePage redirects to subscription detail after subscribe"
```

---

### Task 8: Frontend — Subscription tab in OrderHistoryPage

**Files:**
- Modify: `frontend/src/views/orders/OrderHistoryPage.tsx`

- [ ] **Step 1: Read the current file to understand its shape**

Open `frontend/src/views/orders/OrderHistoryPage.tsx`. You'll see it already uses MUI `Tabs` for **status** filters (Semua / Aktif / Menunggu / Batal) at line ~50 (`tabFilters` array). The existing tabs use `Tab` with `value` that's a status filter string.

Plan: keep the existing status tabs *inside* the "Pesanan Game" section, but add a parent-level `Tabs` (with two values: `'purchases'` and `'subscriptions'`) that switches between the existing content and a new subscriptions table.

- [ ] **Step 2: Add parent-level tabs state and subscription data fetch**

At the top of the component (after existing `useState` calls), add:

```tsx
  const [topTab, setTopTab] = useState<'purchases' | 'subscriptions'>('purchases')
```

Next to the existing orders `useQuery`, add one for subscriptions:

```tsx
  const { data: subsData, isLoading: subsLoading } = useQuery({
    queryKey: ['my-subscriptions'],
    queryFn: () => storeApi.getMySubscriptions(),
    enabled: topTab === 'subscriptions',
  })
```

The `enabled: topTab === 'subscriptions'` ensures subscriptions are only fetched when the user clicks that tab (lazy loading).

- [ ] **Step 3: Wrap the existing render in a parent Tabs**

Find the component's return statement. Immediately inside the root container (likely a `<Box>` or `<div>`), wrap the existing content in a conditional so it only renders when `topTab === 'purchases'`. Add a `Tabs` component above that controls `topTab`.

Sketch (adapt to the actual return structure):

```tsx
return (
  <Box>
    <Tabs
      value={topTab}
      onChange={(_, v) => setTopTab(v)}
      sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab label='Pesanan Game' value='purchases' />
      <Tab label='Subscription' value='subscriptions' />
    </Tabs>

    {topTab === 'purchases' && (
      <>
        {/* ... existing return content goes here unchanged ... */}
      </>
    )}

    {topTab === 'subscriptions' && (
      <SubscriptionHistorySection
        isLoading={subsLoading}
        subscriptions={subsData?.subscriptions ?? []}
      />
    )}
  </Box>
)
```

You'll need to decide where the parent `<Box>` starts based on the file's current structure — wrap the existing top-level element.

- [ ] **Step 4: Add the `SubscriptionHistorySection` component inside the same file**

Above the `OrderHistoryPage` component's definition (but below the imports and helper definitions), add:

```tsx
import type { Subscription } from '@/lib/api'

const subStatusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  active: { label: 'Aktif', color: 'success' },
  pending_payment: { label: 'Menunggu Bayar', color: 'warning' },
  expired: { label: 'Kedaluwarsa', color: 'default' },
  cancelled: { label: 'Dibatalkan', color: 'error' },
}

const SubscriptionHistorySection = ({ isLoading, subscriptions }: { isLoading: boolean; subscriptions: Subscription[] }) => {
  if (isLoading) {
    return (
      <Box>
        {[1, 2, 3].map(i => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}
      </Box>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <Card variant='outlined'>
        <CardContent sx={{ textAlign: 'center', py: 6 }}>
          <i className='tabler-crown' style={{ fontSize: 48, opacity: 0.4 }} />
          <Typography variant='body1' color='text.secondary' sx={{ mt: 2 }}>
            Belum ada subscription.
          </Typography>
          <Button
            component={Link}
            href='/subscribe'
            variant='contained'
            sx={{ mt: 2 }}
          >
            Lihat Paket Subscription
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <TableContainer component={Card} variant='outlined'>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell>Plan</TableCell>
            <TableCell>Harga</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Dibayar</TableCell>
            <TableCell>Berlaku Sampai</TableCell>
            <TableCell align='right'>Aksi</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {subscriptions.map(sub => {
            const st = subStatusConfig[sub.status] ?? { label: sub.status, color: 'default' as const }

            return (
              <TableRow key={sub.id} hover>
                <TableCell>
                  <Typography variant='body2' sx={{ fontWeight: 600 }}>{sub.plan_label}</Typography>
                  <Typography variant='caption' color='text.secondary'>#{sub.id}</Typography>
                </TableCell>
                <TableCell>{formatIDR(sub.amount)}</TableCell>
                <TableCell>
                  <Chip size='small' label={st.label} color={st.color} variant='tonal' />
                </TableCell>
                <TableCell>{sub.paid_at ? formatDate(sub.paid_at) : '—'}</TableCell>
                <TableCell>{sub.expires_at ? formatDate(sub.expires_at) : '—'}</TableCell>
                <TableCell align='right'>
                  <Button
                    component={Link}
                    href={`/subscription/${sub.id}`}
                    size='small'
                    variant='outlined'
                  >
                    Lihat Detail
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
```

Note: `Subscription`, `Link`, `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow`, `Chip`, `Card`, `CardContent`, `Skeleton`, `Typography`, `Button`, `Box` should all already be imported in this file (per the Read in Step 1 — confirm). Only add imports that aren't there. `Link` is from `next/link`; if it's not imported, add `import Link from 'next/link'` at the top.

- [ ] **Step 5: Type-check**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual browser verify**

Run `pnpm dev`. Log in as a user with at least one subscription. Navigate to `/orders`. Expect:
- Two top-level tabs: "Pesanan Game" (default) and "Subscription"
- "Pesanan Game" tab shows existing order history unchanged
- Clicking "Subscription" tab switches to the new table; first click fetches data (loading skeleton briefly)
- Subscription row shows plan name with `#id` below, price, status chip, paid/expires dates, and a "Lihat Detail" button
- Clicking "Lihat Detail" navigates to `/subscription/{id}`

As a user with no subscriptions, verify the empty state shows the "Belum ada subscription" card with the "Lihat Paket Subscription" button that goes to `/subscribe`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/orders/OrderHistoryPage.tsx
git commit -m "feat: Subscription tab in transaction history"
```

---

## Final Verification

After all tasks complete, run from the repo root:

```bash
cd frontend && pnpm tsc --noEmit
cd ../backend && python -c "from app.store.routes import subscription_detail, subscription_poll_status, my_subscriptions; print('backend imports OK')"
```

Both should succeed with no errors. Then spot-check git log:

```bash
git log --oneline -10
```

Expected: 8 feat commits in task order (Task 1 may be 1-2 commits due to the models change; allow for it).

## End-to-End Smoke Test

1. Set `payment_mode=manual`, upload QRIS image, set WhatsApp number.
2. Log in as regular user → `/subscribe` → click Monthly.
3. Verify redirect to `/subscription/{id}` → QRIS shown, WhatsApp button works (message pre-fills with subscription ID).
4. As admin, go to `/admin/subscriptions`, confirm the pending payment.
5. Back as user: within ~8 seconds, detail page auto-refreshes to "Aktif" state.
6. Navigate to `/orders` → click "Subscription" tab → verify row appears with correct status + "Lihat Detail" link.
7. Click "Lihat Detail" → lands on `/subscription/{id}` showing active state.
8. Switch `payment_mode=midtrans_sandbox`. Subscribe again (as a different user or after the first sub expires). Verify redirect to `/subscription/{id}`, "Bayar Sekarang" button triggers Snap modal.

## Risk Checklist

- [ ] If the 8-second poll feels slow after admin confirmation, compare to `OrderConfirmPage` — it uses 8s too. Keep consistent. If you want faster feedback for this user flow specifically, make it 4s; just don't diverge silently.
- [ ] If `Subscription.snap_token` is `null` for manual-mode subs (which is correct behavior), the `isMidtrans && sub.snap_token` branch in `SubscriptionConfirmPage` correctly falls through to the `ManualPaymentSection` branch.
- [ ] If the existing `Snackbar` in `SubscribePage` becomes unused after Task 7 (because both success and error paths no longer call `setSnackMsg`), remove it. If any other code path still uses it (e.g. maybe a future "subscription already active" message), leave it.
