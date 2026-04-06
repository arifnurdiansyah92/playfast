# Feature Research

**Domain:** Steam game sharing/rental marketplace platform
**Researched:** 2026-04-07
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **User Registration & Login** | Users need accounts to track purchases and access credentials. Every marketplace has this. | LOW | Email + password. JWT sessions. No OAuth needed for v1 -- target audience (Indonesian gamers) expects simple registration. |
| **Game Catalog with Search** | Users must find games quickly. Browsing without search is unusable at 100+ games. | MEDIUM | Deduplicated view across all Steam accounts. Search by name, filter by genre/category. Game images from Steam CDN (`img_icon_url` already fetched). |
| **Game Detail Page** | Users need to see what they're buying: game name, image, price, availability (slots remaining). | LOW | Pull from Steam API data already cached. Show available slots = number of accounts owning game minus active assignments. |
| **Purchase/Order Flow** | The core transaction. User selects game, confirms payment, gets access. | MEDIUM | Order record creation, status tracking (pending payment -> confirmed -> fulfilled). Manual payment confirmation by admin for v1. |
| **Credential Delivery (Post-Purchase)** | After payment, user must immediately see their assigned Steam account username + password. This is the core value proposition. | MEDIUM | Display on order detail page. Password stored encrypted at rest, decrypted only for delivery. Must feel instant after admin confirms payment. |
| **Steam Guard Code Generation** | Users need 2FA codes to log into Steam. Codes rotate every 30 seconds. This is THE differentiating capability -- without it, the platform has no reason to exist. | LOW | Already built in `steam_guard.py`. Expose via authenticated API endpoint scoped to user's assigned account. Log every code request. |
| **Play Instructions** | Users (especially non-technical ones) need step-by-step guidance on how to login to Steam, enter the guard code, download the game, and switch to offline mode. | LOW | Default template covering the standard flow. Admin can override per-game for edge cases (e.g., games requiring launchers). |
| **Order History** | Users need to see what they've purchased and access credentials for all their games. | LOW | List of orders with status, game name, assigned account, and quick access to code generation. |
| **Admin: Account Management** | Admin must upload .mafile + password, view all accounts, see game counts, remove accounts. | LOW | Already partially built in existing Flask app. Extend with bulk upload and status indicators (healthy/token-expired). |
| **Admin: Game Library Sync** | Admin triggers fetch of game lists from all Steam accounts. System deduplicates into unified catalog. | MEDIUM | Already built: `api_games/<account_name>` fetches per-account. Need: batch fetch all + deduplication + catalog table with aggregated slot counts. |
| **Admin: Order Management** | Admin views pending orders, confirms payments, which triggers account assignment and credential delivery. | MEDIUM | Order list with status filters. "Confirm payment" action triggers round-robin assignment. |
| **Admin: Price Management** | Admin sets price per game. Default 50,000 IDR, customizable per game. | LOW | Price field on catalog entries. Bulk price setting for efficiency. |
| **Account Assignment (Round-Robin)** | When user purchases a game, system assigns one of the Steam accounts that owns it, distributing evenly. | MEDIUM | Core algorithm: among accounts owning the game, pick the one with fewest active assignments. Tie-break by least recent assignment. Track assignment count per account. |
| **Game Availability Display** | Users must see how many "slots" are available (accounts with that game minus current assignments). | LOW | Computed field: `available_slots = total_accounts_with_game - active_assignments`. Show as "X available" on catalog. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Instant Code Generation (Self-Service)** | Competitors like Plati.market require users to contact seller for guard codes. SDA generates codes instantly from `.mafile` `shared_secret` -- no human in the loop. This is the single biggest differentiator. | LOW | Already implemented. Wrap in authenticated endpoint with rate limiting and audit logging. |
| **Code Request Audit Log** | Every code generation is logged (user, account, timestamp, IP). Gives admin visibility into potential abuse (e.g., user generating codes suspiciously often). | LOW | Simple append-only log table. Admin dashboard view with filters. |
| **Account Health Dashboard** | Admin sees at a glance which accounts have expired tokens, which need re-login, which have too many assignments. Proactive maintenance instead of user complaints. | MEDIUM | Check token validity periodically. Show red/yellow/green status. Alert when accounts need attention. |
| **Automatic Token Refresh** | System automatically refreshes access tokens before they expire, and auto-logins with saved passwords when refresh fails. Users never see "session expired" errors. | MEDIUM | Already partially built (`_ensure_fresh_token`). Need background job/cron to proactively refresh, not just on-demand. |
| **Smart Assignment Balancing** | Beyond simple round-robin: consider account health (valid tokens), current load, and avoid assigning accounts that are having issues. | MEDIUM | Weighted scoring: prefer accounts with valid tokens, fewer assignments, longer since last assignment. Skip accounts flagged as unhealthy. |
| **WhatsApp Payment Notification** | After user places order, auto-generate a WhatsApp deep link with pre-filled message to admin (order ID, amount, game name). Reduces friction for manual payment flow. | LOW | `https://wa.me/{adminNumber}?text={encodedMessage}`. No API integration needed, just a link. |
| **Game Image & Metadata Enrichment** | Pull header images, descriptions, genres, and tags from Steam Store API to make catalog visually rich. | MEDIUM | Steam Store API (`store.steampowered.com/api/appdetails?appids=X`) provides rich data. Cache aggressively -- game metadata rarely changes. |
| **Multi-Language Play Instructions** | Instructions in both Indonesian and English. Target market is Indonesian but some users prefer English. | LOW | Two template variants. Language toggle on instruction page. |
| **Slot Availability Alerts** | Notify users (or show on catalog) when a previously full game becomes available again. | MEDIUM | Check assignment changes. Simple "notify me" button that sends email or shows in-app notification when slot opens. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Automatic Payment Gateway (v1)** | "Users want instant checkout" | Adds significant complexity (Midtrans/Xendit integration, webhook handling, refund flows, payment reconciliation). Delays launch by weeks. Manual payment is fine for early traction in Indonesian market where bank transfer is common. | Manual payment confirmation by admin. Add gateway as a separate milestone after validating demand. WhatsApp deep link for payment coordination. |
| **Real-Time Chat/Support** | "Users need help" | Building chat is a rabbit hole (WebSockets, message persistence, presence, notifications). Most issues are simple (code not working, login help). | WhatsApp/Telegram link for support. FAQ page covering common issues. Per-game play instructions cover 90% of questions. |
| **User Reviews & Ratings** | "Marketplace needs social proof" | Users aren't reviewing "products" -- they're renting shared accounts. Reviews create weird incentives (rating the account? the game? the service?). Low-value signal for this use case. | None needed. The catalog IS the value -- users know what games they want. |
| **Refund System** | "What if users want money back?" | Automated refunds create abuse vectors (get credentials, request refund, keep playing offline). Complex to implement correctly with manual payments. | Handle refunds manually via admin. Admin can revoke access (change password on account) and issue refund offline. Keep it human for v1. |
| **Simultaneous Online Play** | "Users want to play online together" | Fundamentally impossible with shared accounts -- Steam kicks previous session on new login. Trying to solve this creates false expectations and support burden. | Be upfront: offline mode only. Clear instructions. This is a feature of the price point (50K IDR vs full game price). |
| **Mobile App** | "Everyone uses mobile" | Two separate codebases to maintain. Next.js responsive web works fine on mobile browsers. App store approval process adds delays and review risks for this type of service. | Responsive web design. PWA if needed later (add to homescreen, offline capability). |
| **Game Wishlist** | "Let users save games for later" | Adds complexity for minimal value. Users come with intent to buy specific games. Wishlist creates "browse and leave" behavior. | None. Keep the funnel tight: browse -> buy -> play. |
| **Subscription/Rental Duration Model** | "Charge monthly instead of one-time" | Adds billing complexity (recurring payments, expiration handling, grace periods, re-assignment). The project spec says permanent access model. | Permanent access per purchase. Simpler for users, simpler to build, simpler to manage. |
| **Account Password Change by Users** | "Let users change the Steam password" | Catastrophic: user changes password, all other users on that account lose access. Admin loses control of account entirely. | Passwords are read-only for users. Only admin can change passwords via CLI tool (already built: `cmd_change_password`). |

## Feature Dependencies

```
[.mafile Upload & Account Storage]
    |
    +---> [Steam API Game Fetch]
    |         |
    |         +---> [Game Deduplication & Catalog]
    |                   |
    |                   +---> [Game Catalog UI (Search/Filter)]
    |                   |         |
    |                   |         +---> [Game Detail Page]
    |                   |                   |
    |                   |                   +---> [Purchase/Order Flow]
    |                   |
    |                   +---> [Price Management]
    |                             |
    |                             +---> [Purchase/Order Flow]
    |
    +---> [Steam Guard Code Generation]
              |
              +---> [Credential Delivery]
                        |
                        +---> [Code Request Audit Log]

[User Registration & Auth]
    |
    +---> [Purchase/Order Flow]
    |         |
    |         +---> [Account Assignment (Round-Robin)]
    |         |         |
    |         |         +---> [Credential Delivery]
    |         |
    |         +---> [Admin Order Management]
    |         |
    |         +---> [Order History]
    |
    +---> [Steam Guard Code Generation (User-Facing)]

[Play Instructions Template]  (independent -- can be built anytime)

[Admin Dashboard]
    |
    +---> [Account Health Dashboard]  (enhances admin experience)
    +---> [Code Request Audit Log]  (enhances admin oversight)
```

### Dependency Notes

- **Game Catalog requires Game Fetch + Deduplication:** Cannot display games without first syncing from Steam API and deduplicating across accounts.
- **Purchase Flow requires User Auth + Catalog + Pricing:** All three must exist before a user can buy anything.
- **Credential Delivery requires Account Assignment:** User can only see credentials after being assigned a specific Steam account.
- **Code Generation (user-facing) requires Auth + Assignment:** User must be authenticated and have an active purchase to request codes for a specific account.
- **Audit Log enhances Code Generation:** Not a blocker, but should ship together for admin peace of mind.
- **Play Instructions are independent:** Can be built at any phase -- just static/templated content with optional per-game overrides.
- **Account Health Dashboard enhances Admin:** Not required for launch but prevents support burden as account count grows.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept.

- [ ] **Admin: .mafile upload + password storage** -- foundation of the entire platform
- [ ] **Admin: Game library sync from Steam API** -- populate the catalog
- [ ] **Game deduplication + catalog with search** -- users must find games
- [ ] **Admin: Price setting per game** -- must know cost before buying
- [ ] **User registration + login** -- track who bought what
- [ ] **Purchase flow with manual payment** -- the core transaction
- [ ] **Round-robin account assignment** -- fair, automated distribution
- [ ] **Credential delivery (username + password)** -- users get what they paid for
- [ ] **Steam Guard code generation (user-facing, logged)** -- the key differentiator
- [ ] **Play instructions (default template)** -- users know how to actually play
- [ ] **Admin order management** -- admin confirms payments, sees all orders
- [ ] **Order history for users** -- users access their purchased games

### Add After Validation (v1.x)

Features to add once core is working and users are buying.

- [ ] **Account health dashboard** -- add when managing 10+ accounts becomes painful
- [ ] **Game metadata enrichment (images, genres, descriptions)** -- add when catalog exceeds 50 games and browsing UX matters
- [ ] **WhatsApp payment notification link** -- add when payment coordination friction becomes apparent
- [ ] **Smart assignment balancing** -- add when simple round-robin causes issues (uneven load, unhealthy accounts)
- [ ] **Automatic token refresh (background job)** -- add when token expiration causes user complaints
- [ ] **Admin: bulk .mafile upload** -- add when onboarding many accounts at once
- [ ] **Slot availability alerts** -- add when popular games frequently have no slots

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Payment gateway integration (Midtrans/Xendit)** -- defer until manual payment becomes a bottleneck (likely 50+ orders/day)
- [ ] **Multi-language UI (Indonesian/English)** -- defer until user base demands it
- [ ] **Analytics dashboard** -- defer until business metrics matter (revenue per game, conversion rates)
- [ ] **Referral program** -- defer until organic growth plateaus
- [ ] **PWA support** -- defer until mobile usage data justifies it

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| User Registration & Login | HIGH | LOW | P1 |
| Game Catalog with Search | HIGH | MEDIUM | P1 |
| Game Detail Page | HIGH | LOW | P1 |
| Purchase/Order Flow | HIGH | MEDIUM | P1 |
| Credential Delivery | HIGH | MEDIUM | P1 |
| Steam Guard Code Generation (User) | HIGH | LOW | P1 |
| Play Instructions | HIGH | LOW | P1 |
| Order History | MEDIUM | LOW | P1 |
| Admin: Account Management | HIGH | LOW | P1 |
| Admin: Game Library Sync | HIGH | MEDIUM | P1 |
| Admin: Order Management | HIGH | MEDIUM | P1 |
| Admin: Price Management | MEDIUM | LOW | P1 |
| Account Assignment (Round-Robin) | HIGH | MEDIUM | P1 |
| Game Availability Display | MEDIUM | LOW | P1 |
| Code Request Audit Log | MEDIUM | LOW | P1 |
| Account Health Dashboard | MEDIUM | MEDIUM | P2 |
| Automatic Token Refresh | MEDIUM | MEDIUM | P2 |
| Game Metadata Enrichment | MEDIUM | MEDIUM | P2 |
| WhatsApp Payment Link | LOW | LOW | P2 |
| Smart Assignment Balancing | LOW | MEDIUM | P2 |
| Slot Availability Alerts | LOW | MEDIUM | P3 |
| Payment Gateway Integration | HIGH | HIGH | P3 |
| Multi-language UI | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | SteamRent (steam-rent.com) | Plati.market | GGSel.net | Our Approach (SDA) |
|---------|---------------------------|--------------|-----------|---------------------|
| Game catalog | Full catalog with categories, filters, "New/Coming Soon/Discount" sections | Per-seller listings, no unified catalog | Per-seller listings with game filtering | Unified catalog auto-populated from Steam accounts. No manual listing creation. |
| Pricing model | Per-game pricing, rental periods (daily/monthly), permanent purchase option | Per-seller pricing, varies wildly | Per-seller pricing | Admin-set per-game pricing. Default 50K IDR. Permanent access model. |
| Account delivery | Login + password via email after purchase | Login + password in chat, guard code on request | Instant delivery for some items | Instant on-screen delivery after admin payment confirmation. No email delay. |
| Steam Guard codes | User contacts support for codes | User contacts seller for codes | Varies by seller | Self-service instant code generation from .mafile. Biggest differentiator. |
| Play instructions | Generic FAQ section | Seller-specific notes per listing | Minimal guidance | Default offline-mode template + per-game admin overrides. Step-by-step with screenshots. |
| Multiple accounts per game | Not visible to buyer | Not visible to buyer | Not visible to buyer | Transparent slot system showing availability. Round-robin assignment. |
| Admin tools | Full CMS (categories, discounts, CRM) | Seller dashboard (listings, orders) | Seller dashboard | Purpose-built admin for account management, game sync, order flow, health monitoring. |
| Payment methods | Cards, crypto, e-wallets | Cards, PayPal, crypto | Cards, PayPal, crypto | Manual bank transfer (v1). Gateway integration (v2). |
| User restrictions | Cannot change account data, Family View enabled | Varies by seller terms | Varies | Read-only access to credentials. Offline play instructions. |
| Refund policy | Seller-dependent | Escrow with dispute resolution | Escrow with dispute resolution | Manual admin-handled refunds. No automated system. |

## Sources

- [SteamRent](https://steam-rent.com/en) -- competitor platform analysis (direct observation)
- [GGSel.net](https://ggsel.net/en/catalog/steam-renting-accounts) -- competitor rental marketplace
- [Plati.market](https://plati.market/itm/steam-rent-110-games-family-sharing/3685519?lang=en-US) -- marketplace for account rentals
- [G2G Marketplace](https://www.g2g.com/) -- global digital goods marketplace for patterns
- [Steam Support: Offline Mode](https://help.steampowered.com/en/faqs/view/0E18-319B-E34B-B2C8) -- offline play requirements
- [Steam Families FAQ](https://help.steampowered.com/en/faqs/view/054C-3167-DD7F-49D4) -- official sharing limitations
- [Steam Guard TOTP (node-steam-totp)](https://www.npmjs.com/package/steam-totp) -- code generation reference
- [FatBit: Online Game Renting Website Features](https://www.fatbit.com/fab/online-game-renting-buying-website-design-features-details/) -- general marketplace feature patterns
- [How to Go Offline on Steam (2026)](https://theportablegamer.com/2026/03/25/how-to-go-offline-on-steam-complete-guide-to-invisible-mode-offline-play-in-2026/) -- current offline mode guide

---
*Feature research for: Steam game sharing/rental marketplace platform*
*Researched: 2026-04-07*
