"""Steam integration service — wraps steam_guard.py and steam_client.py for the backend."""

import base64
import json
import logging
import os
import sys
import time

import requests

# Add project root to path so we can import the original steam modules
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from steam_guard import generate_steam_guard_code, code_time_remaining, build_confirmation_params
from steam_client import steam_login

logger = logging.getLogger(__name__)

# Steam API base
STEAM_API = "https://api.steampowered.com"
AUTH_URL = f"{STEAM_API}/IAuthenticationService"


def get_guard_code(shared_secret: str) -> dict:
    """Generate a Steam Guard TOTP code and return it with time remaining."""
    code = generate_steam_guard_code(shared_secret)
    remaining = code_time_remaining()
    return {"code": code, "remaining": remaining}


def _decode_jwt_exp(token: str) -> int:
    """Extract the exp claim from a JWT without verification."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        claims = json.loads(base64.b64decode(payload))
        return claims.get("exp", 0)
    except Exception:
        return 0


def _refresh_access_token(refresh_token: str, steam_id: str) -> str | None:
    """Use a refresh token to get a new access token. Returns new token or None."""
    try:
        resp = requests.post(
            f"{AUTH_URL}/GenerateAccessTokenForApp/v1",
            data={"refresh_token": refresh_token, "steamid": steam_id},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("response", {})
        return data.get("access_token")
    except Exception:
        return None


def _verify_token(access_token: str) -> bool:
    """Quick check whether an access token is actually accepted by Steam.

    Uses a lightweight endpoint (GetSteamLevel) to avoid unnecessary overhead.
    Steam may return 401 or 403 for server-side revoked tokens even if the
    JWT exp hasn't passed yet (e.g. IP change).
    """
    try:
        # Decode steam_id from the JWT so we don't need it as a parameter
        payload = access_token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        claims = json.loads(base64.b64decode(payload))
        steam_id = claims.get("sub", "")
        if not steam_id:
            return False

        resp = requests.get(
            f"{STEAM_API}/IPlayerService/GetSteamLevel/v1",
            params={"access_token": access_token, "steamid": steam_id},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


def _force_new_token(mafile_data: dict, password: str) -> str | None:
    """Skip the cached token and obtain a fresh one via refresh or re-login."""
    session = mafile_data.get("Session", {})
    refresh_token = session.get("RefreshToken", "")
    steam_id = session.get("SteamID", "")
    shared_secret = mafile_data.get("shared_secret", "")

    # 1. Try refreshing
    if refresh_token and steam_id:
        new_token = _refresh_access_token(refresh_token, steam_id)
        if new_token:
            session["AccessToken"] = new_token
            session["SteamLoginSecure"] = f"{steam_id}%7C%7C{new_token}"
            mafile_data["Session"] = session
            return new_token

    # 2. Full re-login
    if password and shared_secret:
        account_name = mafile_data.get("account_name", "")
        if account_name:
            try:
                new_session = steam_login(account_name, password, shared_secret)
                session["SteamID"] = new_session["SteamID"]
                session["AccessToken"] = new_session["AccessToken"]
                session["RefreshToken"] = new_session["RefreshToken"]
                session["SteamLoginSecure"] = (
                    f"{new_session['SteamID']}%7C%7C{new_session['AccessToken']}"
                )
                mafile_data["Session"] = session
                return new_session["AccessToken"]
            except Exception:
                pass

    return None


def ensure_valid_token(mafile_data: dict, password: str) -> str | None:
    """
    Ensure we have a working access token for a Steam account.

    Tries in order:
    1. Use the existing access token if not expired (verified with a live API call)
    2. Refresh using the refresh token
    3. Full login with password + shared_secret

    Returns a valid access token or None on failure.
    Updates mafile_data in-place with new tokens if refreshed/re-logged.
    """
    session = mafile_data.get("Session", {})
    access_token = session.get("AccessToken", "")

    # 1. If token looks valid by expiry, verify it actually works
    if access_token and _decode_jwt_exp(access_token) > time.time() + 60:
        if _verify_token(access_token):
            return access_token
        # Token was rejected server-side (IP change, revocation, etc.)
        # Fall through to refresh/re-login

    # 2. Refresh or re-login
    return _force_new_token(mafile_data, password)


def fetch_owned_games(access_token: str, steam_id: str) -> list[dict]:
    """
    Fetch all owned games for a Steam account using the IPlayerService API.
    Returns a list of dicts with appid, name, icon.
    """
    resp = requests.get(
        f"{STEAM_API}/IPlayerService/GetOwnedGames/v1",
        params={
            "access_token": access_token,
            "steamid": steam_id,
            "include_appinfo": "true",
            "include_played_free_games": "true",
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json().get("response", {})

    games = []
    for g in data.get("games", []):
        games.append(
            {
                "appid": g["appid"],
                "name": g.get("name", f"App {g['appid']}"),
                "icon": g.get("img_icon_url", ""),
            }
        )
    return games


# ---------------------------------------------------------------------------
# Steam Account Actions (confirmations, login, etc.)
# ---------------------------------------------------------------------------

CONF_URL = "https://steamcommunity.com/mobileconf"


def _build_session(mafile_data: dict) -> requests.Session:
    """Build an authenticated requests.Session from mafile data."""
    session_data = mafile_data.get("Session", {})
    s = requests.Session()
    s.cookies.set("steamLoginSecure", session_data.get("SteamLoginSecure", ""), domain="steamcommunity.com")
    s.cookies.set("sessionid", session_data.get("SessionID", ""), domain="steamcommunity.com")
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 13; en-us) AppleWebKit/999+ (KHTML, like Gecko) Steam/3.8.5",
        "Accept": "application/json",
    })
    return s


def fetch_confirmations(mafile_data: dict) -> list[dict]:
    """Fetch pending trade/market confirmations for a Steam account."""
    identity_secret = mafile_data.get("identity_secret", "")
    device_id = mafile_data.get("device_id", "")
    steam_id = mafile_data.get("Session", {}).get("SteamID", "")

    if not identity_secret or not device_id or not steam_id:
        return []

    params = build_confirmation_params(identity_secret, device_id, steam_id, "getlist")
    sess = _build_session(mafile_data)
    resp = sess.get(f"{CONF_URL}/getlist", params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if not data.get("success"):
        return []

    return data.get("conf", [])


def act_on_confirmation(mafile_data: dict, conf_id: str, conf_key: str, action: str) -> bool:
    """Accept or deny a single confirmation. action = 'allow' or 'cancel'."""
    identity_secret = mafile_data.get("identity_secret", "")
    device_id = mafile_data.get("device_id", "")
    steam_id = mafile_data.get("Session", {}).get("SteamID", "")

    tag = "allow" if action == "allow" else "cancel"
    params = build_confirmation_params(identity_secret, device_id, steam_id, tag)
    params["op"] = tag
    params["cid"] = conf_id
    params["ck"] = conf_key

    sess = _build_session(mafile_data)
    resp = sess.get(f"{CONF_URL}/ajaxop", params=params, timeout=15)
    resp.raise_for_status()
    return resp.json().get("success", False)


def steam_account_login(mafile_data: dict, password: str) -> dict:
    """Perform full Steam login. Returns updated session data."""
    account_name = mafile_data.get("account_name", "")
    shared_secret = mafile_data.get("shared_secret", "")
    new_session = steam_login(account_name, password, shared_secret)
    return new_session


def enumerate_tokens(access_token: str) -> list[dict]:
    """List active refresh tokens for the account tied to this access_token.

    Calls IAuthenticationService/EnumerateTokens. Returns a list of dicts each
    containing: token_id, token_description, time_updated, platform_type,
    os_platform, logged_in. Raises on HTTP error; network-layer exceptions
    (ConnectionError, Timeout) also propagate.
    """
    resp = requests.post(
        f"{AUTH_URL}/EnumerateTokens/v1",
        params={"access_token": access_token},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("response", {})
    return data.get("refresh_tokens", [])


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
    except Exception as e:
        logger.warning("revoke_refresh_token failed for token_id=%s: %r", token_id, e)
        return False
