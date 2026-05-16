# Shopping Cart — Design

**Date:** 2026-05-17
**Status:** Approved, ready for plan

## Problem

User saat ini hanya bisa beli 1 game per checkout (`POST /api/store/checkout` create 1 Order dengan single `game_id`). User yang mau beli beberapa game harus checkout berkali-kali — bayar gateway fee N kali, isi promo code N kali, transfer N kali. Friction tinggi untuk bundle purchase.

## Goals

- User non-Premium bisa kumpulkan beberapa game di cart lalu checkout dalam 1 transaksi pembayaran
- Pricing (promo, referee discount, referral credit) diterapkan ke total cart
- Tidak refactor sistem Order/Assignment/Fulfillment existing — preserve semua flow refund, account flag, audit yang sudah jalan
- Cart persist di DB per user (multi-device)

## Non-Goals

- Quantity > 1 per game (1 game = 1 akses, tidak ada multi-quantity)
- Multi-promo (1 kode per cart only)
- Stock reservation / TTL (Steam account shared, no hard cap — lihat [project_fulfillment_model])
- Cart untuk Premium subscriber (Premium = all-access, tidak butuh cart)
- Split-payment per item (1 transaksi gateway untuk seluruh cart)

## Scope

Backend:
- `cart_items` table baru
- `orders.checkout_group_id` column baru
- Endpoint baru: cart CRUD + cart checkout
- Modifikasi payment callback handlers untuk handle group orders
- Modifikasi email sender untuk cart fulfillment

Frontend:
- Cart icon di navbar dengan badge
- `/cart` page
- `/cart/checkout` page
- Game page: tombol "Beli Sekarang" + "Tambah Keranjang"
- Hide cart untuk Premium user

## Architecture

### Data model

**New table `cart_items`:**

```
cart_items
  id                PK
  user_id           FK users.id, NOT NULL, indexed
  game_id           FK games.id, NOT NULL
  created_at        timestamptz, default now()
  UNIQUE (user_id, game_id)
```

Unique constraint mencegah duplicate game per user. Quantity tidak ada (selalu 1).

**Modified `orders` table:**

- Tambah `checkout_group_id VARCHAR(40) NULL, indexed`
- Existing rows tetap `NULL` (single-buy purchases)
- Cart checkout: semua N Orders share `checkout_group_id` yang sama, plus share `midtrans_order_id` / `tripay_reference` yang sama (1 payment gateway transaction)

Format `checkout_group_id`: `CG-{epoch_seconds}-{user_id}-{random_4_hex}` — readable + collision-safe.

**Tidak ada perubahan tabel lain.** Assignment, AccountFlag, EmailLog, Subscription, dll tetap reference `order_id` seperti sebelumnya.

### Cart endpoints

Blueprint baru `cart_bp` di `app/store/cart_routes.py` (atau extend existing `store/routes.py`), url_prefix `/api/cart`.

- `GET /api/cart` → `{ items: [{ id, game: {...}, added_at }], cart_subtotal: int, item_count: int }`
- `POST /api/cart/items` body `{ game_id }` → `{ item: {...}, cart_item_count }`. Validations: jwt_required, game exists & is_enabled, user is not Premium subscriber (active), user doesn't already own the game via fulfilled order, item not already in cart (idempotent — return existing if present).
- `DELETE /api/cart/items/<int:item_id>` → `{ message }`. Validate ownership.
- `DELETE /api/cart` → `{ message }`. Clear semua items user.

All endpoints `@jwt_required()`.

### Cart checkout endpoint

**`POST /api/store/checkout-cart`** body `{ promo_code?: string, apply_credit?: bool }`

Logic (transactional):

1. Reject 400 jika user punya active Premium subscription
2. Load cart_items user (with game). Reject 400 jika kosong.
3. Pre-validate per item:
   - game.is_enabled = True
   - paling tidak ada 1 `GameAccount` aktif (steam_account.is_active = True) untuk game ini
   - user belum punya `Order` dengan `status='fulfilled'` dan `game_id` ini
   - Jika ada item yang gagal validate → 400 dengan list `failed_items: [{ game_id, reason }]`. User suruh refresh/clean cart dulu.
4. Compute pricing pakai `pricing.compute_final_amount`-style helper baru `compute_cart_amount`:
   - `cart_subtotal = sum(game.price for cart_item in items)`
   - `first_order_discount` = 10% × cart_subtotal jika user belum pernah ada Order fulfilled
   - Validate `promo_code` via `validate_promo_code` adapted untuk cart context (lihat di bawah)
   - `promo_discount` dihitung pada `cart_subtotal - first_order_discount`
   - `credit_applied` = min(user.referral_credit, cart_subtotal - first_order_discount - promo_discount) jika `apply_credit`
   - `cart_total = max(0, cart_subtotal - first_order_discount - promo_discount - credit_applied)`
5. Generate `checkout_group_id`
6. Create N Order rows (status `pending_payment`, type `purchase`):
   - Prorate discounts per item: `share = game.price / cart_subtotal`
   - `order.amount_subtotal = game.price`
   - `order.promo_discount = round((first_order_discount + promo_discount) × share)` — keduanya digabung jadi total discount per item
   - `order.credit_applied = round(credit_applied × share)`
   - `order.amount = order.amount_subtotal - order.promo_discount - order.credit_applied`
   - Last order absorbs rounding remainder agar `sum(order.amount) == cart_total`
   - Semua orders: `checkout_group_id = <generated>`, `promo_code_id = <selected>` jika ada
7. Single Midtrans/Tripay transaction dengan `gross_amount = cart_total`. Save `midtrans_order_id` / `tripay_reference` ke **semua N orders**. Save `snap_token` jika Midtrans.
8. Deduct user.referral_credit by `credit_applied` (sebelum payment confirmed?) — **decision: deduct after payment confirmed**, pakai approach yang sama dengan existing single-buy. Verify existing pattern di codebase sebelum implement.
9. Delete `cart_items` user (cart "moved to checkout")
10. Create one `PromoCodeUsage` row per used promo (or one per cart? — **decision: 1 per cart**, attribute to first Order in group)
11. Return `{ checkout_group_id, orders: [...], total, snap_token | payment_url }`

**Penting:** Validasi promo di cart context — `validate_promo_code` saat ini terima single `order_type` + `game_id`. Untuk cart, semua items adalah type `game`. Helper baru `validate_promo_code_for_cart(code, user_id, cart_subtotal, cart_items)`:
- Scope `all` / `games` → boleh
- Scope `game:X` → boleh jika game X ada di cart; discount hanya pada item itu (atau pada subtotal cart? — **decision: pada subtotal cart** untuk simplicity)
- Scope `subscriptions` / `sub:X` → reject (bukan untuk cart)

### Payment callback (modified)

Existing `app/store/routes.py` Midtrans callback dan Tripay callback handler lookup Order by `midtrans_order_id` atau `tripay_reference` via `.first()`. Ubah ke `.all()`:

```python
orders = Order.query.filter_by(midtrans_order_id=mid).filter(Order.status == 'pending_payment').all()
if not orders:
    return ...
for order in orders:
    order.status = 'paid'  # or whatever the existing flow is
    order.paid_at = now
db.session.commit()
for order in orders:
    _fulfill_order(order)  # existing function
```

Email: kirim 1 email "cart fulfilled" alih-alih N email per game. Helper baru `send_cart_welcome_email(to, game_names: list, play_urls: dict, *, user_id, checkout_group_id)`. Untuk single-game order (legacy flow), tetap pakai `send_order_welcome_email` existing.

### Frontend

**Komponen baru:**
- `CartContext` (React context atau React Query state) — current cart state
- `<CartBadge />` di navbar — icon `tabler-shopping-cart` + count
- `<CartPage />` di `/cart` — table items + total + promo input + tombol "Lanjut Bayar"
- `<CartCheckoutPage />` di `/cart/checkout` — review final + tombol "Bayar"
- `<CartButton />` reusable untuk game page

**Modifikasi:**
- Navbar: tambah cart icon kanan-atas (dekat profile menu). Hidden untuk Premium subscriber.
- Game detail page: layout dengan 2 tombol primary "Beli Sekarang" + secondary "+ Keranjang". Premium → "Mainkan". Already owned → "Mainkan".
- Existing Buy Sekarang flow tetap utuh (1-click checkout)

**API client (`frontend/src/lib/api.ts`):**
- `cartApi.list()`, `cartApi.add(gameId)`, `cartApi.remove(itemId)`, `cartApi.clear()`, `cartApi.checkout({ promoCode?, applyCredit? })`

### Error handling

| Scenario | Behavior |
|---|---|
| Premium user POST add | 400 `{ error: "Premium subscriber doesn't need cart" }` |
| Already-owned game add | 400 `{ error: "You already own this game" }` |
| Empty cart checkout | 400 `{ error: "Cart is empty" }` |
| Pre-validate fail (item invalid) | 400 `{ error: "...", failed_items: [...] }` — user refresh cart |
| Webhook delivers for 1 of N orders only | Loop processes all in same group atomically — no partial |
| Race: user clicks "Beli Sekarang" on game already in cart | "Beli Sekarang" success → game now owned. Next time user opens cart, that game ke-filter saat pre-validate. UX: tampilkan banner "Item ini sudah kamu beli, dihapus dari cart". |
| Promo `sub:X` di-attempt di cart checkout | 400 "Promo ini tidak berlaku untuk cart" |

### Migration

- New table `cart_items` — `Model.__table__.create(db.engine, checkfirst=True)` di `_run_schema_upgrades`
- ALTER TABLE `orders` ADD COLUMN `checkout_group_id VARCHAR(40)` di `alter_statements`
- CREATE INDEX `ix_orders_checkout_group_id ON orders (checkout_group_id)`
- Tidak ada data migration — existing rows `checkout_group_id = NULL` (single-buy)

### Testing

Karena codebase belum punya pytest harness (per [feedback_marketing] convention), pakai manual smoke test:

- Add 2 game ke cart → checkout → verify 2 Order rows created dengan checkout_group_id sama
- Webhook payment success → semua 2 orders ter-fulfill, 1 email terkirim
- Add already-owned → 400
- Premium user add → 400
- Promo `all` di cart 3 game → discount applied to total, prorated per Order
- Refund 1 dari 3 orders di cart → only that Order refunded, others tidak terdampak (preserves existing refund flow)
- Edge: cart 1 item → checkout berjalan sama seperti single-buy (functionally) tapi tetap pakai cart path

## Open Items (resolve during planning)

- Email rendering: 1 cart-welcome email dengan multiple games — design HTML supaya rapi (table of games + multiple play URLs?)
- `PromoCodeUsage` granularity: 1 per cart atau 1 per Order? Spec memilih 1 per cart. Verify revenue-sharing accounting tetap betul (referrer commission per cart, bukan per game).
- Cart max size: tidak ada hard limit di spec — apakah perlu? Implementer decide reasonable default (e.g. 20 items) di plan.
- Existing single-buy `POST /api/store/checkout` — tetap berfungsi (legacy flow). Tidak dihapus.
