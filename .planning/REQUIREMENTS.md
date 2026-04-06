# Requirements: SDA — Steam Game Sharing Platform

**Defined:** 2026-04-07
**Core Value:** Users can instantly get a working Steam Guard code for any game they've purchased — no waiting, no manual admin intervention.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: System uses PostgreSQL database with SQLAlchemy models for all persistent data
- [ ] **FOUND-02**: .mafile files are protected from accidental git push via .gitignore
- [ ] **FOUND-03**: Flask app structured as application factory with blueprints
- [ ] **FOUND-04**: Next.js frontend in `frontend/` folder communicating with Flask API

### Authentication

- [ ] **AUTH-01**: User can register with email and password
- [ ] **AUTH-02**: User can login and receive JWT session
- [ ] **AUTH-03**: User session persists across browser refresh (httpOnly cookie)
- [ ] **AUTH-04**: Admin role exists with elevated permissions
- [ ] **AUTH-05**: User can logout

### Steam Account Management (Admin)

- [ ] **ACCT-01**: Admin can upload .mafile with password to add a Steam account
- [ ] **ACCT-02**: Admin can view all loaded Steam accounts with status
- [ ] **ACCT-03**: Admin can remove a Steam account
- [ ] **ACCT-04**: Admin can edit saved password for an account
- [ ] **ACCT-05**: System stores Steam account credentials (password readable for user delivery)

### Game Catalog

- [ ] **GAME-01**: System fetches game libraries from all loaded Steam accounts
- [ ] **GAME-02**: Games are deduplicated — same game across multiple accounts appears once in catalog
- [ ] **GAME-03**: Each game shows how many slots are available (accounts with that game minus active assignments)
- [ ] **GAME-04**: User can search games by name
- [ ] **GAME-05**: User can filter games (genre, availability)
- [ ] **GAME-06**: Admin can set price per game (default 50,000 IDR)
- [ ] **GAME-07**: Admin can enable/disable game listings

### Orders & Assignment

- [ ] **ORD-01**: User can place an order for a game (free access in v1, payment later)
- [ ] **ORD-02**: System assigns a Steam account via round-robin among accounts owning that game
- [ ] **ORD-03**: User can view order history with all purchased games
- [ ] **ORD-04**: Each order tracks which specific Steam account was assigned
- [ ] **ORD-05**: Admin can view and manage all orders
- [ ] **ORD-06**: Multiple users can be assigned the same Steam account (for different games or same game if multiple slots)

### Credential Delivery & Code Generation

- [ ] **CODE-01**: User sees assigned Steam username and password after purchase
- [ ] **CODE-02**: User can generate Steam Guard code instantly by clicking a button
- [ ] **CODE-03**: Code generation only works for accounts the user has been assigned
- [ ] **CODE-04**: Every code request is logged (user, account, timestamp)
- [ ] **CODE-05**: Admin can view code request logs

### Play Instructions

- [ ] **INST-01**: Each game has a default play instruction template (how to login, download, go offline)
- [ ] **INST-02**: Admin can customize instructions per game (override default template)
- [ ] **INST-03**: Instructions are shown to user on their game access page

### Admin Dashboard

- [ ] **ADMIN-01**: Admin dashboard with overview of accounts, games, orders, users
- [ ] **ADMIN-02**: Admin can manage game catalog (pricing, enable/disable)
- [ ] **ADMIN-03**: Admin can view code request audit logs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Payment Integration

- **PAY-01**: Manual payment confirmation by admin (bank transfer workflow)
- **PAY-02**: WhatsApp deep link for payment coordination
- **PAY-03**: Payment gateway integration (Midtrans/Xendit)

### Enhanced Operations

- **OPS-01**: Account health dashboard (token status, assignment load)
- **OPS-02**: Background automatic token refresh
- **OPS-03**: Smart assignment balancing (weighted scoring beyond round-robin)
- **OPS-04**: Bulk .mafile upload
- **OPS-05**: Slot availability alerts for users

### Catalog Enrichment

- **ENRICH-01**: Game metadata from Steam Store API (images, descriptions, genres, tags)
- **ENRICH-02**: Game detail page with rich info
- **ENRICH-03**: Multi-language UI (Indonesian/English)

### Security Hardening

- **SEC-01**: Rate limiting on code generation endpoint
- **SEC-02**: Encrypt passwords at rest, decrypt only for authorized delivery

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat/support | Handle via WhatsApp/Telegram externally |
| User reviews/ratings | Not meaningful for shared account model |
| Refund system | Handle manually by admin |
| Simultaneous online play | Impossible with shared accounts — offline mode only |
| Mobile app | Web-first, responsive design sufficient |
| Account password change by users | Catastrophic — would lock out all other users |
| Subscription/rental duration | Permanent access model is simpler |
| Game wishlist | Minimal value, adds browse-and-leave behavior |
| OAuth/social login | Email+password sufficient for target market |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| ACCT-01 | Phase 3 | Pending |
| ACCT-02 | Phase 3 | Pending |
| ACCT-03 | Phase 3 | Pending |
| ACCT-04 | Phase 3 | Pending |
| ACCT-05 | Phase 3 | Pending |
| GAME-01 | Phase 3 | Pending |
| GAME-02 | Phase 3 | Pending |
| GAME-03 | Phase 4 | Pending |
| GAME-04 | Phase 4 | Pending |
| GAME-05 | Phase 4 | Pending |
| GAME-06 | Phase 3 | Pending |
| GAME-07 | Phase 3 | Pending |
| ORD-01 | Phase 5 | Pending |
| ORD-02 | Phase 5 | Pending |
| ORD-03 | Phase 5 | Pending |
| ORD-04 | Phase 5 | Pending |
| ORD-05 | Phase 5 | Pending |
| ORD-06 | Phase 5 | Pending |
| CODE-01 | Phase 5 | Pending |
| CODE-02 | Phase 5 | Pending |
| CODE-03 | Phase 5 | Pending |
| CODE-04 | Phase 5 | Pending |
| CODE-05 | Phase 5 | Pending |
| INST-01 | Phase 6 | Pending |
| INST-02 | Phase 6 | Pending |
| INST-03 | Phase 6 | Pending |
| ADMIN-01 | Phase 6 | Pending |
| ADMIN-02 | Phase 6 | Pending |
| ADMIN-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after roadmap creation*
