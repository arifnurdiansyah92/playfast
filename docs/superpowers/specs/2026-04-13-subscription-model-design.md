# Subscription Business Model Design

## Summary

Add a subscription-based access model alongside the existing per-game purchase model. Subscribers pay a recurring fee (monthly, 3-monthly, or yearly) and get access to all games across all active Steam accounts. Both models coexist: subscribers can also have individual game purchases, and per-game buyers are unaffected.

## Key Decisions

- **Coexistence**: Subscription and per-game purchases are independent. A user can be a subscriber AND own purchased games.
- **Access mechanism**: Subscribers browse the catalog and click "Play" to get assigned an account for a specific game (same round-robin assignment logic). No upfront dump of all credentials.
- **Pricing**: Three fixed tiers (Monthly, 3-Monthly, Yearly) with admin-configurable prices stored in SiteSettings.
- **Expiry**: When a subscription expires, all subscription-sourced assignments are revoked. Per-game purchases remain active. Evaluated lazily on user interaction (no cron).
- **Payment**: Uses the same global payment mode (Midtrans sandbox/production or manual QRIS/WhatsApp) already configured by the admin.

## Data Model

### New: `Subscription` model

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | Integer FK(users.id) | indexed |
| plan | String(20) | `monthly`, `3monthly`, `yearly` |
| status | String(20) | `pending_payment`, `active`, `expired`, `cancelled` |
| amount | Integer | price paid in IDR |
| starts_at | DateTime(tz) | set when payment confirmed |
| expires_at | DateTime(tz) | computed from plan duration |
| midtrans_order_id | String(100) | unique, nullable, prefixed `SUB-` |
| snap_token | String(255) | nullable |
| payment_type | String(50) | nullable |
| paid_at | DateTime(tz) | nullable |
| created_at | DateTime(tz) | auto |

### Modified: `Order` model

Add column:
- `type` — String(20), default `"purchase"`. Values: `"purchase"` (existing), `"subscription"` (auto-fulfilled for subscribers).

### SiteSettings additions

| Key | Default | Description |
|---|---|---|
| `sub_price_monthly` | `"50000"` | Monthly subscription price (IDR) |
| `sub_price_3monthly` | `"120000"` | 3-month subscription price (IDR) |
| `sub_price_yearly` | `"400000"` | Yearly subscription price (IDR) |

No new tables for plan definitions. The three tiers are hardcoded as `monthly`/`3monthly`/`yearly`; only prices are configurable.

### Plan duration mapping

- `monthly` = 30 days
- `3monthly` = 90 days
- `yearly` = 365 days

## API Endpoints

### Store (user-facing)

**`GET /api/store/subscription/plans`** (public)
Returns the 3 plans with prices:
```json
{
  "plans": [
    {"plan": "monthly", "price": 50000, "duration_days": 30, "label": "Monthly"},
    {"plan": "3monthly", "price": 120000, "duration_days": 90, "label": "3 Months"},
    {"plan": "yearly", "price": 400000, "duration_days": 365, "label": "Yearly"}
  ]
}
```

**`POST /api/store/subscription/subscribe`** (auth required)
Body: `{"plan": "monthly"}`
- Creates a `Subscription` record with `status = "pending_payment"`
- If payment_mode is Midtrans: generates snap_token, returns it
- If payment_mode is manual: returns manual payment info (QRIS, WhatsApp)
- If user already has an active subscription, return error
- `midtrans_order_id` format: `SUB-{user_id}-{plan}-{timestamp}`

**`GET /api/store/subscription/status`** (auth required)
Returns current subscription state for the logged-in user:
```json
{
  "is_subscribed": true,
  "subscription": {
    "id": 1,
    "plan": "monthly",
    "status": "active",
    "expires_at": "2026-05-13T...",
    "starts_at": "2026-04-13T..."
  }
}
```

### Midtrans webhook extension

The existing `POST /api/store/webhook/midtrans` detects subscription payments by the `SUB-` prefix on `order_id`. On settlement:
- Set subscription `status = "active"`, `starts_at = now`, `expires_at = now + duration`
- Set `paid_at` and `payment_type`

### Order creation changes

`POST /api/store/orders` — existing endpoint, modified:
1. Check if user has an active subscription (status=active, expires_at > now)
2. If subscribed: create Order with `type = "subscription"`, skip payment, auto-fulfill immediately
3. If not subscribed: existing per-game purchase flow (unchanged)

### Admin

**Subscription prices**: Managed via existing `GET/PUT /api/admin/settings` — three new keys appear in the settings form.

**`GET /api/admin/subscriptions`**: List all subscriptions with filters.
Query params: `status` (active/expired/pending_payment/all), `page`, `per_page`
Returns subscription list with user email, plan, status, dates, amount.

**`POST /api/admin/subscriptions/{id}/confirm`**: For manual payment mode — admin confirms payment, activates the subscription (same pattern as manual order confirmation if it exists).

## Expiry Logic

Lazy evaluation on user interaction:
1. When checking subscription status (order creation, my-games, subscription/status endpoint), query the user's latest active subscription.
2. If `expires_at < now`: set `status = "expired"`, then revoke all assignments where the source order has `type = "subscription"` for that user.
3. Per-game purchase assignments are untouched (their orders have `type = "purchase"`).

This avoids the need for a background cron job. Expiry is evaluated on demand.

## Frontend Changes

### User-facing

**New: Subscription page (`/subscribe`)**
- Shows 3 plan cards with prices and duration
- "Subscribe" button on each plan
- If already subscribed: shows current plan, expiry date, "You're subscribed" state
- If subscription is pending payment: show retry payment option
- Payment flow identical to game purchase (Midtrans popup or manual QRIS)

**Modified: Game detail page**
- If user is subscribed: buy button becomes "Play" (or "Get Access")
- Clicking it creates an auto-fulfilled order with `type = "subscription"`, no payment
- If not subscribed: existing buy flow unchanged

**Modified: My Games page**
- Subscription-sourced games show a "Subscription" badge instead of "Purchased"
- If subscription expires, these games disappear (assignments revoked on next load)

**Navigation**
- Add "Subscribe" or "Premium" link, visible to non-subscribers
- For subscribers, could show a badge or "Premium" indicator

### Admin-facing

**Modified: Settings page**
- New "Subscription Pricing" section with 3 price input fields (Monthly, 3-Monthly, Yearly)

**New: Subscriptions section**
- Either a new page or a tab in the existing admin area
- Table: user email, plan, status, amount, starts_at, expires_at, paid_at
- Filter by status (active/expired/all)
- For manual payment mode: "Confirm Payment" button on pending subscriptions

## Migration

- Add `Subscription` table
- Add `type` column to `orders` table with default `"purchase"` (backfill existing rows)
- Add 3 SiteSettings defaults for subscription prices
