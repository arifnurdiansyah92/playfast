# Technology Stack

**Project:** SDA -- Steam Game Sharing Platform
**Researched:** 2026-04-07

## Recommended Stack

### Backend -- Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Flask | 3.1.3 | API framework | Already in use. Lightweight, battle-tested, async support since 3.1. No reason to migrate. | HIGH |
| SQLAlchemy | 2.0.46 | ORM | Industry standard Python ORM. Use 2.0.x stable, not 2.1 beta. Typed query support, async-ready, excellent Flask integration. | HIGH |
| Flask-SQLAlchemy | 3.1.1 | Flask-SQLAlchemy integration | Thin wrapper connecting Flask app lifecycle to SQLAlchemy sessions. Handles teardown, config from Flask app. | HIGH |
| Flask-Migrate | 4.1.0 | Database migrations | Alembic wrapper for Flask. Auto-generates migration scripts from model changes. Version 4.0+ has `compare_type=True` and `render_as_batch=True` by default. | HIGH |
| Flask-JWT-Extended | 4.7.1 | JWT authentication | Most mature Flask JWT library. Built-in refresh tokens, token revocation, fresh token validation. Short-lived access + long-lived refresh is the standard pattern. | HIGH |
| Flask-CORS | 6.0.2 | Cross-origin requests | Required for Next.js frontend on different port/domain. Handles preflight caching, per-route CORS config. | HIGH |
| marshmallow | 4.3.0 | Request/response serialization | Schema-based validation and serialization. Pairs with SQLAlchemy via marshmallow-sqlalchemy for auto-generated schemas from models. | HIGH |
| Flask-Marshmallow | 1.4.0 | Marshmallow-Flask integration | Integrates marshmallow with Flask and SQLAlchemy. Provides `ma.SQLAlchemyAutoSchema` for model-based schema generation. | HIGH |
| cryptography | 46.0.6 | Encryption at rest | Fernet symmetric encryption for .mafile secrets (shared_secret, identity_secret, passwords). AES-128-CBC + HMAC authentication. Never store secrets in plaintext. | HIGH |
| APScheduler | 3.11.2 | Background tasks | Scheduled game library refresh from Steam API. In-process scheduler, no Redis/Celery overhead for this scale. Interval trigger for periodic fetches. | MEDIUM |

### Backend -- Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-dotenv | latest | Environment variables | Load `.env` for database URLs, secret keys, encryption keys. Every environment. |
| gunicorn | latest | Production WSGI server | Production deployment. Never use Flask dev server in production. |
| marshmallow-sqlalchemy | latest | Auto-schema generation | Generates marshmallow schemas from SQLAlchemy models. Reduces boilerplate for CRUD endpoints. |
| Werkzeug | (bundled) | Secure file handling | Already a Flask dependency. Use `secure_filename()` for .mafile uploads. |
| requests | latest | Steam API calls | Already in use for Steam API communication. Keep using it. |
| rsa | latest | Steam auth encryption | Already in use for Steam login RSA encryption. Keep using it. |
| pytest | latest | Testing | Unit and integration tests. Use pytest-flask for Flask app testing fixtures. |

### Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 16+ | Production database | Concurrent read/write support critical for multi-user marketplace. JSONB for flexible game metadata. Row-level locking for account assignment (round-robin). SQLite cannot handle concurrent writes safely. | HIGH |
| SQLite | 3.x | Development/testing only | Zero-config for local dev. SQLAlchemy abstraction means same code works with both. Use for `pytest` and local `flask run`. | HIGH |

**Why PostgreSQL over SQLite for production:** This platform has concurrent users purchasing games, generating Steam Guard codes, and admins managing accounts simultaneously. SQLite uses file-level locking -- a single write blocks all other writes. PostgreSQL handles concurrent writes natively. The round-robin account assignment needs `SELECT ... FOR UPDATE` row locking to prevent race conditions where two users get assigned the same account slot. SQLite cannot do this.

**Why PostgreSQL over MySQL:** PostgreSQL has native JSONB support for storing flexible game metadata from Steam API, better support for `SELECT ... FOR UPDATE SKIP LOCKED` for queue-like patterns, and is the standard choice in the Python/Flask ecosystem.

### Frontend -- Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.1.1 | React framework | Already installed. App Router, server components, Turbopack. Handles SSR, routing, middleware for auth checks. | HIGH |
| React | 19.2.3 | UI library | Already installed. Latest stable with concurrent features. | HIGH |
| TypeScript | 5.9.3 | Type safety | Already installed. Non-negotiable for a project of this scale. | HIGH |
| MUI (Material UI) | 7.3.6 | Component library | Already installed via Vuexy template. Provides DataGrid, dialogs, tables, form controls. Do NOT add a second component library. | HIGH |
| Tailwind CSS | 4.1.17 | Utility styling | Already installed. Use for layout, spacing, responsive design. MUI for complex components, Tailwind for everything else. | HIGH |

### Frontend -- State & Data

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| TanStack Query | 5.96.x | Server state management | De facto standard for data fetching in React. Caching, background refetch, optimistic updates, request deduplication. 12M+ weekly npm downloads. Pairs perfectly with Next.js SSR via HydrationBoundary. | HIGH |
| Zustand | 5.0.12 | Client state management | Lightweight global state for UI concerns (cart, auth state, sidebar). No Provider wrapper, SSR-friendly, 20M+ weekly downloads. Simpler than Redux for this scale. | HIGH |
| React Hook Form | latest | Form management | Zero re-render form handling. Pair with @hookform/resolvers + Zod for schema validation. Standard Next.js pattern for login, registration, admin forms. | HIGH |
| Zod | latest | Schema validation | TypeScript-first validation. Share schemas between client validation and API request validation. Infer types from schemas. | HIGH |

### Frontend -- Auth (Client Side)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom JWT client | N/A | Auth state management | Flask backend owns auth entirely via Flask-JWT-Extended. The frontend stores JWT in HttpOnly cookies, reads auth state, and attaches tokens to requests. No NextAuth/Auth.js/Better Auth needed -- they add complexity for a custom backend that already handles auth. | HIGH |

**Why NOT NextAuth/Auth.js/Better Auth:** All three are designed for Node.js backends and manage their own user tables. This project's auth lives in Flask with Flask-JWT-Extended. Adding a JS auth library means: (1) maintaining two auth systems, (2) syncing user state between Flask DB and JS auth DB, (3) fighting the library when it tries to manage sessions its own way. A thin custom hook (`useAuth`) with TanStack Query for login/logout/refresh is simpler and works perfectly with a Flask JWT backend.

**Context on Auth.js/Better Auth merger:** In September 2025, the Auth.js (NextAuth.js) team joined Better Auth. Auth.js is in maintenance mode (security patches only). Better Auth (v1.5.6) is the successor but still Node.js-focused. Neither integrates cleanly with Flask backends without ugly proxy hacks.

### Admin Dashboard

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vuexy MUI Next.js Template | 5.0.1 | Admin UI framework | Already purchased and installed. Provides layouts, navigation, theming, responsive design. Build admin pages as route groups within the same Next.js app (`/admin/*`). | HIGH |
| MUI DataGrid (from @mui/x-data-grid) | 7.x | Data tables | MUI's official advanced data grid. Sorting, filtering, pagination, column resize, CSV export. Consistent with the MUI ecosystem already in use. Install `@mui/x-data-grid` separately. | HIGH |

### Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Docker + Docker Compose | latest | Local dev & deployment | Containerize Flask API + PostgreSQL + Next.js. Reproducible environments, easy onboarding. | MEDIUM |
| Nginx | latest | Reverse proxy | Route `/api/*` to Flask, everything else to Next.js. SSL termination, static file serving. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend framework | Flask 3.1.3 | FastAPI | Flask is already built and working. FastAPI would require rewriting all Steam API integration, .mafile handling, and login flows. Migration cost far exceeds async benefits at this scale. |
| ORM | SQLAlchemy 2.0.x | Peewee, Tortoise ORM | SQLAlchemy is the standard for Flask. Peewee is simpler but less powerful. Tortoise is async-native but overkill when Flask handles concurrency fine at this scale. |
| Database | PostgreSQL | MySQL | PostgreSQL has better JSONB support, `FOR UPDATE SKIP LOCKED`, and is the default in Python ecosystem. MySQL adds no advantage here. |
| Database | PostgreSQL | MongoDB | Relational data (users, orders, accounts, games) is inherently relational. MongoDB would require denormalization that makes order tracking and account assignment harder, not easier. |
| Frontend auth | Custom JWT client | NextAuth/Auth.js/Better Auth | All assume Node.js backend ownership. Flask owns auth. Adding these creates dual-auth complexity. See detailed rationale above. |
| Client state | Zustand | Redux Toolkit | Redux has more boilerplate, requires Provider wrapper, and is overkill for the simple client state this app needs (UI state, cart). Zustand does the same in 1/5th the code. |
| Server state | TanStack Query | SWR | TanStack Query has richer devtools, mutation support, infinite queries, and better SSR integration. SWR is lighter but lacks mutation orchestration. |
| Form library | React Hook Form + Zod | Formik | Formik re-renders on every keystroke. React Hook Form uses uncontrolled inputs for zero re-renders. Clear winner for performance. |
| Encryption | cryptography (Fernet) | PyCrypto, PyCryptodome | PyCrypto is abandoned. PyCryptodome is low-level. Fernet provides authenticated encryption with a simple API -- exactly what we need for .mafile secrets. |
| Background tasks | APScheduler | Celery + Redis | Celery is a distributed task queue -- massive overkill for periodic game library refreshes. APScheduler runs in-process with zero infrastructure. Add Celery later only if needed. |
| Admin dashboard | Vuexy (already owned) | AdminJS, React-Admin | Vuexy is already purchased and integrated. React-Admin is for CRUD-heavy apps with REST backends but adds a separate framework. Building admin within the same Next.js app using Vuexy components is simpler. |
| Data tables | MUI X DataGrid | TanStack Table | MUI DataGrid is a full component with sorting/filtering/pagination built in. TanStack Table is headless (UI-less) -- you'd have to build the UI from scratch. Since we're already in MUI land, DataGrid is the path of least resistance. |
| HTTP client (frontend) | fetch (native) | Axios | Next.js extends native fetch with caching and deduplication. Axios opts out of these features. Use a thin wrapper around fetch (or TanStack Query's `queryFn`) to hit the Flask API. No extra dependency needed. |

## Installation

### Backend (Python)

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Core
pip install flask==3.1.3 flask-sqlalchemy==3.1.1 flask-migrate==4.1.0 flask-jwt-extended==4.7.1 flask-cors==6.0.2 flask-marshmallow==1.4.0 marshmallow-sqlalchemy

# Database
pip install psycopg2-binary  # PostgreSQL driver

# Security
pip install cryptography

# Background tasks
pip install apscheduler

# Existing dependencies (already in use)
pip install requests rsa

# Dev/testing
pip install pytest pytest-flask python-dotenv
```

### Frontend (Node.js)

```bash
cd frontend

# Server state + client state
npm install @tanstack/react-query zustand

# Forms + validation
npm install react-hook-form @hookform/resolvers zod

# Data grid (admin tables)
npm install @mui/x-data-grid

# Already installed via Vuexy:
# next@16.1.1 react@19.2.3 @mui/material@7.3.6 tailwindcss@4.1.17
```

## Key Architecture Decisions

### Auth Flow: Flask Owns Everything

```
1. User submits login form (React Hook Form + Zod validation)
2. Next.js calls POST /api/auth/login on Flask
3. Flask validates credentials, returns JWT access + refresh tokens
4. Tokens stored in HttpOnly secure cookies (set by Flask response)
5. Next.js middleware reads cookie to gate /admin/* routes
6. TanStack Query attaches token via fetch wrapper for API calls
7. Token refresh via POST /api/auth/refresh when 401 received
```

### .mafile Storage: Encrypted at Rest

```
1. Admin uploads .mafile via Flask API
2. Flask validates JSON structure (shared_secret, account_name required)
3. Sensitive fields (shared_secret, identity_secret, password) encrypted with Fernet
4. Encrypted data stored in PostgreSQL (not filesystem)
5. Decrypted in-memory only when generating Steam Guard codes
6. Encryption key from environment variable, never in code
```

### Database Schema Domains

```
Users:       id, username, email, password_hash, role, created_at
Orders:      id, user_id, game_id, account_id, status, price_idr, created_at
SteamAccounts: id, account_name, encrypted_mafile_data, encrypted_password, is_active
Games:       id, appid, name, icon_url, price_idr, is_listed, created_at
GameOwnership: id, game_id, account_id (which accounts own which games)
CodeRequests:  id, user_id, order_id, account_id, code, requested_at (audit log)
```

## Version Pinning Strategy

Pin major.minor in requirements.txt (e.g., `flask>=3.1,<3.2`). Pin exact versions in production lock files. Use `pip freeze > requirements.lock` for reproducibility. Frontend: `package-lock.json` handles exact pinning automatically.

## Sources

### Official Documentation (HIGH confidence)
- Flask 3.1.x: https://flask.palletsprojects.com/en/stable/
- Flask-SQLAlchemy 3.1.x: https://flask-sqlalchemy.palletsprojects.com/
- Flask-JWT-Extended 4.7.1: https://flask-jwt-extended.readthedocs.io/
- Flask-Migrate 4.1.0: https://flask-migrate.readthedocs.io/
- SQLAlchemy 2.0.x: https://docs.sqlalchemy.org/en/20/
- Marshmallow 4.x: https://marshmallow.readthedocs.io/en/stable/
- Cryptography (Fernet): https://cryptography.io/en/latest/fernet/
- Next.js: https://nextjs.org/docs
- MUI: https://mui.com/material-ui/
- TanStack Query: https://tanstack.com/query/latest
- Zustand: https://zustand.docs.pmnd.rs/
- Auth.js migration notice: https://authjs.dev/getting-started/migrate-to-better-auth

### PyPI Version Verification (HIGH confidence)
- Flask 3.1.3: https://pypi.org/project/Flask/
- Flask-SQLAlchemy 3.1.1: https://pypi.org/project/Flask-SQLAlchemy/
- Flask-JWT-Extended 4.7.1: https://pypi.org/project/Flask-JWT-Extended/
- Flask-Migrate 4.1.0: https://pypi.org/project/Flask-Migrate/
- Flask-CORS 6.0.2: https://pypi.org/project/flask-cors/
- SQLAlchemy 2.0.46: https://www.sqlalchemy.org/blog/2026/01/21/sqlalchemy-2.0.46-released/
- Cryptography 46.0.6: https://pypi.org/project/cryptography/
- APScheduler 3.11.2: https://pypi.org/project/APScheduler/

### npm Version Verification (HIGH confidence)
- TanStack Query 5.96.x: https://www.npmjs.com/package/@tanstack/react-query
- Zustand 5.0.12: https://www.npmjs.com/package/zustand
- Better Auth 1.5.6: https://www.npmjs.com/package/better-auth

### Ecosystem Research (MEDIUM confidence)
- Auth.js joins Better Auth (Sep 2025): https://github.com/nextauthjs/next-auth/discussions/13252
- Flask JWT best practices 2026: https://oneuptime.com/blog/post/2026-02-02-flask-jwt-authentication/view
- PostgreSQL vs SQLite 2026: https://www.selecthub.com/relational-database-solutions/postgresql-vs-sqlite/
- Zustand vs Redux 2025: https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k
- React Hook Form + Zod 2026: https://dev.to/marufrahmanlive/react-hook-form-with-zod-complete-guide-for-2026-1em1
