# Admin: Logout All Devices

**Status:** Design
**Date:** 2026-04-19

## Motivation

Playfast shares Steam accounts across multiple users. When credentials change hands (e.g., after a sale, during subscription rotation, or for marketing campaigns), the prior sessions on Steam clients remain logged in indefinitely. Steam's `Deauthorize all other devices` button in the web UI does exactly what we want — kick every active session for the account — but performing it manually per account does not scale.

This design adds programmatic equivalents as admin actions so Playfast can:
- Force-kick a specific account's sessions on demand (single-account button)
- Kick sessions across the entire active account pool in one click (bulk action)

A later iteration will wire the bulk action to a nightly cron for automated "daily-free-access" rotation, but that is out of scope here.

## Scope

In scope:
- Backend service functions to enumerate and revoke Steam refresh tokens for a given account
- Admin REST endpoint for single-account logout
- Admin REST endpoint for bulk logout across all active accounts (background job)
- Admin UI buttons in the two existing pages (accounts list, account detail)

Out of scope:
- Automated/scheduled logout (cron)
- Selective per-user session revocation (subscriber vs free-tier distinction)
- Any user-facing UI

## Steam API

Steam's `IAuthenticationService` provides two endpoints that together implement "sign out all devices":

1. **`IAuthenticationService/EnumerateTokens`** — returns a list of every active refresh token on the account, each tagged with `token_id`, `device_friendly_name`, `time_last_seen`, and platform info.
2. **`IAuthenticationService/RevokeRefreshToken`** — revokes a specific `token_id`. Once revoked, the Steam client using that token is kicked to the login screen on its next authenticated request.

Both endpoints accept the account's current `access_token` as auth.

**Important:** Playfast's own refresh token (stored in `mafile_data.Session.RefreshToken`) is among the tokens enumerated. Revoking it will break subsequent Steam API calls from Playfast itself. Mitigation: immediately after revocation, call `steam_account_login()` (existing helper in `service.py:234`) to establish a fresh session and persist the new tokens to `mafile_data`. This mirrors the existing pattern in `_force_new_token` (`service.py:83`).

## Backend

### New service functions (`backend/app/steam/service.py`)

```python
def enumerate_tokens(access_token: str, steam_id: str) -> list[dict]:
    """Return list of active refresh tokens for the account.

    Each dict contains: token_id, device_friendly_name, time_last_seen,
    os_platform, logged_in_ip.
    """

def revoke_refresh_token(access_token: str, token_id: str, steam_id: str) -> bool:
    """Revoke a single refresh token by ID. Returns True on success."""

def logout_all_devices(mafile_data: dict, password: str) -> dict:
    """Orchestrate full logout-all flow for one account.

    Flow:
      1. ensure_valid_token(mafile_data, password)
      2. enumerate_tokens -> token list
      3. For each token: revoke_refresh_token (collect successes/failures)
      4. steam_account_login(mafile_data, password) -> fresh tokens
      5. Persist new tokens into mafile_data.Session
      6. Return {
           "revoked_count": int,
           "failed_count": int,
           "devices": [device_friendly_name, ...],
           "relogin_success": bool,
         }
    """
```

Error handling within `logout_all_devices`:
- `EnumerateTokens` 401/403 → one retry via `_force_new_token`, then abort if still failing
- Individual `RevokeRefreshToken` failure → log, skip, continue loop (don't fail the whole operation)
- Re-login failure → return with `relogin_success: false`; caller decides how to surface

### Admin endpoints (`backend/app/admin/routes.py`)

**Single-account (synchronous):**

```
POST /api/admin/accounts/<int:account_id>/logout-all
```

Response 200:
```json
{
  "message": "Logged out 5 devices",
  "revoked_count": 5,
  "failed_count": 0,
  "devices": ["iPhone 15", "Desktop-PC", "..."],
  "relogin_success": true
}
```

Response 404 if account not found. 502 if the flow aborted before any revocation (e.g., couldn't get a valid token).

After the operation, persist updated `mafile_data` back to the DB row (same pattern as `admin_login_account` at `routes.py:419`).

**Bulk (background job):**

```
POST /api/admin/accounts/logout-all-bulk
```

Filters `is_active=True`. Uses the existing `start_job` infrastructure (see `sync_all_games` at `routes.py:712` as the template).

Response 202:
```json
{
  "message": "Bulk logout started in background",
  "job": { ...job state... }
}
```

Response 409 if another job is currently running (same conflict semantics as existing bulk endpoints).

Background function `_bg_logout_all_bulk(job, app, account_ids)`:
- Loop accounts, call `logout_all_devices()` per account
- Update `job.processed = i + 1` after each
- On per-account exception: log error, store in a failures list, continue
- Final: `job.message = f"Logged out {ok}/{len(account_ids)} accounts, kicked {total_devices} total devices"`

Progress is polled via the existing `GET /api/admin/jobs/current` endpoint — no new polling endpoint needed.

## Frontend

### Account detail page (single-account action)

File: `frontend/src/views/admin/AdminAccountDetailPage.tsx` gets one new destructive-style button: **"Logout All Devices"**.

On click:
1. Confirmation modal: "Ini akan kick semua device yang saat ini login ke akun ini. Pengguna Steam yang sedang main akan ke-logout pada request berikutnya. Lanjutkan?"
2. On confirm → `POST /api/admin/accounts/<id>/logout-all`
3. Show result toast: "Logged out N devices" or error message
4. If `relogin_success: false`, show warning: "Re-login otomatis gagal — silakan klik Login manual"

### Accounts list page (bulk action)

File: `frontend/src/views/admin/AdminAccountsPage.tsx` header gets a new destructive-style button: **"Logout All Devices (All Accounts)"**.

On click:
1. Confirmation modal with explicit count: "Ini akan kick semua session di N akun aktif. Proses berjalan di background. Lanjutkan?"
2. On confirm → `POST /api/admin/accounts/logout-all-bulk`
3. On 202 → show progress bar (reuse existing job-polling component)
4. On 409 → toast: "Another job is running — please wait"
5. On completion → show summary toast from `job.message`

## Testing

Manual QA flow (primary):

1. Pick one test account with `.mafile` loaded in Playfast.
2. Log that account in manually on 2+ Steam clients (desktop + mobile).
3. Verify in Steam's web UI (`store.steampowered.com/account/authorizeddevices`) that multiple sessions are listed.
4. Click "Logout All Devices" in Playfast admin.
5. Verify:
   - Response summary matches expected count
   - Steam clients get kicked to login screen within ~1 minute
   - Web UI shows sessions reduced to 1 (Playfast's fresh re-login)
   - Playfast can still generate Steam Guard code and sync games (i.e., re-login succeeded)
6. Repeat for the bulk action across 2-3 test accounts.

Automated tests out of scope — Steam API mocking is high-friction and this is primarily a wrapper around external calls.

## Risk & mitigation

- **Steam rate-limits `RevokeRefreshToken`** in bulk loops. Mitigation: insert small delay (~500ms) between revocations within a single account. If bulk-across-accounts hits rate limits, insert delay between accounts (1s).
- **Steam endpoint shape changes.** These endpoints are documented in Steam community tooling but not officially by Valve. Mitigation: log full request/response on error so debugging is fast if Valve changes the API.
- **Re-login failure after revoke** leaves Playfast without a working session for that account. Mitigation: clear error surfacing to admin, plus the existing "Login" button already handles manual recovery.

## Open questions

None at time of writing. If any surface during implementation, they will be raised back to the user before proceeding.
