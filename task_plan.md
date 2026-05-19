# Task Plan: Game Catalog Showcase Page

## Goal
Public shareable page listing all games across all accounts with total catalog value and price tier breakdown.

## Phases
- [ ] Phase 1: Backend — new public API endpoint returning all enabled games with stats
- [ ] Phase 2: Frontend — create catalog showcase page at /katalog
- [ ] Phase 3: Verify and push

## Design
- Public page (no login required), shareable URL: /katalog
- Shows total game count, total catalog value (sum of prices)
- Price tier breakdown: e.g., "> Rp 500K: 30 games", "> Rp 200K: 80 games"
- Full game list with thumbnail, name, genre, price
- Styled like landing page (dark theme, gold accents) for sharing appeal

## Status
**Currently in Phase 1**

---

# Completed: Redeem Code / Giveaway Campaigns (2026-05-19)

Admin can create giveaway campaigns and generate batches of unique redeem
codes that grant either a subscription or a specific game when redeemed
by a logged-in user.

- Backend models: `RedeemCampaign`, `RedeemCode` (in `app/models.py`)
- Admin endpoints under `/api/admin/redeem/campaigns` (CRUD + `/generate`,
  `/codes`, `/codes.csv`)
- User endpoint `POST /api/redeem/redeem` (atomic with row lock)
- Admin page: `/admin/redeem` (view: `AdminRedeemPage.tsx`)
- User page: `/redeem` (with `?code=XXX` prefill for shareable links)
- Sidebar entries added to both vertical and horizontal admin menus,
  plus a user-facing "Tukar Kode" entry next to "Promo Saya"
