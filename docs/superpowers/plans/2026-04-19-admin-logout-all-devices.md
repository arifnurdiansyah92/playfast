# Admin Logout-All-Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins kick every active Steam session on a Playfast-managed account — per-account and in bulk — so credential rotation actually takes effect.

**Architecture:** Add three helpers in `backend/app/steam/service.py` that wrap Steam's `IAuthenticationService.EnumerateTokens` and `IAuthenticationService.RevokeRefreshToken` endpoints. Expose as two admin endpoints (sync single-account; background-job bulk). Add two buttons in admin UI wired to those endpoints. After revocation, Playfast performs a fresh `steam_login()` so its own session survives.

**Tech Stack:** Python/Flask backend, SQLAlchemy, existing `jobs.py` background runner, Next.js + MUI + @tanstack/react-query frontend.

**Testing note:** Per spec, automated tests are out of scope (Steam API mocking is high-friction and backend has no test infrastructure). Verification is manual curl + Steam web UI check after each task that touches Steam. Each task lists the explicit manual checks.

---

### Task 1: Add `enumerate_tokens` helper

**Files:**
- Modify: `backend/app/steam/service.py` (append after `steam_account_login`, ~line 239)

- [ ] **Step 1: Read the top of `service.py` to confirm the `AUTH_URL` constant and imports are in place**

Run: verify file starts with `AUTH_URL = f"{STEAM_API}/IAuthenticationService"` (currently line 21).

- [ ] **Step 2: Append `enumerate_tokens` function**

```python
def enumerate_tokens(access_token: str) -> list[dict]:
    """List active refresh tokens for the account tied to this access_token.

    Calls IAuthenticationService/EnumerateTokens. Returns a list of dicts each
    containing: token_id, token_description, time_updated, platform_type,
    os_platform, logged_in. Raises on HTTP error.
    """
    resp = requests.post(
        f"{AUTH_URL}/EnumerateTokens/v1",
        params={"access_token": access_token},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("response", {})
    return data.get("refresh_tokens", [])
```

- [ ] **Step 3: Manual verify with a real account**

Launch a Flask shell and run:
```bash
cd backend
python -m flask shell
```
Then:
```python
from app.models import SteamAccount
from app.steam.service import ensure_valid_token, enumerate_tokens
acc = SteamAccount.query.first()
mafile = acc.mafile_data.copy()
tok = ensure_valid_token(mafile, acc.password)
tokens = enumerate_tokens(tok)
print(len(tokens), tokens[0] if tokens else None)
```
Expected: prints a non-zero count and a dict with `token_id` and `token_description` keys. If the response shape differs (e.g., keys nested under a different field), update the parsing to match and re-run.

- [ ] **Step 4: Commit**

```bash
git add backend/app/steam/service.py
git commit -m "feat: add enumerate_tokens helper for Steam sessions"
```

---

### Task 2: Add `revoke_refresh_token` helper

**Files:**
- Modify: `backend/app/steam/service.py` (append after `enumerate_tokens`)

- [ ] **Step 1: Append function**

```python
def revoke_refresh_token(access_token: str, token_id: str, steam_id: str) -> bool:
    """Revoke a single refresh token by ID.

    Calls IAuthenticationService/RevokeRefreshToken with revoke_action=1
    (permanent revoke — kicks the device at its next authenticated request).
    Returns True on HTTP 200, False otherwise. Does not raise.
    """
    try:
        resp = requests.post(
            f"{AUTH_URL}/RevokeRefreshToken/v1",
            params={"access_token": access_token},
            data={
                "token_id": str(token_id),
                "steamid": str(steam_id),
                "revoke_action": "1",
            },
            timeout=15,
        )
        return resp.status_code == 200
    except Exception:
        return False
```

- [ ] **Step 2: Manual verify with a real account**

In Flask shell:
```python
from app.models import SteamAccount
from app.steam.service import ensure_valid_token, enumerate_tokens, revoke_refresh_token
acc = SteamAccount.query.first()
mafile = acc.mafile_data.copy()
tok = ensure_valid_token(mafile, acc.password)
steam_id = mafile["Session"]["SteamID"]
tokens = enumerate_tokens(tok)
print("before:", len(tokens))
# Pick a token that is NOT the one we just used. If unsure, skip this step
# and only invoke via Task 3 which handles selection + re-login automatically.
```
Expected: no exception. (Actual revoke tested in Task 3 with full flow.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/steam/service.py
git commit -m "feat: add revoke_refresh_token helper"
```

---

### Task 3: Add `logout_all_devices` orchestrator

**Files:**
- Modify: `backend/app/steam/service.py` (append after `revoke_refresh_token`)

- [ ] **Step 1: Append orchestrator**

```python
def logout_all_devices(mafile_data: dict, password: str) -> dict:
    """Kick every active session on this account, then re-login Playfast's own.

    Returns:
        {
            "revoked_count": int,
            "failed_count": int,
            "devices": [str, ...],          # device_friendly_name / description
            "relogin_success": bool,
            "error": str | None,             # top-level failure before any revoke
        }

    Mutates mafile_data in place with fresh tokens after re-login.
    """
    import time as _time

    token = ensure_valid_token(mafile_data, password)
    if not token:
        return {
            "revoked_count": 0,
            "failed_count": 0,
            "devices": [],
            "relogin_success": False,
            "error": "Could not obtain a valid access token before revocation.",
        }

    steam_id = mafile_data.get("Session", {}).get("SteamID", "")

    try:
        tokens = enumerate_tokens(token)
    except Exception as e:
        # One retry with a forced refresh — token may be silently dead
        new_token = _force_new_token(mafile_data, password)
        if not new_token:
            return {
                "revoked_count": 0,
                "failed_count": 0,
                "devices": [],
                "relogin_success": False,
                "error": f"EnumerateTokens failed and token refresh failed: {e}",
            }
        token = new_token
        try:
            tokens = enumerate_tokens(token)
        except Exception as retry_err:
            return {
                "revoked_count": 0,
                "failed_count": 0,
                "devices": [],
                "relogin_success": False,
                "error": f"EnumerateTokens failed after retry: {retry_err}",
            }

    revoked = 0
    failed = 0
    devices: list[str] = []
    for t in tokens:
        token_id = str(t.get("token_id", ""))
        if not token_id:
            continue
        name = t.get("token_description") or t.get("device_friendly_name") or f"token:{token_id}"
        ok = revoke_refresh_token(token, token_id, steam_id)
        if ok:
            revoked += 1
            devices.append(name)
        else:
            failed += 1
        _time.sleep(0.5)  # gentle rate-limit between revocations

    # Re-login so Playfast's own session survives. This persists new tokens
    # back into mafile_data (see steam_account_login).
    relogin_ok = False
    try:
        new_session = steam_account_login(mafile_data, password)
        session = mafile_data.get("Session", {})
        session["SteamID"] = new_session["SteamID"]
        session["AccessToken"] = new_session["AccessToken"]
        session["RefreshToken"] = new_session["RefreshToken"]
        session["SteamLoginSecure"] = (
            f"{new_session['SteamID']}%7C%7C{new_session['AccessToken']}"
        )
        mafile_data["Session"] = session
        relogin_ok = True
    except Exception:
        relogin_ok = False

    return {
        "revoked_count": revoked,
        "failed_count": failed,
        "devices": devices,
        "relogin_success": relogin_ok,
        "error": None,
    }
```

- [ ] **Step 2: Manual verify end-to-end**

Prepare: log the same test Steam account into 2 different Steam clients (e.g., desktop + phone Steam Mobile). Confirm 2+ sessions appear at `https://store.steampowered.com/account/authorizeddevices`.

In Flask shell:
```python
from app.extensions import db
from app.models import SteamAccount
from app.steam.service import logout_all_devices
acc = SteamAccount.query.first()  # the test account
mafile = acc.mafile_data.copy()
result = logout_all_devices(mafile, acc.password)
print(result)
acc.mafile_data = mafile
db.session.commit()
```
Expected:
- `revoked_count` ≥ 1 (both your test sessions plus Playfast's old token)
- `relogin_success: True`
- Within ~1 minute, the Steam client apps on your test devices get kicked back to login screen
- Steam web UI `authorizeddevices` shows only 1 recent session (the fresh Playfast re-login)

- [ ] **Step 3: Commit**

```bash
git add backend/app/steam/service.py
git commit -m "feat: add logout_all_devices orchestrator"
```

---

### Task 4: Single-account admin endpoint

**Files:**
- Modify: `backend/app/admin/routes.py` (import + new route, near other account actions around line 419)

- [ ] **Step 1: Add import for `logout_all_devices`**

Find the existing import block at `backend/app/admin/routes.py:32-40`:
```python
from app.steam.service import (
    ensure_valid_token,
    fetch_owned_games,
    get_guard_code,
    fetch_confirmations,
    act_on_confirmation,
    steam_account_login,
    _force_new_token,
)
```
Add `logout_all_devices`:
```python
from app.steam.service import (
    ensure_valid_token,
    fetch_owned_games,
    get_guard_code,
    fetch_confirmations,
    act_on_confirmation,
    steam_account_login,
    _force_new_token,
    logout_all_devices,
)
```

- [ ] **Step 2: Add the endpoint after `admin_login_account` (around line 442)**

```python
@admin_bp.route("/accounts/<int:account_id>/logout-all", methods=["POST"])
@admin_required
def admin_logout_all_devices(account_id: int):
    """Revoke every active Steam session on this account, then re-login Playfast."""
    account = db.session.get(SteamAccount, account_id)
    if not account:
        return jsonify({"error": "Account not found"}), 404

    mafile = account.mafile_data.copy()
    result = logout_all_devices(mafile, account.password)

    # Persist updated tokens regardless of partial success
    if mafile != account.mafile_data:
        account.mafile_data = mafile
        account.steam_id = mafile.get("Session", {}).get("SteamID", account.steam_id)
        db.session.commit()

    if result.get("error"):
        return jsonify({
            "error": result["error"],
            "revoked_count": 0,
            "relogin_success": False,
        }), 502

    return jsonify({
        "message": f"Logged out {result['revoked_count']} device(s)",
        "revoked_count": result["revoked_count"],
        "failed_count": result["failed_count"],
        "devices": result["devices"],
        "relogin_success": result["relogin_success"],
    }), 200
```

- [ ] **Step 3: Manual verify via curl**

With backend running and a valid admin JWT in hand (grab from browser devtools after logging in as admin):
```bash
curl -X POST http://localhost:5000/api/admin/accounts/1/logout-all \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json"
```
Expected: 200 response with `revoked_count`, `devices` array, and `relogin_success: true`. If `account_id=1` doesn't exist, substitute a real ID.

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat: admin endpoint for single-account logout-all"
```

---

### Task 5: Bulk logout background job endpoint

**Files:**
- Modify: `backend/app/admin/routes.py` (new route + background function)

- [ ] **Step 1: Add the endpoint and background function near the bulk-sync section (around line 745)**

```python
@admin_bp.route("/accounts/logout-all-bulk", methods=["POST"])
@admin_required
def logout_all_bulk():
    """Kick every session on every active account, in the background."""
    accounts = SteamAccount.query.filter_by(is_active=True).all()
    if not accounts:
        return jsonify({"error": "No active accounts to logout"}), 404

    account_ids = [a.id for a in accounts]
    from flask import current_app
    app = current_app._get_current_object()

    job = start_job(
        "logout_all_bulk",
        _bg_logout_all_bulk,
        args=(app, account_ids),
        total=len(account_ids),
    )
    if not job:
        return jsonify({"error": "A job is already running", "job": get_current_job()}), 409

    return jsonify({"message": "Bulk logout started in background", "job": job}), 202


def _bg_logout_all_bulk(job, app, account_ids):
    """Background: logout all devices across all active accounts."""
    import time as _time
    with app.app_context():
        ok_accounts = 0
        total_devices = 0
        failures: list[str] = []

        for i, account_id in enumerate(account_ids):
            account = db.session.get(SteamAccount, account_id)
            if not account:
                job.processed = i + 1
                continue

            try:
                mafile = account.mafile_data.copy()
                result = logout_all_devices(mafile, account.password)

                if mafile != account.mafile_data:
                    account.mafile_data = mafile
                    account.steam_id = mafile.get("Session", {}).get("SteamID", account.steam_id)
                    db.session.add(account)
                    db.session.commit()

                if result.get("error"):
                    failures.append(f"{account.account_name}: {result['error']}")
                else:
                    ok_accounts += 1
                    total_devices += result.get("revoked_count", 0)
            except Exception as e:
                logger.exception("Bulk logout failed for account %s", account_id)
                failures.append(f"{account.account_name}: {e}")

            job.processed = i + 1
            _time.sleep(1.0)  # pace between accounts to avoid Steam rate limits

        msg = f"Logged out {ok_accounts}/{len(account_ids)} accounts, kicked {total_devices} devices"
        if failures:
            msg += f" ({len(failures)} failed)"
        job.message = msg
```

- [ ] **Step 2: Manual verify via curl**

With 2-3 active accounts in the DB:
```bash
curl -X POST http://localhost:5000/api/admin/accounts/logout-all-bulk \
  -H "Authorization: Bearer $ADMIN_JWT"
```
Expected: 202 with `job` object. Then poll:
```bash
curl http://localhost:5000/api/admin/jobs/current \
  -H "Authorization: Bearer $ADMIN_JWT"
```
Expected: job transitions `running → completed`, `processed` grows to match `total`, final `message` reports counts. Verify against `store.steampowered.com/account/authorizeddevices` for each account that sessions were kicked.

- [ ] **Step 3: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat: bulk logout-all-devices background job endpoint"
```

---

### Task 6: Frontend API client methods

**Files:**
- Modify: `frontend/src/lib/api.ts` (add two methods in `adminApi` around line 432)

- [ ] **Step 1: Locate `loginAccount` in `adminApi` (line 432) and add two new methods directly below it**

Before:
```ts
  loginAccount(id: number) {
    return request<{ message: string }>(`/api/admin/accounts/${id}/login`, { method: 'POST' })
  },
  getConfirmations(id: number) {
```
After:
```ts
  loginAccount(id: number) {
    return request<{ message: string }>(`/api/admin/accounts/${id}/login`, { method: 'POST' })
  },
  logoutAllDevices(id: number) {
    return request<{
      message: string
      revoked_count: number
      failed_count: number
      devices: string[]
      relogin_success: boolean
    }>(`/api/admin/accounts/${id}/logout-all`, { method: 'POST' })
  },
  logoutAllBulk() {
    return request<{ message: string; job?: JobStatus }>(
      '/api/admin/accounts/logout-all-bulk',
      { method: 'POST' }
    )
  },
  getConfirmations(id: number) {
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd frontend
pnpm tsc --noEmit
```
Expected: no new errors introduced.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: adminApi methods for logout-all-devices"
```

---

### Task 7: Single-account "Logout All Devices" button

**Files:**
- Modify: `frontend/src/views/admin/AdminAccountDetailPage.tsx`

- [ ] **Step 1: Add confirm-dialog state, near other `useState` declarations at the top of the component (after line 44)**

After:
```ts
  const [codeLoading, setCodeLoading] = useState(false)
```
Add:
```ts
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutResult, setLogoutResult] = useState<null | { devices: string[]; relogin: boolean }>(null)
```

- [ ] **Step 2: Add MUI Dialog imports to the existing MUI import block**

Find the imports at the top and ensure `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions` are imported (they currently aren't — add them):

```ts
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
```

- [ ] **Step 3: Add the mutation near `syncMutation` (line 76)**

After:
```ts
  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncAccount(Number(accountId)),
    onSuccess: (data) => {
      setSnackMsg(data.success ? `Synced ${data.total_games} games` : `Sync failed: ${data.error}`)
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
    },
    onError: (err: any) => setSnackMsg(`Sync failed: ${err.message}`)
  })
```
Add:
```ts
  const logoutAllMutation = useMutation({
    mutationFn: () => adminApi.logoutAllDevices(Number(accountId)),
    onSuccess: (data) => {
      setLogoutConfirmOpen(false)
      setLogoutResult({ devices: data.devices, relogin: data.relogin_success })
      setSnackMsg(data.message)
    },
    onError: (err: any) => {
      setLogoutConfirmOpen(false)
      setSnackMsg(`Logout failed: ${err.message}`)
    }
  })
```

- [ ] **Step 4: Add the button inside the "Account Actions" card**

Find the block at line 197-224 (the `CardContent` with the three existing action buttons). Add a fourth button directly below the "Refresh Confirmations" button:

```tsx
              <Button
                variant='outlined'
                color='error'
                fullWidth
                startIcon={<i className='tabler-logout' />}
                onClick={() => setLogoutConfirmOpen(true)}
                disabled={logoutAllMutation.isPending}
              >
                {logoutAllMutation.isPending ? 'Logging out...' : 'Logout All Devices'}
              </Button>
```

- [ ] **Step 5: Add the two dialogs just before the final `<Snackbar />` (around line 376)**

Before:
```tsx
      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
```
Insert:
```tsx
      <Dialog open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Logout All Devices?</DialogTitle>
        <DialogContent>
          <Typography>
            Ini akan kick semua device yang saat ini login ke <strong>{account.account_name}</strong>.
            Pengguna Steam yang sedang main akan ke-logout pada request berikutnya.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => logoutAllMutation.mutate()}
            disabled={logoutAllMutation.isPending}
          >
            {logoutAllMutation.isPending ? 'Logging out...' : 'Logout All'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!logoutResult} onClose={() => setLogoutResult(null)} maxWidth='sm' fullWidth>
        <DialogTitle>Logout Complete</DialogTitle>
        <DialogContent>
          {!logoutResult?.relogin && (
            <Alert severity='warning' sx={{ mb: 2 }}>
              Re-login otomatis gagal. Klik &quot;Force Login&quot; di atas untuk recovery manual.
            </Alert>
          )}
          <Typography variant='body2' sx={{ mb: 1 }}>
            Kicked {logoutResult?.devices.length ?? 0} device(s):
          </Typography>
          <Box component='ul' sx={{ pl: 3, m: 0 }}>
            {logoutResult?.devices.map((d, i) => (
              <li key={i}><Typography variant='body2'>{d}</Typography></li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 6: Manual verify in browser**

Run `pnpm dev` in `frontend/`. Navigate to `/admin/accounts/<test-account-id>`. Log the test account into 2 Steam clients first. Then:
1. Click "Logout All Devices"
2. Confirm in the dialog
3. Expect: spinner briefly, then result dialog showing device names
4. Check both Steam clients — they should get kicked within ~1 minute
5. Back in Playfast, click "Generate Code" — should still work (re-login succeeded)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/admin/AdminAccountDetailPage.tsx
git commit -m "feat: logout-all-devices button in account detail page"
```

---

### Task 8: Bulk "Logout All Devices" button in accounts list

**Files:**
- Modify: `frontend/src/views/admin/AdminAccountsPage.tsx`

- [ ] **Step 1: Add confirm-state**

After the existing `useState` declarations (after line 53, the `editPwValue` state):
```ts
  const [logoutAllConfirmOpen, setLogoutAllConfirmOpen] = useState(false)
```

- [ ] **Step 2: Add the bulk mutation near `syncMutation` (line 136)**

After `syncMutation` and `refreshMutation`, add:
```ts
  const logoutAllBulkMutation = useMutation({
    mutationFn: () => adminApi.logoutAllBulk(),
    onSuccess: (res) => {
      setLogoutAllConfirmOpen(false)
      if (res.job) { setActiveJob(res.job); startPolling() }
      setSnackMsg(res.message)
    },
    onError: (err: any) => {
      setLogoutAllConfirmOpen(false)
      setSnackMsg(`Bulk logout failed: ${err.message}`)
    }
  })
```

- [ ] **Step 3: Add the button in the header action row**

In the `Box sx={{ display: 'flex', gap: 2 }}>` at line 184, add a new button before the existing "Refresh Metadata" button:
```tsx
          <Button
            variant='outlined'
            color='error'
            startIcon={<i className='tabler-logout' />}
            onClick={() => setLogoutAllConfirmOpen(true)}
            disabled={!!activeJob?.status && activeJob.status === 'running'}
          >
            Logout All (All Accounts)
          </Button>
```

- [ ] **Step 4: Update the job-type label in the progress card**

The existing progress card at line 202 only labels `sync_games` and defaults to `'Refreshing Metadata'` for anything else. Update it to handle the new job type. Find:
```tsx
                {activeJob.job_type === 'sync_games' ? 'Syncing Games' : 'Refreshing Metadata'}
```
Replace with:
```tsx
                {activeJob.job_type === 'sync_games'
                  ? 'Syncing Games'
                  : activeJob.job_type === 'logout_all_bulk'
                    ? 'Logging Out All Devices'
                    : 'Refreshing Metadata'}
```

- [ ] **Step 5: Add the confirmation dialog before the final Snackbar (around line 359)**

Before:
```tsx
      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
```
Insert:
```tsx
      <Dialog open={logoutAllConfirmOpen} onClose={() => setLogoutAllConfirmOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Logout All Devices on All Accounts?</DialogTitle>
        <DialogContent>
          <Typography>
            Ini akan kick semua session di <strong>{accounts?.filter(a => a.is_active).length ?? 0} akun aktif</strong>.
            Proses berjalan di background. Pengguna Steam yang sedang main akan ke-logout.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutAllConfirmOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => logoutAllBulkMutation.mutate()}
            disabled={logoutAllBulkMutation.isPending}
          >
            {logoutAllBulkMutation.isPending ? 'Starting...' : 'Logout All'}
          </Button>
        </DialogActions>
      </Dialog>
```

- [ ] **Step 6: Type-check**

Run:
```bash
cd frontend
pnpm tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Manual verify in browser**

With 2+ active accounts, navigate to `/admin/accounts`. Log one of them into a Steam client first (for observable effect).
1. Click "Logout All (All Accounts)"
2. Confirm
3. Expect: progress card appears with "Logging Out All Devices", `processed/total` counter advancing
4. On completion, snackbar shows "Logged out N/M accounts, kicked K devices"
5. Verify the Steam client you logged in gets kicked
6. No existing features broken (add account, sync, refresh metadata all still work)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/admin/AdminAccountsPage.tsx
git commit -m "feat: bulk logout-all-devices button in accounts list"
```

---

## Final Review

After all tasks, run:

```bash
cd frontend && pnpm tsc --noEmit
cd ../backend && python -c "from app.steam.service import logout_all_devices, enumerate_tokens, revoke_refresh_token; print('imports OK')"
```

Spot-check git log:
```bash
git log --oneline -8
```
Expected: 8 feat commits matching the task order, none skipped.

## Risk Checklist (for executor)

- [ ] If `enumerate_tokens` returns an empty list every time despite multiple known active sessions, the response shape likely differs from the assumed `response.refresh_tokens`. Log `resp.json()` once and adjust the parser.
- [ ] If `revoke_refresh_token` returns 200 but sessions don't actually get kicked, Steam likely requires the `revoke_action=2` variant or a signature. Check response body and Steam community docs.
- [ ] If the re-login after revoke fails consistently, check whether the stored `password` in DB is still current. Admin can recover via the existing "Force Login" button on the account detail page.
