# Architecture Research

**Domain:** Steam game sharing marketplace (Flask API + Next.js frontend)
**Researched:** 2026-04-07
**Confidence:** HIGH

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Next.js 16)                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Public    │  │ User      │  │ Admin        │  │ Auth         │   │
│  │ Storefront│  │ Dashboard │  │ Dashboard    │  │ Pages        │   │
│  └─────┬────┘  └─────┬─────┘  └──────┬───────┘  └──────┬───────┘   │
│        │              │               │                 │           │
│  ┌─────┴──────────────┴───────────────┴─────────────────┴────────┐  │
│  │              Next.js API Routes (BFF Proxy Layer)             │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────────┘
                              │ HTTP/JSON (CORS)
┌─────────────────────────────┼────────────────────────────────────────┐
│                       BACKEND (Flask API)                            │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Auth     │  │ Accounts  │  │ Marketplace  │  │ Orders       │   │
│  │ Blueprint│  │ Blueprint │  │ Blueprint    │  │ Blueprint    │   │
│  └─────┬────┘  └─────┬─────┘  └──────┬───────┘  └──────┬───────┘   │
│        │              │               │                 │           │
│  ┌─────┴──────────────┴───────────────┴─────────────────┴────────┐  │
│  │                    Service Layer                               │  │
│  │  ┌──────────┐ ┌────────────┐ ┌─────────┐ ┌────────────────┐  │  │
│  │  │ Steam    │ │ Assignment │ │ Code    │ │ Game Sync      │  │  │
│  │  │ Auth Svc │ │ Service    │ │ Gen Svc │ │ Service        │  │  │
│  │  └──────────┘ └────────────┘ └─────────┘ └────────────────┘  │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │              SQLAlchemy ORM / Data Access Layer                │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          │                    │                      │
  ┌───────┴──────┐   ┌────────┴───────┐   ┌──────────┴─────┐
  │  PostgreSQL  │   │  .mafile       │   │  Steam Web API │
  │  Database    │   │  Storage       │   │  (External)    │
  └──────────────┘   └────────────────┘   └────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Public Storefront | Browse games, search, view details | Next.js Server Components with SSR |
| User Dashboard | View purchased games, request codes, see instructions | Client + Server Components, JWT-gated |
| Admin Dashboard | Manage accounts, orders, users, view logs | MUI DataGrid in Vuexy template, role-gated |
| Auth Pages | Login, register, forgot password | Vuexy's blank-layout pages |
| BFF Proxy Layer | Forward API calls, attach JWT, handle CORS cookie-to-header | Next.js Route Handlers (`app/api/`) |
| Auth Blueprint | User registration, login, JWT issuance/refresh, role checks | Flask Blueprint + flask-jwt-extended |
| Accounts Blueprint | CRUD Steam accounts, upload .mafile, trigger game sync | Flask Blueprint, admin-only |
| Marketplace Blueprint | List games, search, filter, game detail with availability | Flask Blueprint, public + auth |
| Orders Blueprint | Create order, confirm payment, assign account, view history | Flask Blueprint, auth required |
| Steam Auth Service | Login to Steam, refresh tokens, auto-login with saved passwords | Existing `steam_client.py`, wrapped as service |
| Assignment Service | Round-robin account selection among those owning a game | Database-backed counter per game |
| Code Gen Service | Generate Steam Guard codes from shared_secret, log requests | Existing `steam_guard.py`, wrapped with logging |
| Game Sync Service | Fetch game libraries from Steam API, deduplicate into catalog | Background job using existing fetch logic |
| SQLAlchemy ORM | Data models, queries, migrations | Flask-SQLAlchemy + Flask-Migrate (Alembic) |

## Recommended Project Structure

### Backend

```
backend/
├── app/
│   ├── __init__.py             # Application factory (create_app)
│   ├── config.py               # Configuration classes (Dev, Prod, Test)
│   ├── extensions.py           # db, migrate, jwt, cors instances
│   ├── models/
│   │   ├── __init__.py         # Import all models for Alembic
│   │   ├── user.py             # User, Role
│   │   ├── steam_account.py    # SteamAccount (DB record, not .mafile)
│   │   ├── game.py             # Game (deduplicated catalog)
│   │   ├── game_account.py     # GameAccount (which account owns which game)
│   │   ├── order.py            # Order, OrderStatus
│   │   ├── assignment.py       # AccountAssignment (user-to-account per game)
│   │   └── code_log.py         # CodeRequestLog
│   ├── blueprints/
│   │   ├── __init__.py
│   │   ├── auth.py             # POST /auth/register, /auth/login, /auth/refresh
│   │   ├── accounts.py         # CRUD /admin/accounts, POST /admin/accounts/upload
│   │   ├── marketplace.py      # GET /games, /games/<id>, /games/search
│   │   ├── orders.py           # POST /orders, GET /orders, PATCH /orders/<id>/confirm
│   │   ├── codes.py            # POST /codes/request/<assignment_id>
│   │   └── admin.py            # GET /admin/dashboard, /admin/logs, /admin/users
│   ├── services/
│   │   ├── __init__.py
│   │   ├── steam_auth.py       # Wraps steam_client for login/token refresh
│   │   ├── game_sync.py        # Fetches games from Steam, updates DB catalog
│   │   ├── assignment.py       # Round-robin logic
│   │   └── code_gen.py         # Code generation + logging
│   ├── utils/
│   │   ├── decorators.py       # @admin_required, @auth_required
│   │   └── errors.py           # Standardized error responses
│   └── schemas/
│       ├── __init__.py
│       └── *.py                # Marshmallow or Pydantic schemas for validation
├── steam_guard.py              # Existing - pure functions, no changes needed
├── steam_client.py             # Existing - SteamAccount class, login logic
├── migrations/                 # Alembic migrations (auto-generated)
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_marketplace.py
│   └── test_orders.py
├── requirements.txt
└── wsgi.py                     # Gunicorn entrypoint
```

### Frontend

```
frontend/src/
├── app/
│   ├── (blank-layout-pages)/
│   │   ├── login/page.tsx            # User login
│   │   ├── register/page.tsx         # User registration
│   │   └── layout.tsx
│   ├── (storefront)/
│   │   ├── layout.tsx                # Public storefront layout (no sidebar)
│   │   ├── page.tsx                  # Homepage / featured games
│   │   ├── games/
│   │   │   ├── page.tsx              # Browse all games
│   │   │   └── [id]/page.tsx         # Game detail page
│   │   └── search/page.tsx           # Search results
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Authenticated layout (Vuexy sidebar)
│   │   ├── my-games/page.tsx         # User's purchased games
│   │   ├── my-games/[id]/page.tsx    # Game access: credentials + code gen
│   │   ├── orders/page.tsx           # Order history
│   │   └── profile/page.tsx          # User profile
│   ├── (admin)/
│   │   ├── layout.tsx                # Admin layout (extended sidebar)
│   │   ├── dashboard/page.tsx        # Admin overview stats
│   │   ├── accounts/page.tsx         # Manage Steam accounts
│   │   ├── games/page.tsx            # Manage game catalog
│   │   ├── orders/page.tsx           # Manage orders
│   │   ├── users/page.tsx            # Manage users
│   │   └── logs/page.tsx             # Code request logs
│   ├── api/                          # BFF proxy routes
│   │   ├── auth/[...slug]/route.ts   # Proxy auth endpoints
│   │   ├── games/[...slug]/route.ts  # Proxy game endpoints
│   │   ├── orders/[...slug]/route.ts # Proxy order endpoints
│   │   └── admin/[...slug]/route.ts  # Proxy admin endpoints
│   └── layout.tsx
├── lib/
│   ├── api-client.ts                 # Typed fetch wrapper for Flask API
│   ├── auth.ts                       # JWT storage, refresh logic
│   └── types.ts                      # Shared TypeScript types
├── components/
│   ├── games/                        # Game card, game grid, game detail
│   ├── orders/                       # Order card, order table
│   ├── steam/                        # Code display with countdown timer
│   └── layout/                       # Existing Vuexy layout components
└── hooks/
    ├── useAuth.ts                    # Authentication hook
    ├── useGames.ts                   # Game data fetching
    └── useSteamCode.ts              # Code generation with auto-refresh
```

### Structure Rationale

- **backend/app/ with factory pattern:** The existing `app.py` is a flat file. Restructuring into an application factory (`create_app()`) enables testing with different configs, proper extension initialization order, and blueprint registration. The existing `steam_guard.py` and `steam_client.py` stay at `backend/` root as proven, standalone modules.
- **backend/app/services/:** Business logic separated from route handlers. Routes do input validation and response formatting. Services do the actual work. This prevents fat route handlers and enables reuse (e.g., game_sync used by both an admin endpoint and a scheduled job).
- **frontend/(storefront)/ vs (dashboard)/ vs (admin)/:** Three distinct route groups with different layouts. Storefront is public-facing with no sidebar. Dashboard uses Vuexy's authenticated layout. Admin extends it with admin-specific navigation. Next.js route groups `(...)` enable this without URL nesting.
- **frontend/app/api/ (BFF layer):** Next.js Route Handlers proxy requests to Flask. This solves CORS (same-origin from browser to Next.js server), enables server-side JWT handling (httpOnly cookies), and lets the frontend call its own domain rather than a separate API origin.

## Data Models

### Entity-Relationship Overview

```
User (1) ──── (N) Order
  │                  │
  │                  │ (1)
  │                  ▼
  │            Assignment (N) ──── (1) SteamAccount
  │                  │                      │
  │                  │                      │ (N)
  │                  ▼                      ▼
  │              Game (1) ────── (N) GameAccount
  │
  └──── (N) CodeRequestLog ──── (1) Assignment
```

### Core Models

```python
# User
class User(db.Model):
    id: int (PK)
    email: str (unique)
    username: str (unique)
    password_hash: str
    role: str  # 'user' | 'admin'
    is_active: bool
    created_at: datetime
    # relationships: orders, code_logs

# SteamAccount
class SteamAccount(db.Model):
    id: int (PK)
    account_name: str (unique)     # From .mafile
    steam_id: str (unique)         # From .mafile Session
    mafile_path: str               # Path to .mafile on disk
    password_encrypted: str        # AES-encrypted, NOT base64
    is_active: bool                # Admin can disable
    last_game_sync: datetime
    created_at: datetime
    # relationships: game_accounts, assignments

# Game (deduplicated catalog)
class Game(db.Model):
    id: int (PK)
    appid: int (unique)            # Steam app ID
    name: str
    icon_url: str
    price: int                     # In IDR, default 50000
    is_listed: bool                # Admin toggle
    play_instructions: text        # Per-game override (nullable)
    created_at: datetime
    # relationships: game_accounts, orders
    # computed: available_slots (count of active accounts owning this game
    #           minus assigned users for this game)

# GameAccount (junction: which accounts own which games)
class GameAccount(db.Model):
    id: int (PK)
    game_id: int (FK -> Game)
    steam_account_id: int (FK -> SteamAccount)
    synced_at: datetime
    # unique constraint: (game_id, steam_account_id)

# Order
class Order(db.Model):
    id: int (PK)
    user_id: int (FK -> User)
    game_id: int (FK -> Game)
    status: str  # 'pending' | 'confirmed' | 'cancelled'
    price_paid: int                # Snapshot of price at purchase
    created_at: datetime
    confirmed_at: datetime (nullable)
    # relationship: assignment (created on confirmation)

# Assignment (user gets access to a specific account for a specific game)
class Assignment(db.Model):
    id: int (PK)
    order_id: int (FK -> Order, unique)
    user_id: int (FK -> User)
    game_id: int (FK -> Game)
    steam_account_id: int (FK -> SteamAccount)
    assigned_at: datetime
    is_active: bool
    # unique constraint: (user_id, game_id) -- one assignment per user per game

# CodeRequestLog
class CodeRequestLog(db.Model):
    id: int (PK)
    assignment_id: int (FK -> Assignment)
    user_id: int (FK -> User)
    steam_account_id: int (FK -> SteamAccount)
    code_generated: str            # The 5-char code
    requested_at: datetime
    ip_address: str
```

### Round-Robin Assignment Table

```python
# RoundRobinCounter (tracks next assignment per game)
class RoundRobinCounter(db.Model):
    id: int (PK)
    game_id: int (FK -> Game, unique)
    last_assigned_index: int       # Index into sorted list of accounts for this game
```

**How round-robin works:**
1. User's order is confirmed for Game X.
2. Query all active SteamAccounts that own Game X (via GameAccount), sorted by `steam_account_id`.
3. Get or create `RoundRobinCounter` for Game X.
4. `next_index = (last_assigned_index + 1) % len(accounts)`.
5. Assign `accounts[next_index]` to the user.
6. Update `last_assigned_index = next_index`.
7. Wrap in a database transaction with row-level locking on the counter to prevent race conditions.

## Architectural Patterns

### Pattern 1: Application Factory

**What:** Flask's `create_app()` factory function creates and configures the app instance.
**When to use:** Always for non-trivial Flask apps. Required for testing, migrations, and CLI.
**Trade-offs:** Slightly more boilerplate vs flat `app.py`, but essential for testability.

```python
# backend/app/__init__.py
from flask import Flask
from .extensions import db, migrate, jwt, cors
from .config import config_map

def create_app(config_name='development'):
    app = Flask(__name__)
    app.config.from_object(config_map[config_name])

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, origins=app.config['CORS_ORIGINS'])

    # Register blueprints
    from .blueprints.auth import auth_bp
    from .blueprints.marketplace import marketplace_bp
    from .blueprints.orders import orders_bp
    from .blueprints.accounts import accounts_bp
    from .blueprints.codes import codes_bp
    from .blueprints.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(marketplace_bp, url_prefix='/api/games')
    app.register_blueprint(orders_bp, url_prefix='/api/orders')
    app.register_blueprint(accounts_bp, url_prefix='/api/admin/accounts')
    app.register_blueprint(codes_bp, url_prefix='/api/codes')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    return app
```

### Pattern 2: Service Layer (Thin Routes, Fat Services)

**What:** Route handlers validate input and format output. Business logic lives in service functions.
**When to use:** When business logic is non-trivial or shared across routes.
**Trade-offs:** More files, but prevents spaghetti routes and enables unit testing of logic without HTTP.

```python
# backend/app/blueprints/orders.py (thin)
@orders_bp.route('/', methods=['POST'])
@jwt_required()
def create_order():
    data = request.get_json()
    game_id = data.get('game_id')
    if not game_id:
        return jsonify({'error': 'game_id required'}), 400
    try:
        order = OrderService.create(current_user.id, game_id)
        return jsonify(order.to_dict()), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

# backend/app/services/order_service.py (fat)
class OrderService:
    @staticmethod
    def create(user_id, game_id):
        game = Game.query.get_or_404(game_id)
        if not game.is_listed:
            raise ValueError('Game is not available')
        # Check available slots...
        order = Order(user_id=user_id, game_id=game_id,
                      price_paid=game.price, status='pending')
        db.session.add(order)
        db.session.commit()
        return order
```

### Pattern 3: BFF Proxy (Backend-for-Frontend)

**What:** Next.js API Routes proxy requests to Flask, transforming auth from httpOnly cookies to Bearer tokens.
**When to use:** When frontend and backend are separate origins, or when you want server-side auth handling.
**Trade-offs:** Extra hop adds latency (~5ms), but eliminates CORS issues and keeps JWT out of localStorage.

```typescript
// frontend/src/app/api/games/[...slug]/route.ts
import { cookies } from 'next/headers';

const FLASK_API = process.env.FLASK_API_URL || 'http://localhost:5000';

export async function GET(request: Request, { params }: { params: { slug: string[] } }) {
  const path = params.slug.join('/');
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  const resp = await fetch(`${FLASK_API}/api/games/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await resp.json();
  return Response.json(data, { status: resp.status });
}
```

### Pattern 4: Database-Backed Round-Robin with Row Locking

**What:** Atomic counter in the database ensures fair distribution even under concurrent requests.
**When to use:** Whenever fair assignment across a pool of resources is needed.
**Trade-offs:** Row lock adds slight contention, but with the low volume expected, this is negligible.

```python
# backend/app/services/assignment.py
from sqlalchemy import select, update
from ..extensions import db
from ..models import RoundRobinCounter, GameAccount, SteamAccount, Assignment

class AssignmentService:
    @staticmethod
    def assign_account(user_id: int, game_id: int, order_id: int) -> Assignment:
        """Assign a Steam account to a user for a game using round-robin."""
        # Get available accounts for this game (sorted for deterministic order)
        accounts = (
            db.session.query(SteamAccount)
            .join(GameAccount)
            .filter(GameAccount.game_id == game_id, SteamAccount.is_active == True)
            .order_by(SteamAccount.id)
            .all()
        )
        if not accounts:
            raise ValueError('No accounts available for this game')

        # Lock and update the counter atomically
        counter = (
            db.session.query(RoundRobinCounter)
            .filter_by(game_id=game_id)
            .with_for_update()  # Row-level lock
            .first()
        )
        if not counter:
            counter = RoundRobinCounter(game_id=game_id, last_assigned_index=-1)
            db.session.add(counter)

        next_index = (counter.last_assigned_index + 1) % len(accounts)
        counter.last_assigned_index = next_index
        selected_account = accounts[next_index]

        assignment = Assignment(
            order_id=order_id,
            user_id=user_id,
            game_id=game_id,
            steam_account_id=selected_account.id,
            is_active=True,
        )
        db.session.add(assignment)
        db.session.commit()
        return assignment
```

## Data Flow

### Request Flow (General)

```
Browser
  │
  ├─── GET /games (Server Component, SSR)
  │     └── Next.js Server → fetch Flask /api/games → render HTML → client
  │
  ├─── POST /api/orders (Client Component, user action)
  │     └── Browser → Next.js /api/orders (Route Handler)
  │           └── Read httpOnly cookie → add Bearer header
  │                 └── Flask /api/orders → validate → service → DB → response
  │                       └── Back through proxy → browser
  │
  └─── POST /api/codes/request/123 (Client Component)
        └── Browser → Next.js /api/codes/request/123
              └── Flask → validate JWT → load assignment → load .mafile
                    └── generate_steam_guard_code(shared_secret) → log → response
```

### Key Data Flows

1. **Game Catalog Sync:** Admin triggers sync → Flask iterates all SteamAccounts → for each, calls Steam API `GetOwnedGames` → upserts Games and GameAccounts → updates `last_game_sync` timestamp. This runs per-account to handle token refresh failures gracefully.

2. **Purchase Flow:** User browses games (public) → clicks "Buy" → creates Order (status: pending) → admin confirms payment manually → system triggers AssignmentService → round-robin selects account → Assignment created → user can now see credentials and request codes.

3. **Code Generation Flow:** User clicks "Get Code" → request hits Flask with assignment_id → Flask loads Assignment → loads SteamAccount → reads .mafile from disk → calls `generate_steam_guard_code(shared_secret)` → logs to CodeRequestLog → returns code + `time_remaining`.

4. **Auth Flow:** User registers → password hashed (bcrypt) → stored in DB → login returns JWT (access + refresh) → Next.js stores both in httpOnly cookies → BFF proxy attaches Bearer token to Flask requests → Flask validates JWT on protected endpoints.

## API Boundary Design

### Public Endpoints (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/games` | List games (paginated, filterable) |
| GET | `/api/games/:id` | Game detail with availability count |
| GET | `/api/games/search?q=` | Search games by name |
| POST | `/api/auth/register` | Create user account |
| POST | `/api/auth/login` | Login, receive JWT |
| POST | `/api/auth/refresh` | Refresh access token |

### User Endpoints (JWT required, role: user)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/orders` | User's order history |
| POST | `/api/orders` | Create new order (pending) |
| GET | `/api/orders/:id` | Order detail |
| GET | `/api/assignments` | User's active game assignments |
| GET | `/api/assignments/:id` | Assignment detail (credentials) |
| POST | `/api/codes/request/:assignment_id` | Generate Steam Guard code |
| GET | `/api/profile` | Get user profile |
| PATCH | `/api/profile` | Update user profile |

### Admin Endpoints (JWT required, role: admin)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/dashboard` | Stats (users, orders, accounts) |
| GET | `/api/admin/accounts` | List Steam accounts |
| POST | `/api/admin/accounts` | Upload new .mafile + password |
| DELETE | `/api/admin/accounts/:id` | Remove Steam account |
| POST | `/api/admin/accounts/:id/sync` | Sync games for one account |
| POST | `/api/admin/accounts/sync-all` | Sync games for all accounts |
| GET | `/api/admin/orders` | All orders (filterable by status) |
| PATCH | `/api/admin/orders/:id/confirm` | Confirm payment, trigger assignment |
| PATCH | `/api/admin/orders/:id/cancel` | Cancel order |
| GET | `/api/admin/users` | List users |
| PATCH | `/api/admin/users/:id` | Update user (activate/deactivate) |
| GET | `/api/admin/games` | All games (including unlisted) |
| PATCH | `/api/admin/games/:id` | Update price, listing status, instructions |
| GET | `/api/admin/logs` | Code request logs (filterable) |

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Secrets in the Database Without Encryption

**What people do:** Store Steam passwords with base64 encoding (as the current codebase does with `obfuscate()`).
**Why it's wrong:** Base64 is encoding, not encryption. Anyone with database access can decode every password instantly.
**Do this instead:** Use AES-256 encryption with a server-side key stored in environment variables. Use `cryptography.fernet` for symmetric encryption. The key never enters the database.

### Anti-Pattern 2: Flat Route Files With Business Logic

**What people do:** Put database queries, Steam API calls, and response formatting all in route handlers.
**Why it's wrong:** Untestable, unreusable, hard to debug. The current `app.py` has this problem with `_ensure_fresh_token()` doing HTTP calls inside a route helper.
**Do this instead:** Routes call services. Services call data access. Each layer is testable independently.

### Anti-Pattern 3: File-Based Data Storage for Production Data

**What people do:** Store account credentials and game caches in JSON files (as `accounts.json` and `games_cache.json` do now).
**Why it's wrong:** No transactions, no concurrent access safety, no querying capability, no backup/restore, no migrations.
**Do this instead:** PostgreSQL for all structured data. JSON files only for .mafile storage (which is their natural format and needed by the Steam client code).

### Anti-Pattern 4: Exposing Flask Directly to Browser

**What people do:** Set CORS to `*` and call Flask API directly from the browser.
**Why it's wrong:** JWT stored in localStorage is vulnerable to XSS. CORS `*` is insecure. Different port/domain causes cookie issues.
**Do this instead:** Use the Next.js BFF proxy pattern. Browser only talks to Next.js. Next.js talks to Flask server-to-server. JWT lives in httpOnly cookies set by Next.js.

### Anti-Pattern 5: Synchronous Steam API Calls in Request Handlers

**What people do:** Call Steam API during a user's HTTP request, making them wait 2-5 seconds.
**Why it's wrong:** Slow UX, timeout risk if Steam is slow, blocks the Flask worker.
**Do this instead:** Game sync is a background operation triggered by admin. Code generation is fast (pure computation, no network call). Token refresh can be tolerated inline since it's rare and fast (~200ms).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users | Single Flask process + SQLite would technically work, but use PostgreSQL from day one to avoid migration pain. Single Next.js server. Everything on one machine. |
| 100-1K users | Add Gunicorn with 4 workers behind Flask. Redis for caching game catalog (avoid hitting DB on every browse). Background job runner (APScheduler or Celery with Redis) for game sync. |
| 1K-10K users | Move to managed PostgreSQL. Add connection pooling. Consider read replicas if marketplace browsing is heavy. CDN for static assets and game images. |

### Scaling Priorities

1. **First bottleneck: Steam API rate limiting.** Game sync hits Steam API per-account. With 50+ accounts, syncing all games takes minutes. Solution: stagger syncs, cache aggressively, sync in background.
2. **Second bottleneck: Database connections under Gunicorn.** Multiple workers each want connections. Solution: use connection pooling (`pgbouncer` or SQLAlchemy pool settings).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Steam Web API | HTTP REST via `requests` library | Rate-limited, requires access tokens that expire. Auto-refresh with saved passwords. Existing code handles this well. |
| Steam Guard TOTP | Pure computation from shared_secret | No network call. 30-second rotation. The existing `steam_guard.py` is correct and battle-tested. |
| Steam Auth (Login) | Multi-step RSA + TOTP flow via HTTP | Existing `steam_client.py` handles the full flow. Wrap, don't rewrite. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Next.js <-> Flask | HTTP/JSON via BFF proxy | Next.js Route Handlers proxy to Flask. Same-origin from browser's perspective. |
| Flask <-> PostgreSQL | SQLAlchemy ORM | Flask-SQLAlchemy manages connection lifecycle. Use connection pooling in production. |
| Flask <-> .mafile storage | Direct filesystem read | .mafiles stay on disk (SteamAccount class reads them). DB stores path reference. Keep .mafile directory outside web root. |
| Flask <-> Steam API | HTTP via `requests` | Wrapped in services. Errors don't crash the request handler -- caught and returned as appropriate HTTP errors. |

## Build Order (Dependencies)

The architecture implies this build sequence:

1. **Database + Models + Migrations** -- everything else depends on this
2. **Auth system (Flask + Next.js)** -- most features require authentication
3. **Steam Account management (admin)** -- wraps existing code into DB-backed CRUD
4. **Game Sync service** -- populates the game catalog from Steam accounts
5. **Marketplace (public browsing)** -- depends on game catalog existing
6. **Order system** -- depends on marketplace + auth
7. **Assignment service** -- depends on orders + accounts
8. **Code generation + logging** -- depends on assignments
9. **Admin dashboard** -- depends on all above existing (reads from all tables)

## Sources

- [How To Structure a Large Flask Application - Best Practices for 2025](https://dev.to/gajanan0707/how-to-structure-a-large-flask-application-best-practices-for-2025-9j2) (Flask project structure)
- [How To Structure a Large Flask Application with Flask Blueprints and Flask-SQLAlchemy](https://www.digitalocean.com/community/tutorials/how-to-structure-a-large-flask-application-with-flask-blueprints-and-flask-sqlalchemy) (Blueprint + SQLAlchemy patterns)
- [Best Practices for Flask API Development](https://auth0.com/blog/best-practices-for-flask-api-development/) (REST API patterns)
- [Flask-Migrate Documentation](https://flask-migrate.readthedocs.io/) (Database migrations)
- [Next.js Backend for Frontend Guide](https://nextjs.org/docs/app/guides/backend-for-frontend) (BFF proxy pattern)
- [Next.js App Router Patterns 2026](https://dev.to/teguh_coding/nextjs-app-router-the-patterns-that-actually-matter-in-2026-146) (Server Components, route groups)
- [IPlayerService Interface](https://partner.steamgames.com/doc/webapi/iplayerservice) (Steam API reference)
- [Steam OAuth Documentation](https://partner.steamgames.com/doc/webapi_overview/oauth) (Access token authentication)
- [Next.js JWT Authentication Guide 2026](https://dev.to/sizan_mahmud0_e7c3fd0cb68/nextjs-jwt-authentication-complete-guide-to-secure-your-app-in-2026-15jc) (JWT + httpOnly cookies)
- [Solving CORS Issues Between Next.js and Python Backend](https://medium.com/@nmlmadhusanka/solving-cors-issues-between-next-js-and-python-backend-93800a4ee633) (CORS configuration)

---
*Architecture research for: SDA Steam Game Sharing Platform*
*Researched: 2026-04-07*
