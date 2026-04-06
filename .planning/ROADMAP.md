# Roadmap: SDA -- Steam Game Sharing Platform

## Overview

SDA transforms a pool of admin-managed Steam accounts into a self-service game marketplace. The build progresses from database and security foundation, through authentication, to Steam account ingestion, then the public storefront, then the core value pipeline (purchase, assignment, credential delivery, instant Steam Guard codes), and finally play instructions and the admin overview dashboard. Each phase delivers a verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Database, encryption, app structure, frontend scaffold
- [ ] **Phase 2: Authentication** - User registration, login, JWT sessions, admin role
- [ ] **Phase 3: Steam Account Management** - Admin account CRUD, game library sync, deduplication, pricing
- [ ] **Phase 4: Public Marketplace** - Game catalog browsing with search, filters, and slot availability
- [ ] **Phase 5: Orders & Credential Delivery** - Purchase flow, round-robin assignment, credentials, Steam Guard codes
- [ ] **Phase 6: Instructions & Admin Dashboard** - Play instructions and admin overview panel

## Phase Details

### Phase 1: Foundation
**Goal**: The project has a working database, secure credential storage, structured Flask backend, and a connected Next.js frontend -- ready for feature development
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. Flask app starts via application factory and serves API responses on a versioned endpoint
  2. PostgreSQL database is created with SQLAlchemy models and Alembic migrations run cleanly
  3. Next.js frontend loads in browser and can make a successful API call to the Flask backend
  4. .mafile and credential files are excluded from version control (git status shows no secrets)
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Authentication
**Goal**: Users can create accounts, log in, and stay authenticated; admins have elevated permissions
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can register with email and password, then immediately log in
  2. User session persists across browser refresh without re-entering credentials
  3. User can log out and is redirected to the public page
  4. Admin user can access admin-only API endpoints; regular user is rejected with 403
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Steam Account Management
**Goal**: Admin can onboard Steam accounts and the system builds a deduplicated game catalog with pricing
**Depends on**: Phase 2
**Requirements**: ACCT-01, ACCT-02, ACCT-03, ACCT-04, ACCT-05, GAME-01, GAME-02, GAME-06, GAME-07
**Success Criteria** (what must be TRUE):
  1. Admin can upload a .mafile with password and the account appears in the admin account list
  2. Admin can view, edit password for, and remove any loaded Steam account
  3. System fetches game libraries from all loaded accounts and stores them in the database
  4. Duplicate games across accounts are merged into a single catalog entry
  5. Admin can set a custom price per game and enable/disable individual game listings
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Public Marketplace
**Goal**: Users can browse a game catalog, search by name, filter by criteria, and see real-time slot availability
**Depends on**: Phase 3
**Requirements**: GAME-03, GAME-04, GAME-05
**Success Criteria** (what must be TRUE):
  1. User sees a marketplace page listing all enabled games with prices and available slot counts
  2. User can search games by name and results update accordingly
  3. User can filter games by genre and availability (in stock vs. out of stock)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Orders & Credential Delivery
**Goal**: Users can purchase a game, get assigned a Steam account, view credentials, and generate Steam Guard codes instantly
**Depends on**: Phase 4
**Requirements**: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05, ORD-06, CODE-01, CODE-02, CODE-03, CODE-04, CODE-05
**Success Criteria** (what must be TRUE):
  1. User can place an order for a game and receives confirmation with an assigned Steam account
  2. Account assignment uses round-robin distribution among accounts that own the game
  3. User can view their order history showing all purchased games and assigned accounts
  4. User sees the Steam username and password for their assigned account on the game access page
  5. User can click a button to generate a live Steam Guard code, and it only works for their assigned accounts
  6. Every code generation request is logged with user, account, and timestamp visible to admin
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Instructions & Admin Dashboard
**Goal**: Users see clear play instructions for every game, and admins have a centralized dashboard for oversight
**Depends on**: Phase 5
**Requirements**: INST-01, INST-02, INST-03, ADMIN-01, ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):
  1. Every game access page shows play instructions (default offline-mode template)
  2. Admin can customize instructions per game, overriding the default template
  3. Admin dashboard displays overview counts for accounts, games, orders, and users
  4. Admin can manage the game catalog (pricing and enable/disable) from the dashboard
  5. Admin can view the code request audit log from the dashboard
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Authentication | 0/? | Not started | - |
| 3. Steam Account Management | 0/? | Not started | - |
| 4. Public Marketplace | 0/? | Not started | - |
| 5. Orders & Credential Delivery | 0/? | Not started | - |
| 6. Instructions & Admin Dashboard | 0/? | Not started | - |
