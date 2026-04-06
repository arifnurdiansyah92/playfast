# SDA — Steam Game Sharing Platform

## What This Is

A web platform where an admin loads Steam accounts (via .mafile), and registered users browse a game marketplace, pay for games, and get instant access to Steam credentials + auto-generated Steam Guard codes. Games are fetched automatically from all loaded accounts, deduplicated into a single catalog, and each purchase is tracked to a specific account via round-robin assignment.

## Core Value

Users can instantly get a working Steam Guard code for any game they've purchased — no waiting, no manual admin intervention.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin can upload and manage Steam accounts (.mafile + password)
- [ ] System auto-fetches game libraries from all loaded accounts
- [ ] Games are listed in a marketplace with search, categories, and filters
- [ ] Admin can set price per game (default 50,000 IDR) and enable/disable listings
- [ ] Users register and login to the platform
- [ ] Users browse and purchase games
- [ ] Payment starts manual (admin confirms), gateway integration later
- [ ] Upon purchase, system assigns a Steam account via round-robin (among accounts that own that game)
- [ ] Users get Steam username + password for their assigned account
- [ ] Users can request Steam Guard codes instantly (auto-generated from .mafile)
- [ ] Every code request is logged for admin review
- [ ] Users can purchase multiple games (may get different accounts)
- [ ] Each game has play instructions (default template + optional per-game admin notes)
- [ ] Instructions guide users on offline mode play
- [ ] Multiple users can share the same Steam account (not simultaneous play)
- [ ] Admin dashboard to manage accounts, orders, users, and view code request logs
- [ ] Game deduplication — if 3 accounts have CS2, it's listed once with 3 available slots

### Out of Scope

- Real-time chat or support system — handle via WhatsApp/Telegram externally
- Automatic payment gateway integration — start manual, add later as separate milestone
- Mobile app — web-first, responsive design
- Game reviews/ratings from users — not in v1
- Refund system — handle manually

## Context

- Existing codebase: Python CLI tool (`sda.py`) with Steam Guard code generation, Steam API client for login/confirmations, and a basic Flask web UI for managing accounts
- Steam Guard codes rotate every 30 seconds, generated from `shared_secret` in .mafile
- Access tokens expire and need refresh or re-login (saved passwords enable auto-login)
- Game lists require authenticated Steam API calls (`IPlayerService/GetOwnedGames`)
- Target market: Indonesian users (IDR currency, likely Indonesian-language support later)
- "Offline mode" play is key — users login, download game, go to Steam offline mode, then play. This avoids simultaneous login conflicts.

## Constraints

- **Tech stack**: Flask API backend + Next.js frontend (in `frontend/` folder)
- **Auth source**: .mafile files are the single source of truth for Steam accounts
- **Currency**: IDR (Indonesian Rupiah), default price 50,000 IDR per game
- **Steam API**: Game fetching requires valid access tokens, auto-login with saved passwords when expired
- **Concurrency**: Multiple users may share an account but cannot play online simultaneously — offline mode instructions mitigate this

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Flask API + Next.js frontend | Admin already has Flask backend, Next.js gives modern marketplace UX | — Pending |
| Round-robin account assignment | Fair distribution, no admin bottleneck, scales with more accounts | — Pending |
| Instant code generation (logged) | Users get codes immediately for good UX, logs give admin oversight | — Pending |
| Permanent access model | Once paid, user always has access to that game's account | — Pending |
| Default offline play template with per-game notes | Covers 90% of games with generic template, admin can customize edge cases | — Pending |
| Manual payment first | Ship faster, add gateway integration as a future milestone | — Pending |

---
*Last updated: 2026-04-07 after initialization*
