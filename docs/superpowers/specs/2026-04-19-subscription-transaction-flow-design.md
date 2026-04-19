# Subscription Transaction Flow

**Status:** Design
**Date:** 2026-04-19

## Motivation

Subscribing to a Playfast plan currently has a broken UX compared to ordering a game. When a user subscribes in manual payment mode, the frontend only shows a snackbar toast — no QRIS image appears, no transaction-detail page, no status tracking. Users are stuck: they can see the message but cannot scan a QR to actually pay.

In contrast, buying a game order redirects to a dedicated detail page (`/order/[orderId]`, rendered by `OrderConfirmPage.tsx`) that shows the QRIS image, WhatsApp button, Midtrans Snap integration, and polls for status changes until the order is confirmed.

A second gap: the transaction history page (`/orders`) only shows game purchases, not subscriptions. Users have no way to see their subscription history or revisit a pending subscription's QR.

This design closes both gaps by giving subscriptions their own transaction detail page (mirroring the order page) and adding a "Subscription" tab to the transaction history.

## Scope

In scope:
- Backend: single-subscription detail endpoint, lightweight status endpoint, user's-own-subscriptions list endpoint
- Frontend: new `SubscriptionConfirmPage` view + `/subscription/[subId]` route
- Frontend: redirect from `SubscribePage` to the new detail page after successful subscribe, replacing the current snackbar-and-do-nothing behavior
- Frontend: add a "Subscription" tab to the orders history page
- Ownership check on all new endpoints

Out of scope:
- Consolidating `Subscription` and `Order` models into one table (intentionally rejected — dual model is fine for now)
- Modifying the existing `/orders` endpoint to include subscriptions (separate endpoint instead)
- Auto-cancel of pending subscriptions after timeout (YAGNI; admin handles edge cases)
- Renewal flows, recurring billing, or plan upgrades
- Automated tests (policy: manual QA per existing project convention)

## Backend

### New endpoint: `GET /api/store/subscription/<int:sub_id>`

Single-subscription detail for the transaction detail page.

File: `backend/app/store/routes.py`

Response 200:
```json
{
  "subscription": {
    "id": 42,
    "plan": "monthly",
    "plan_label": "Monthly",
    "amount": 50000,
    "status": "pending_payment",
    "midtrans_order_id": "SUB-7-monthly-1713456789",
    "snap_token": "abc-def-...",
    "payment_type": null,
    "paid_at": null,
    "expires_at": null,
    "created_at": "2026-04-19T14:30:00+00:00"
  },
  "payment_mode": "manual",
  "manual_info": {
    "qris_image_url": "/uploads/...",
    "whatsapp_number": "6282240708329",
    "instructions": "Scan QRIS..."
  }
}
```

For Midtrans mode, `manual_info` is omitted and `payment_mode` is `"midtrans"` (or `"midtrans_production"`).

Auth: `@jwt_required()`. Ownership: 403 if `sub.user_id != current_user_id` (admins are not special-cased here — they use admin panel endpoints).

404 if subscription not found.

### New endpoint: `GET /api/store/subscription/<int:sub_id>/status`

Lightweight polling endpoint. Same auth + ownership checks.

Response 200:
```json
{
  "status": "pending_payment",
  "paid_at": null,
  "expires_at": null
}
```

Used by the detail page to poll every 8 seconds while status is `pending_payment`. Stops polling once status transitions to `active` or `expired`.

### New endpoint: `GET /api/store/my-subscriptions`

List current user's subscriptions for the history tab. Ordered by `created_at DESC`.

Response 200:
```json
{
  "subscriptions": [
    {
      "id": 42,
      "plan": "monthly",
      "plan_label": "Monthly",
      "amount": 50000,
      "status": "active",
      "paid_at": "2026-04-19T15:00:00+00:00",
      "expires_at": "2026-05-19T15:00:00+00:00",
      "created_at": "2026-04-19T14:30:00+00:00"
    },
    ...
  ]
}
```

### Existing `/api/store/subscription/subscribe` — no change

The response already includes `subscription.id` via `sub.to_dict()`. Frontend will consume that to redirect.

## Frontend

### New page: `/subscription/[subId]`

File: `frontend/src/app/(dashboard)/subscription/[subId]/page.tsx` — thin wrapper mirroring `/order/[orderId]/page.tsx`, passes `subId` to view.

File: `frontend/src/views/SubscriptionConfirmPage.tsx` — adapted from `OrderConfirmPage.tsx`.

Behavior:

1. On mount: `GET /api/store/subscription/{subId}` → render based on `subscription.status` and `payment_mode`
2. Poll `/api/store/subscription/{subId}/status` every 8s while `status === 'pending_payment'`, stop otherwise
3. **Manual mode, pending:** header with plan name + amount, QRIS image (from `manual_info.qris_image_url`), WhatsApp button (`href=https://wa.me/{number}?text=<pre-filled message with sub_id and plan>`), instructions text
4. **Midtrans mode, pending:** "Pay with Midtrans" button that calls `window.snap.pay(snap_token, ...)`. If user closes Snap, button stays available for retry.
5. **Status `active`:** success card, button "Browse Games" → `/store`, and info line "Subscription aktif hingga {expires_at}"
6. **Status `expired`:** expired state message, button "Renew" → `/subscribe`
7. **Fallback when QRIS image URL is empty:** show message "QRIS belum tersedia, silakan hubungi admin via WhatsApp" but keep WhatsApp button visible
8. **404 / 403:** show error card with "Subscription tidak ditemukan" + back button → `/subscribe`

Follow existing component patterns: MUI cards, `react-query` for data fetching, `useState` for local UI state, Snackbar for transient messages.

### Modified: `SubscribePage.tsx`

File: `frontend/src/views/SubscribePage.tsx`, handler `handleSubscribe` (currently lines 46-74).

Replace the current logic that branches on `payment_mode` with a unified redirect:

```ts
const result = await storeApi.subscribe(plan)
// All payment modes go through the detail page for consistent UX.
// Manual mode shows QRIS there; Midtrans mode triggers Snap via button there.
router.push(`/subscription/${result.subscription.id}`)
```

The Snap popup that currently fires inline (lines 59-66) is removed from this handler — the detail page handles Midtrans too, via a button the user clicks.

If the API call fails, keep the existing error snackbar behavior.

### Modified: orders history page — add Subscription tab

File: `frontend/src/views/orders/OrderHistoryPage.tsx` (referenced from `/orders` route).

Add MUI `Tabs`:
- Tab 1 "Pesanan Game" — existing content (orders list), default selected
- Tab 2 "Subscription" — new content: table with columns Plan, Amount, Status, Paid At, Expires At, Action
  - Action column: link to `/subscription/{id}` (label: "Lihat Detail")
  - Data source: `adminApi`-style `storeApi.getMySubscriptions()` → hits new `GET /api/store/my-subscriptions`

Subscription rows are visually distinguished by a badge "Subscription Monthly" / "Subscription Yearly" etc., with status chip colored by state (pending=warning, active=success, expired=default).

### New API client methods

File: `frontend/src/lib/api.ts`, within `storeApi`:

```ts
getSubscription(subId: number | string) {
  return request<{
    subscription: { id: number; plan: string; plan_label: string; amount: number; status: string; midtrans_order_id: string; snap_token: string | null; payment_type: string | null; paid_at: string | null; expires_at: string | null; created_at: string }
    payment_mode: 'manual' | 'midtrans' | 'midtrans_production' | 'midtrans_sandbox'
    manual_info?: { qris_image_url: string; whatsapp_number: string; instructions: string }
  }>(`/api/store/subscription/${subId}`)
},
getSubscriptionStatus(subId: number | string) {
  return request<{ status: string; paid_at: string | null; expires_at: string | null }>(`/api/store/subscription/${subId}/status`)
},
getMySubscriptions() {
  return request<{ subscriptions: Array<{ id: number; plan: string; plan_label: string; amount: number; status: string; paid_at: string | null; expires_at: string | null; created_at: string }> }>('/api/store/my-subscriptions')
},
```

## Data Flow (manual mode)

```
User clicks "Subscribe" on /subscribe
  ↓
POST /api/store/subscription/subscribe { plan: "monthly" }
  ↓ 201 { subscription: { id: 42, ... }, payment_mode: "manual", manual_info: {...} }
router.push('/subscription/42')
  ↓
SubscriptionConfirmPage mounts
  ↓
GET /api/store/subscription/42
  ↓ 200 { subscription, payment_mode: "manual", manual_info }
Render: QRIS image, plan/amount header, WhatsApp button, status chip "pending_payment"
  ↓
Status poll every 8s: GET /api/store/subscription/42/status
  ↓ (user transfers and admin confirms via admin panel)
Backend: sub.status = "active", sub.paid_at = now, sub.expires_at = paid_at + duration
  ↓ Next poll returns status="active"
Stop polling, re-render: success card, "Subscription aktif hingga 2026-05-19", button "Browse Games"
```

Midtrans mode differs only in render: instead of QRIS + WhatsApp, show "Pay with Midtrans" button that invokes `window.snap.pay(snap_token, ...)`. Status polling is identical.

## Error Handling

- **404 subscription not found:** detail page shows error state + back button to `/subscribe`
- **403 wrong user:** same as 404 from user's perspective (don't leak existence of other users' subs) — show "Subscription tidak ditemukan"
- **Status endpoint fails during polling:** silently retry on next interval (do not surface transient network errors to user)
- **Subscribe API returns 409 (already have active sub):** `SubscribePage` already handles this — no change
- **QRIS image URL missing in admin settings:** detail page shows fallback copy; WhatsApp button remains the primary action

## Testing (manual QA)

Per project convention, no automated tests. Manual verification flow:

1. **Manual mode, happy path:**
   - Set `payment_mode=manual` in admin settings; upload a QRIS image; set WhatsApp number
   - As a regular user: `/subscribe` → pick "Monthly" → verify redirect to `/subscription/{id}` → verify QRIS image renders, WhatsApp button is clickable with pre-filled message including sub ID
   - As admin: navigate to `/admin/subscriptions` → confirm the pending payment
   - Back as user: verify detail page auto-refreshes to "active" state within ~2s, "Browse Games" button works

2. **Midtrans mode, happy path:**
   - Set `payment_mode=midtrans_sandbox`; ensure sandbox keys are set
   - Subscribe → verify redirect to `/subscription/{id}` → click "Pay with Midtrans" → verify Snap modal opens with correct amount
   - Complete sandbox payment → verify status transitions to active

3. **Transaction history:**
   - Go to `/orders` → switch to "Subscription" tab → verify subscription row appears with correct status badge, plan label, expires_at
   - Click "Lihat Detail" → verify lands on `/subscription/{id}` detail page

4. **Ownership / 403:**
   - As user A, note one of A's subscription IDs
   - Login as user B, navigate to `/subscription/{A's sub id}` → expect error state
   - Directly hit `GET /api/store/subscription/{A's sub id}` as user B → expect 403

5. **Edge cases:**
   - Clear `manual_qris_image_url` in admin settings → subscribe in manual mode → verify fallback message shows but WhatsApp button still works
   - Subscribe to a plan when one is already active → expect existing `/subscribe` to handle 409 without change

## Risk & Mitigation

- **Dual-model confusion (`Order.type="subscription"` reference at `store/routes.py:120` vs. separate `Subscription` model):** This design does not resolve that ambiguity. The `type="subscription"` path appears to be legacy and unused by the subscribe endpoint, which goes through the `Subscription` model. No change here — flag for future cleanup.
- **Polling load:** 8s polling per open detail page. Acceptable at current scale (<1k concurrent users); if traffic grows, switch to server-sent events or webhook-driven invalidation.
- **Snap token expiry:** Midtrans snap tokens can expire. If a user revisits a pending Midtrans subscription after the token expired, the Pay button will fail with a Midtrans error. Mitigation: on 4xx from Snap, show retry message + instruction to contact admin. Out of scope to auto-regenerate tokens.

## Open Questions

None. Design is complete and actionable.
