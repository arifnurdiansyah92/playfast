# Domain Pitfalls

**Domain:** Steam Game Sharing/Rental Platform  
**Researched:** 2026-04-07  
**Confidence:** HIGH (based on codebase audit, Steam API documentation, community reports, and security standards)

---

## Critical Pitfalls

Mistakes that cause account bans, credential compromise, or total platform failure.

---

### Pitfall 1: Passwords Stored with Base64 "Obfuscation" Instead of Encryption

**What goes wrong:** The existing codebase (`app.py` lines 41-45) uses `base64.b64encode()` / `base64.b64decode()` to "protect" saved Steam passwords. Base64 is encoding, not encryption. Anyone with filesystem or database access can decode every password instantly. This is classified as CWE-261 (Weak Encoding for Password) by MITRE.

**Why it happens:** Developer treats encoding as encryption out of convenience. Base64 makes passwords non-human-readable at a glance, creating a false sense of security.

**Consequences:**
- A single filesystem breach exposes every Steam account password in plaintext
- If `accounts.json` leaks (backup, git, misconfigured server), all accounts are compromised
- Users whose accounts are stolen may have items, wallet funds, and linked payment methods drained
- Legal liability for storing third-party credentials with negligent security

**Prevention:**
- Use AES-256-GCM for encrypting passwords at rest (passwords must be recoverable for auto-login, so hashing is not an option here)
- Derive the encryption key from a master secret stored in an environment variable, never in the codebase or database
- Use unique IV/nonce per encrypted value
- Consider a dedicated secrets manager (even a simple one like python-keyring for small scale, or HashiCorp Vault for production)

**Detection:**
- Code review: any use of `base64.b64encode` for credential storage is a red flag
- Grep for `obfuscate`/`deobfuscate` function names that suggest encoding-as-security
- If `accounts.json` is human-readable after base64 decode, the system is vulnerable

**Phase:** Must be addressed in Phase 1 (Foundation/Security). Do not ship any version without this fixed.

---

### Pitfall 2: .mafile Credentials Committed to Version Control or Stored Unencrypted

**What goes wrong:** The `.mafile` contains `shared_secret`, `identity_secret`, `revocation_code`, and session tokens. These are equivalent to full account ownership. The current project has a real `.mafile` (`226127046.mafile`) sitting in the `backend/` directory with no root `.gitignore` excluding `*.mafile` or `accounts.json`.

**Why it happens:** The CLI tool was built for personal use where the .mafile sits alongside the script. When transitioning to a web platform, nobody added gitignore rules or moved secrets to encrypted storage.

**Consequences:**
- If repo is ever pushed to GitHub (even briefly), credential scraping bots will find and compromise the accounts within minutes
- `shared_secret` + `identity_secret` = ability to generate 2FA codes, confirm trades, and fully control the account
- `revocation_code` = ability to remove the authenticator entirely

**Prevention:**
- Immediately add root `.gitignore` with: `*.mafile`, `accounts.json`, `games_cache.json`, `.env`
- Store .mafile contents encrypted in the database, not as raw JSON files on disk
- Never log or expose `shared_secret`, `identity_secret`, or `revocation_code` in API responses
- Implement field-level encryption for all secrets before database insertion

**Detection:**
- Run `git log --all --diff-filter=A -- '*.mafile'` to check if .mafiles were ever committed
- Check API responses for any endpoint that returns raw mafile data
- Audit that no endpoint exposes `shared_secret` or `identity_secret`

**Phase:** Immediate (before first commit). Add `.gitignore` now. Encrypted storage in Phase 1.

---

### Pitfall 3: Steam ToS Violation Leading to Mass Account Bans

**What goes wrong:** Steam's Subscriber Agreement explicitly prohibits account sharing and selling. Valve states accounts are non-transferable, and sharing credentials is a bannable offense. Running a commercial service that distributes Steam credentials to paying customers is a direct violation.

**Why it happens:** Many game sharing services operate in a gray area, assuming Valve won't enforce against small operators. But Valve has automated detection and does ban accounts.

**Consequences:**
- All managed Steam accounts could be permanently banned simultaneously
- Users who paid for access lose their games with no recourse
- Platform reputation is destroyed overnight
- No legal standing to contest since the service itself violates ToS

**Prevention:**
- This is an inherent business risk that cannot be engineered away. The platform must be designed with this reality:
  - Never store user payment information in a way that links to Steam ToS violations
  - Implement robust refund/credit mechanisms for when accounts are banned
  - Diversify account portfolio so a single ban wave does not eliminate all inventory
  - Monitor account health (login success, VAC status, community bans) proactively
  - Instruct users to use offline mode to minimize Steam's visibility into sharing patterns
  - Avoid online multiplayer usage which increases VAC/ban risk dramatically

**Detection:**
- Automated health checks: attempt login to each account daily, flag failures
- Monitor `https://api.steampowered.com/ISteamUser/GetPlayerBans/v1` for each account
- Track login failure rate trends (sudden spike = ban wave)

**Phase:** Phase 1 (account health monitoring), ongoing operational concern throughout all phases.

---

### Pitfall 4: Concurrent Login Conflicts Destroying User Experience

**What goes wrong:** Steam enforces single active session per account. When User A is playing and User B logs into the same account, User A gets kicked with "Invalid Steam UserID Ticket" and loses their game progress (especially in games without cloud saves).

**Why it happens:** Round-robin assignment means multiple users share the same account. The "offline mode" mitigation requires user discipline, and users will inevitably forget or ignore instructions.

**Consequences:**
- Users get kicked mid-game, leading to frustration and refund demands
- Users blame the platform, not their own failure to use offline mode
- Negative word-of-mouth in the Indonesian gaming community
- Users may retaliate by changing account passwords or enabling their own 2FA

**Prevention:**
- **Technical:** Track active sessions per account. When assigning a game, show real-time "currently in use by X users" count
- **UX:** Make offline mode instructions impossible to skip (require checkbox acknowledgment before revealing credentials)
- **Architecture:** Implement a "session lock" concept where a user claims exclusive access for a time window (e.g., 4 hours)
- **Limit sharing density:** Cap the number of users per account (e.g., max 3 users per account per game)
- **Push notifications:** Alert users when another person is about to use their shared account

**Detection:**
- Track Steam Guard code request frequency per account (high frequency = multiple active users)
- Monitor support/complaint volume per account
- Log when users request codes within 5 minutes of each other on the same account

**Phase:** Phase 2 (User Experience). Session lock system should be in the core marketplace, not bolted on later.

---

### Pitfall 5: Steam API Rate Limiting Crippling Game Library Sync

**What goes wrong:** Since June 2025, Steam aggressively throttles API requests. The limit dropped from ~100 req/s to ~25 req/s with immediate 429 errors. With many accounts, a naive "fetch all games for all accounts" approach will hit rate limits instantly, and the Retry-After header now enforces 60-120 second delays.

**Why it happens:** The current code (`app.py`) fetches games per-account on demand with no rate limiting, queuing, or backoff. When scaling to 10+ accounts, sequential fetches work; when an admin clicks "refresh all," it hammers the API.

**Consequences:**
- Game library sync fails silently or with cryptic 429 errors
- Admin sees stale/incomplete game catalogs
- New accounts added to the platform cannot have their games listed for hours
- Steam may blacklist the API key entirely for persistent abuse

**Prevention:**
- Implement a request queue with token bucket rate limiter (max 20 req/s with burst of 5)
- Add exponential backoff with jitter on 429 responses (respect `Retry-After` header)
- Cache aggressively: game libraries change rarely, cache for 24 hours minimum (not 1 hour as current code does)
- Stagger initial sync: when bulk-adding accounts, queue them with 2-second delays
- Use a background worker (Celery, or even a simple threading.Timer) for game sync, not the request thread
- The daily limit is approximately 100,000 requests. With 50 accounts, that is 2,000 requests per account per day, which is fine. But bursting them all at once is not.

**Detection:**
- Log all Steam API response codes. Alert on any 429
- Dashboard showing "last successful sync" timestamp per account
- Monitor API quota usage with a rolling counter

**Phase:** Phase 1 (Backend Foundation). Rate limiting must be built into the Steam API client layer from day one, not patched in after hitting limits.

---

## Moderate Pitfalls

---

### Pitfall 6: Token Expiry Cascade During Peak Usage

**What goes wrong:** Steam access tokens expire after ~24 hours. Refresh tokens expire after ~207 days. When a user requests a Steam Guard code, the system needs a valid session. If the access token is expired AND the refresh token fails, it must do a full re-login (which requires the saved password). If multiple accounts expire simultaneously, the system floods Steam's auth servers, hitting rate limits.

**Prevention:**
- Implement proactive token refresh: a background job that refreshes access tokens for all accounts every 12 hours (well before the 24-hour expiry)
- Track refresh token expiry dates (decode JWT, read `exp` claim) and re-login accounts 7 days before refresh token expiry
- Never depend on "refresh on demand" for user-facing requests. The code in `_ensure_fresh_token` does cascading fallback (refresh -> re-login), but doing this during a user request adds 5-10 seconds of latency
- Stagger refresh jobs across accounts to avoid burst auth requests

**Detection:**
- Monitor token refresh failure rates
- Alert when any account's refresh token is within 14 days of expiry
- Dashboard showing token health per account (green/yellow/red)

**Phase:** Phase 1 (Backend Foundation). Token lifecycle management is core infrastructure.

---

### Pitfall 7: Clock Drift Breaking Steam Guard Code Generation

**What goes wrong:** Steam Guard uses TOTP with 30-second windows. If the server's clock drifts even 30-60 seconds from Steam's servers, generated codes will be rejected. The current code (`steam_guard.py`) uses `time.time()` with no drift correction.

**Prevention:**
- Sync server time with NTP (Network Time Protocol). On Linux: `systemd-timesyncd` or `ntpd`. On Windows Server: W32Time service
- Implement Steam time offset: call `https://api.steampowered.com/ITwoFactorService/QueryTime/v1` at startup to get Steam's server time, calculate offset, and apply it to all code generation
- ArchiSteamFarm does exactly this - it queries Steam's time API and adjusts
- The tolerance window is approximately +/- 1 time step (89 seconds max), but relying on tolerance is fragile

**Detection:**
- If users report "codes not working" but the shared_secret is correct, clock drift is the likely cause
- Compare locally generated code against a known-good authenticator app
- Log Steam's response when 2FA codes are rejected during auto-login

**Phase:** Phase 1 (Backend Foundation). Add Steam time sync to the startup sequence.

---

### Pitfall 8: User Can Hijack Assigned Steam Account

**What goes wrong:** The platform reveals Steam username + password to purchasing users so they can log in. A malicious user could change the password, change the email, remove the authenticator (using session access), or link their own phone number, effectively stealing the account.

**Prevention:**
- Never give users the raw password. Instead, provide a limited "session token" or use a launcher/proxy approach (much more complex)
- If you must share credentials (as the current design requires), implement these safeguards:
  - Monitor password change attempts via the account's email notifications
  - Run a periodic "canary login" that verifies the saved password still works
  - If canary login fails, auto-flag the account and notify admin immediately
  - Instruct users that account tampering results in permanent ban from the platform and loss of all purchases
  - Store `revocation_code` securely so admin can always reclaim the authenticator
- Rate-limit credential reveals: a user should not need username/password more than once (they save it in their Steam client)

**Detection:**
- Canary login jobs (every 6 hours per account)
- Alert on password change (login failure with known-good password)
- Monitor Steam Guard code request patterns (a user generating many codes may be attempting account changes)

**Phase:** Phase 2 (Marketplace). Build monitoring alongside credential delivery.

---

### Pitfall 9: GetOwnedGames Returning Empty Results Due to Privacy Settings

**What goes wrong:** The `IPlayerService/GetOwnedGames` API respects Steam profile privacy settings. If an account's game details are set to "private" or "friends only," the API returns an empty game list even with a valid access token, unless the request uses the account's own API key/token for its own SteamID.

**Why it happens:** When using access tokens (as the current code does), the request should work for the token's own account. But if privacy settings are changed (manually or by Steam updates), games disappear from the catalog.

**Prevention:**
- During account onboarding, verify that game list fetch works and returns expected results
- Store the last known game count per account; if a refresh returns 0 games for an account that previously had 200, flag it as a privacy setting issue rather than silently wiping the catalog
- Add admin notification: "Account X returned 0 games, previously had N. Check privacy settings."
- Never auto-delete cached games on a 0-result response. Mark as "stale" instead.

**Detection:**
- Compare current fetch results against cached count
- Alert on dramatic drops (>50% reduction in game count)
- Admin dashboard showing accounts with fetch failures

**Phase:** Phase 1 (Game Sync). Build defensive caching from the start.

---

### Pitfall 10: Suspicious Login Detection Triggering Account Locks

**What goes wrong:** Steam monitors login locations via IP geolocation. When the platform server (likely in a datacenter or VPS) logs into accounts that were originally registered in Indonesia from a different IP range, Steam may flag the account for suspicious activity, triggering temporary locks or requiring additional verification.

**Prevention:**
- Host the backend in the same geographic region as the accounts (Indonesia). Use an Indonesian VPS/cloud provider
- Minimize login frequency: once a session is established and tokens are refreshed, avoid full re-logins
- If using a cloud provider, use a static IP so Steam sees consistent login patterns
- Avoid VPN/proxy rotation which creates constantly-changing IP addresses
- After initial setup, the refresh token flow does not trigger new login location alerts (only full credential logins do)

**Detection:**
- Monitor login success/failure rates by account
- Check if accounts receive "new login from [location]" emails
- Track whether Steam is sending verification emails during login flow

**Phase:** Phase 1 (Infrastructure). Server location decision must happen before account onboarding.

---

### Pitfall 11: No Audit Trail for Credential Access

**What goes wrong:** Users request Steam Guard codes and view credentials. Without comprehensive logging, an admin cannot determine who accessed which account, when, and how often. When an account is compromised or misused, there is no forensic trail.

**Prevention:**
- Log every credential reveal (who, when, which account, IP address)
- Log every Steam Guard code generation (who, when, which account)
- Log every login attempt (automated and manual)
- Implement log retention policy (minimum 90 days)
- Make logs immutable (append-only, separate from main database)
- Admin dashboard with filterable audit log view

**Detection:**
- If audit logs are missing events, the logging system itself is broken
- Periodic audit: review access patterns for anomalies (one user requesting 50 codes in an hour)

**Phase:** Phase 1 (Backend Foundation). Logging infrastructure is foundational, not an afterthought.

---

## Minor Pitfalls

---

### Pitfall 12: Round-Robin Assignment Without Load Awareness

**What goes wrong:** Pure round-robin assigns accounts sequentially without considering how many users already share each account. Account A might have 5 users while Account B has 1, simply because A was added first and happens to own more popular games.

**Prevention:**
- Use weighted round-robin or "least connections" assignment: assign to the account with the fewest active users for that game
- Track active user count per account per game
- Allow admin to set max-users-per-account limits

**Phase:** Phase 2 (Marketplace Assignment Logic).

---

### Pitfall 13: Game Deduplication Edge Cases

**What goes wrong:** The same game may appear under slightly different names across accounts (especially regional variants or bundle editions). App IDs should be identical, but some free-to-play games, DLC, and promotional versions have different appids for the same game.

**Prevention:**
- Deduplicate strictly by `appid` (not by name)
- For DLC/editions: treat each appid as a separate listing
- Allow admin to manually link/unlink games across appids if needed
- Use Steam's `include_appinfo=true` to get canonical names, but never rely on name matching

**Phase:** Phase 2 (Game Catalog).

---

### Pitfall 14: Stale Game Cache Showing Unavailable Games

**What goes wrong:** If an account is banned, removed, or its game library changes, the cached game catalog continues showing games that are no longer accessible. Users purchase access to games that don't exist anymore on any available account.

**Prevention:**
- Link game catalog entries to live account status. If all accounts owning a game are offline/banned, hide or grey out the listing
- Implement "available copies" count that reflects real-time account health
- On purchase, verify the assigned account still owns the game before confirming the transaction
- Allow admin to force-refresh cache for specific accounts

**Phase:** Phase 2 (Marketplace). Real-time availability checks.

---

### Pitfall 15: Indonesian Payment Integration Complexity

**What goes wrong:** Indonesian payment (QRIS, bank transfer, e-wallets like OVO/GoPay/Dana) has different integration patterns than Western payment gateways. Manual payment confirmation (admin verifies transfers) does not scale past 20-30 daily orders.

**Prevention:**
- Start manual as planned, but architect the payment system with a gateway adapter pattern from day one
- Use Midtrans or Xendit (Indonesian payment gateway providers) when ready to automate
- Store order status as a state machine: pending -> confirmed -> fulfilled -> completed
- Never directly couple payment confirmation to account assignment. Use an event/queue pattern

**Phase:** Phase 3 (Payment). But architect the adapter pattern in Phase 2.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Phase 1: Security Foundation | Passwords stored as base64 (Pitfall 1); .mafile in git (Pitfall 2) | Implement AES-256-GCM encryption; add root .gitignore immediately |
| Phase 1: Backend Infrastructure | Rate limiting absent (Pitfall 5); Token cascade (Pitfall 6) | Build rate limiter and token lifecycle manager into core Steam API client |
| Phase 1: Server Setup | Wrong geographic region (Pitfall 10) | Host in Indonesia (e.g., IDCloudHost, Biznet Gio, or AWS ap-southeast-1) |
| Phase 2: Marketplace | Concurrent login chaos (Pitfall 4); Account hijacking (Pitfall 8) | Session lock system; canary login monitoring; credential reveal rate limiting |
| Phase 2: Game Catalog | Empty game lists (Pitfall 9); Stale cache (Pitfall 14) | Defensive caching with anomaly detection; never auto-delete on 0-result |
| Phase 2: Assignment Logic | Naive round-robin (Pitfall 12) | Weighted assignment based on current user count |
| Phase 3: Payment | Manual payment bottleneck (Pitfall 15) | Adapter pattern from day one; Midtrans/Xendit integration path |
| All Phases | Steam ToS violation (Pitfall 3) | Account health monitoring; ban detection; offline mode enforcement |
| All Phases | No audit trail (Pitfall 11) | Comprehensive logging from first API endpoint |

---

## Sources

### Official Documentation
- [Steam Account Security Recommendations](https://help.steampowered.com/en/faqs/view/6639-EB3C-EC79-FF60) - HIGH confidence
- [Steam Subscriber Agreement - Account Restrictions](https://help.steampowered.com/en/faqs/view/4F62-35F9-F395-5C23) - HIGH confidence
- [Steamworks IPlayerService Documentation](https://partner.steamgames.com/doc/webapi/IPlayerService) - HIGH confidence
- [Steam Web API Overview](https://partner.steamgames.com/doc/webapi_overview) - HIGH confidence
- [Steam OAuth Documentation](https://partner.steamgames.com/doc/webapi_overview/oauth) - HIGH confidence

### Security Standards
- [CWE-261: Weak Encoding for Password](https://cwe.mitre.org/data/definitions/261.html) - HIGH confidence
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) - HIGH confidence
- [Microsoft Secrets Management Best Practices](https://learn.microsoft.com/en-us/azure/security/fundamentals/secrets-best-practices) - HIGH confidence

### Steam Community / Developer Reports
- [Steam API Rate Limiting Discussion](https://steamcommunity.com/discussions/forum/1/601902348018676495/) - MEDIUM confidence
- [SteamWebAPI 429 Errors Post-June 2025](https://www.steamwebapi.com/blog/429-too-many-requests-for-getplayersummaries) - MEDIUM confidence
- [Steam API GetOwnedGames Privacy Settings](https://steamcommunity.com/discussions/forum/7/1729827777339922602/) - MEDIUM confidence
- [Simultaneous Login Behavior](https://steamcommunity.com/discussions/forum/1/4511002848509836862/) - MEDIUM confidence
- [Steam Account Sharing Bans](https://www.kjcesports.com/feature/steam-account-sharing-will-get-you-banned/) - MEDIUM confidence

### Open Source Reference (ArchiSteamFarm)
- [ASF Security Documentation](https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Security) - HIGH confidence
- [ASF Two-Factor Authentication Wiki](https://github.com/JustArchiNET/ArchiSteamFarm/wiki/Two-factor-authentication) - HIGH confidence
- [SteamKit New Login Flow](https://github.com/SteamRE/SteamKit/issues/1125) - MEDIUM confidence

### Token / Authentication
- [node-steam-session (DoctorMcKay)](https://github.com/DoctorMcKay/node-steam-session) - MEDIUM confidence
- [Steam Token Expiry Discussion](https://dev.doctormckay.com/topic/4235-compatibility-between-old-access_token-storage-and-new-steam-session-refreshtoken-2-refreshtoken-questions/) - MEDIUM confidence
- [TOTP Clock Drift Guide](https://www.protectimus.com/blog/time-drift-in-totp-hardware-tokens/) - MEDIUM confidence
