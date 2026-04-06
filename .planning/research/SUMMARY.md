# Project Research Summary

**Project:** SDA -- Steam Game Sharing Platform
**Domain:** Digital game rental/sharing marketplace (Steam ecosystem)
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

SDA is a Steam game sharing marketplace where an admin manages a pool of Steam accounts (with .mafile authenticator data), and customers purchase access to individual games. The platform core value proposition is self-service Steam Guard code generation -- competitors require users to contact sellers for 2FA codes, while SDA generates them instantly from stored .mafile secrets. The recommended approach is a Flask API backend with a Next.js frontend (both already partially built), PostgreSQL for production data, and a clear separation between public storefront, authenticated user dashboard, and admin panel. The existing CLI tool and Steam integration code (steam_guard.py, steam_client.py) are proven and should be wrapped in service layers rather than rewritten.

The biggest technical risk is credential security: the existing codebase stores Steam passwords with base64 encoding (not encryption) and has a real .mafile sitting in the backend directory with no gitignore protection. This must be fixed before any deployment. The biggest operational risk is Steam Terms of Service enforcement -- mass account bans are an inherent business risk that requires proactive health monitoring and account diversification. The biggest architectural risk is building the platform as a monolith without proper service boundaries, which would make the round-robin assignment logic, game sync, and code generation untestable and impossible to maintain.

The research strongly supports a phased build starting with security foundation and database models, followed by authentication, then Steam account management (wrapping existing code), then the public marketplace, and finally the order/assignment/code-generation pipeline. The stack is mature and well-documented -- Flask, SQLAlchemy, Next.js, MUI, TanStack Query -- with no experimental or risky technology choices. The primary unknowns are around Steam API rate limiting behavior at scale and the operational realities of managing 10+ shared accounts under Valve enforcement radar.

## Key Findings

### Recommended Stack

The stack leverages what is already in place (Flask backend, Next.js 16 with Vuexy template, MUI) and adds battle-tested libraries for the gaps. No framework migrations are needed. The backend adds SQLAlchemy 2.0 for ORM, Flask-JWT-Extended for auth, Fernet encryption for secrets at rest, and APScheduler for background game sync. The frontend adds TanStack Query for server state, Zustand for client state, and React Hook Form with Zod for validation. PostgreSQL is mandatory for production due to concurrent write safety and row-level locking required by the round-robin assignment algorithm.

**Core technologies:**
- **Flask 3.1.3 + SQLAlchemy 2.0**: Already in use, battle-tested, async-ready -- no reason to migrate to FastAPI
- **PostgreSQL 16+**: Concurrent writes, JSONB for game metadata, SELECT FOR UPDATE for assignment locking -- SQLite cannot do this safely
- **Flask-JWT-Extended 4.7.1**: Mature JWT with refresh tokens, token revocation, fresh token validation -- Flask owns auth entirely
- **Fernet (cryptography library)**: AES-128-CBC + HMAC for encrypting .mafile secrets and passwords at rest -- replaces dangerous base64 encoding
- **Next.js 16 + MUI 7 (Vuexy)**: Already installed, provides admin layouts, responsive design, DataGrid for tables
- **TanStack Query 5 + Zustand 5**: Server state caching with background refetch, plus lightweight client state -- no Redux overhead
- **Custom JWT client (no NextAuth/Auth.js)**: Flask owns auth; adding a JS auth library creates dual-auth complexity with zero benefit

### Expected Features

**Must have (table stakes):**
- User registration and login with JWT sessions
- Game catalog with search and filtering (deduplicated across accounts)
- Game detail page showing price and available slots
- Purchase/order flow with manual payment confirmation
- Credential delivery (username + password) after admin confirms payment
- Self-service Steam Guard code generation (the core differentiator)
- Play instructions (default offline-mode template)
- Order history for users
- Admin: account management, game library sync, order management, price management
- Round-robin account assignment with availability display
- Code request audit logging

**Should have (differentiators):**
- Account health dashboard (token status, login success rates)
- Automatic token refresh (background job, proactive)
- Game metadata enrichment (images, genres from Steam Store API)
- WhatsApp payment notification deep link
- Smart assignment balancing (weighted by load and health)

**Defer (v2+):**
- Payment gateway integration (Midtrans/Xendit) -- manual payment is fine for early traction
- Multi-language UI -- defer until user base demands it
- Mobile app -- responsive web is sufficient
- Subscription/rental duration model -- permanent access is simpler and is the project spec
- Real-time chat support -- WhatsApp link is sufficient
- Refund automation -- handle manually to prevent abuse

### Architecture Approach

The architecture is a classic three-tier system: Next.js frontend with BFF (Backend-for-Frontend) proxy layer, Flask API with Blueprint-based route organization and a service layer for business logic, and PostgreSQL with SQLAlchemy ORM. The frontend uses Next.js route groups to separate public storefront, authenticated user dashboard, and admin panel -- each with its own layout. The BFF proxy solves CORS and keeps JWT tokens in httpOnly cookies rather than localStorage. Flask Blueprints map to domain boundaries (auth, accounts, marketplace, orders, codes, admin), and services contain the business logic (assignment, code generation, game sync, Steam auth).

**Major components:**
1. **Public Storefront** (Next.js Server Components) -- game browsing, search, detail pages, SSR for SEO
2. **User Dashboard** (Next.js Client + Server Components) -- purchased games, credential access, code generation, order history
3. **Admin Dashboard** (Next.js + MUI DataGrid + Vuexy) -- account management, order confirmation, game catalog, audit logs
4. **BFF Proxy Layer** (Next.js Route Handlers) -- cookie-to-bearer token translation, same-origin API calls
5. **Flask Blueprints** (auth, accounts, marketplace, orders, codes, admin) -- thin route handlers with input validation
6. **Service Layer** (Steam auth, assignment, code generation, game sync) -- business logic, testable without HTTP
7. **SQLAlchemy Data Layer** -- User, SteamAccount, Game, GameAccount, Order, Assignment, CodeRequestLog, RoundRobinCounter

### Critical Pitfalls

1. **Passwords stored as base64 instead of encryption** -- The existing obfuscate() function uses base64 encoding, which is trivially reversible. Replace with Fernet (AES) encryption using an environment-variable key before any deployment. This is a Phase 1 blocker.
2. **.mafile credentials exposed in repository** -- A real .mafile exists in backend/ with no .gitignore. Add *.mafile, accounts.json, .env to root .gitignore immediately. Store .mafile contents encrypted in the database, not as raw files.
3. **Steam ToS violation risk** -- Account sharing is explicitly prohibited. This is an inherent business risk. Mitigate with offline-mode enforcement, account health monitoring, ban detection, geographic hosting consistency, and account portfolio diversification.
4. **Concurrent login conflicts** -- Steam kicks previous sessions on new login. Users sharing accounts will inevitably collide. Mitigate with clear offline-mode instructions, session awareness, and credential reveal rate limiting.
5. **Steam API rate limiting** -- Post-June 2025, Steam throttles to ~25 req/s with 60-120s retry penalties. Game sync must use queuing, exponential backoff, and aggressive caching (24h minimum). Build rate limiting into the Steam API client from day one.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Security
**Rationale:** Everything depends on the database schema, encryption, and application factory pattern. The existing codebase has critical security issues (base64 passwords, .mafile in repo) that must be fixed before building anything else. Architecture research confirms the application factory pattern and service layer are prerequisites for testability.
**Delivers:** Project restructure (flat app.py into factory pattern), PostgreSQL schema with all core models, Alembic migrations, Fernet encryption for credentials, .gitignore hardening, environment configuration, Steam API client with built-in rate limiting and token lifecycle management.
**Addresses:** Database schema domains (User, SteamAccount, Game, GameAccount, Order, Assignment, CodeRequestLog), encryption infrastructure, application factory, extensions setup.
**Avoids:** Pitfall 1 (base64 passwords), Pitfall 2 (.mafile in git), Pitfall 5 (rate limiting absent), Pitfall 7 (clock drift -- add Steam time sync), Pitfall 10 (server location decision), Pitfall 11 (audit logging infrastructure).

### Phase 2: Authentication System
**Rationale:** Nearly every feature requires authentication. The auth system spans both Flask (JWT issuance, refresh, role checks) and Next.js (BFF proxy, cookie handling, middleware route guards). Architecture research shows the BFF proxy pattern is essential for security (httpOnly cookies vs localStorage).
**Delivers:** Flask auth blueprint (register, login, refresh, logout), JWT with access + refresh tokens, role-based access control (user/admin), Next.js auth middleware, BFF proxy layer, useAuth hook, login/register pages using Vuexy blank layout.
**Addresses:** User Registration and Login (table stakes), auth flow from Architecture research, custom JWT client approach from Stack research.
**Avoids:** Pitfall 6 (token expiry cascade -- build refresh infrastructure correctly from the start).

### Phase 3: Steam Account Management (Admin)
**Rationale:** The admin must be able to onboard Steam accounts before there is any game catalog. This phase wraps the existing steam_client.py and steam_guard.py into proper service layers with encrypted database storage. Depends on Phase 1 (schema, encryption) and Phase 2 (admin auth).
**Delivers:** Admin account CRUD (upload .mafile + password), encrypted storage in PostgreSQL, Steam auth service (login, token refresh), game sync service with rate limiting and defensive caching, admin accounts page with MUI DataGrid.
**Addresses:** Admin: Account Management, Admin: Game Library Sync, Steam Auth Service, Game Sync Service from Architecture research.
**Avoids:** Pitfall 9 (empty game results -- defensive caching with anomaly detection), Pitfall 5 (rate limiting in game sync).

### Phase 4: Public Marketplace
**Rationale:** With accounts onboarded and games synced, the public storefront can be built. This is the customer-facing entry point. Architecture research confirms game catalog is SSR-friendly via Next.js Server Components.
**Delivers:** Game catalog with search and filtering, game detail pages with availability slots, price display, storefront layout (separate from admin), TanStack Query for data fetching with caching.
**Addresses:** Game Catalog with Search, Game Detail Page, Game Availability Display, Price Management, Game Deduplication from Features research.
**Avoids:** Pitfall 13 (deduplication edge cases -- use appid strictly), Pitfall 14 (stale cache -- link catalog to live account status).

### Phase 5: Order and Assignment Pipeline
**Rationale:** This is the core transaction flow. User places order, admin confirms payment, system assigns account via round-robin, user receives credentials. Depends on marketplace (Phase 4) and auth (Phase 2). This is the most complex phase with the most moving parts.
**Delivers:** Order creation, manual payment confirmation, round-robin account assignment with row-level locking, credential delivery, Steam Guard code generation endpoint with audit logging, play instructions, order history, admin order management.
**Addresses:** Purchase/Order Flow, Round-Robin Account Assignment, Credential Delivery, Steam Guard Code Generation (user-facing), Play Instructions, Order History, Admin Order Management, Code Request Audit Log.
**Avoids:** Pitfall 4 (concurrent login conflicts -- offline mode instructions with acknowledgment), Pitfall 8 (account hijacking -- credential reveal rate limiting, canary login monitoring), Pitfall 12 (naive round-robin -- use least-connections approach).

### Phase 6: Operational Hardening
**Rationale:** Post-launch improvements that reduce admin burden and improve reliability. These features are not needed for launch but become important once the platform has real users and 10+ accounts.
**Delivers:** Account health dashboard (token status, login success), background token refresh (APScheduler), smart assignment balancing, WhatsApp payment deep link, game metadata enrichment, bulk .mafile upload.
**Addresses:** All P2 features from Features research -- Account Health Dashboard, Automatic Token Refresh, Smart Assignment Balancing, WhatsApp Payment Link, Game Metadata Enrichment.
**Avoids:** Pitfall 6 (token cascade -- proactive background refresh), Pitfall 3 (ToS enforcement -- health monitoring and ban detection).

### Phase 7: Payment Automation (Future)
**Rationale:** Only needed when manual payment confirmation becomes a bottleneck (estimated at 50+ orders/day). Architect the payment adapter pattern in Phase 5 so this phase is a clean swap.
**Delivers:** Midtrans or Xendit integration, webhook handling, automatic payment confirmation, order status state machine.
**Addresses:** Payment Gateway Integration (P3 feature from Features research).
**Avoids:** Pitfall 15 (Indonesian payment complexity -- adapter pattern prepared in Phase 5).

### Phase Ordering Rationale

- Security and schema first because the existing codebase has critical vulnerabilities that block all other work, and every feature depends on database models.
- Auth before everything else because marketplace browsing is the only public feature; orders, credentials, codes, and admin all require authentication.
- Account management before marketplace because you cannot display games that have not been synced from Steam accounts.
- Marketplace before orders because users must browse and select games before purchasing.
- Orders/assignment as the culminating phase because it touches every other component (auth, accounts, games, codes) and is the most integration-heavy.
- Operational hardening after launch because these features optimize an already-working system rather than enabling it.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Foundation):** Needs research into Fernet encryption key management patterns and PostgreSQL connection pooling configuration for Gunicorn workers.
- **Phase 3 (Account Management):** Needs research into Steam API rate limiting specifics (exact daily limits, retry-after behavior) and token refresh lifecycle edge cases.
- **Phase 5 (Order Pipeline):** Needs research into SELECT FOR UPDATE behavior in SQLAlchemy 2.0 and race condition testing patterns for round-robin assignment.
- **Phase 7 (Payment):** Needs research into Midtrans/Xendit API specifics, webhook security, and IDR payment flow patterns.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Auth):** Flask-JWT-Extended + Next.js middleware is extremely well-documented with multiple 2026 guides.
- **Phase 4 (Marketplace):** Standard CRUD with search/filter. SSR with TanStack Query has extensive documentation.
- **Phase 6 (Hardening):** APScheduler background jobs, health checks, and metadata caching are straightforward patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs and PyPI/npm. Versions confirmed current. No experimental choices. |
| Features | HIGH | Competitor analysis covers 3 direct competitors. Feature dependencies mapped. MVP clearly scoped. |
| Architecture | HIGH | Standard Flask factory + Blueprint + service layer pattern. BFF proxy is documented by Next.js officially. Data models are straightforward relational. |
| Pitfalls | HIGH | Critical pitfalls verified against existing codebase audit, Steam API docs, security standards (CWE, OWASP), and ArchiSteamFarm reference implementation. |

**Overall confidence:** HIGH

### Gaps to Address

- **Steam API rate limiting specifics (2026):** The exact daily quota and burst limits are based on community reports, not official Valve documentation. Valve does not publish rate limits. Validate empirically during Phase 3 development.
- **Token refresh lifecycle edge cases:** The 207-day refresh token expiry is from community reports. Confirm with actual token inspection during account onboarding.
- **Account ban detection reliability:** The GetPlayerBans API detects VAC and community bans but may not surface all types of restrictions. Supplement with canary login checks.
- **Indonesian payment gateway selection:** Midtrans vs Xendit comparison needs fresh research when Phase 7 begins (pricing, API stability, supported payment methods may change).
- **Vuexy template compatibility:** Vuexy 5.0.1 with Next.js 16 and MUI 7 is assumed working since it was purchased and installed, but custom component integration needs validation during frontend phases.

## Sources

### Primary (HIGH confidence)
- Flask 3.1.x official docs: https://flask.palletsprojects.com/en/stable/
- SQLAlchemy 2.0.x docs: https://docs.sqlalchemy.org/en/20/
- Flask-JWT-Extended 4.7.1 docs: https://flask-jwt-extended.readthedocs.io/
- Next.js official docs (BFF pattern): https://nextjs.org/docs/app/guides/backend-for-frontend
- MUI official docs: https://mui.com/material-ui/
- TanStack Query docs: https://tanstack.com/query/latest
- Cryptography (Fernet) docs: https://cryptography.io/en/latest/fernet/
- Steam Web API / IPlayerService: https://partner.steamgames.com/doc/webapi/IPlayerService
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- ArchiSteamFarm Security Wiki: https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Security

### Secondary (MEDIUM confidence)
- Steam API rate limiting (post-June 2025): https://www.steamwebapi.com/blog/429-too-many-requests-for-getplayersummaries
- Auth.js/Better Auth merger context: https://github.com/nextauthjs/next-auth/discussions/13252
- Steam account sharing ban enforcement: https://www.kjcesports.com/feature/steam-account-sharing-will-get-you-banned/
- Competitor platforms: steam-rent.com, plati.market, ggsel.net (direct observation)
- Flask JWT best practices 2026: https://oneuptime.com/blog/post/2026-02-02-flask-jwt-authentication/view

### Tertiary (LOW confidence)
- Steam token expiry duration (207 days) -- community-reported, not officially documented
- Exact Steam API daily quota (100K requests) -- inferred from community testing, not Valve-published

---
*Research completed: 2026-04-07*
*Ready for roadmap: yes*
