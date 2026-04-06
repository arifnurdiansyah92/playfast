"""Steam integration service — wraps steam_guard.py and steam_client.py for the backend."""

import base64
import json
import os
import sys
import time

import requests

# Add project root to path so we can import the original steam modules
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from steam_guard import generate_steam_guard_code, code_time_remaining
from steam_client import steam_login

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


def ensure_valid_token(mafile_data: dict, password: str) -> str | None:
    """
    Ensure we have a working access token for a Steam account.

    Tries in order:
    1. Use the existing access token if not expired
    2. Refresh using the refresh token
    3. Full login with password + shared_secret

    Returns a valid access token or None on failure.
    Updates mafile_data in-place with new tokens if refreshed/re-logged.
    """
    session = mafile_data.get("Session", {})
    access_token = session.get("AccessToken", "")
    refresh_token = session.get("RefreshToken", "")
    steam_id = session.get("SteamID", "")
    shared_secret = mafile_data.get("shared_secret", "")

    # 1. Check if current token is still valid
    if access_token and _decode_jwt_exp(access_token) > time.time() + 60:
        return access_token

    # 2. Try refreshing
    if refresh_token and steam_id:
        new_token = _refresh_access_token(refresh_token, steam_id)
        if new_token:
            session["AccessToken"] = new_token
            session["SteamLoginSecure"] = f"{steam_id}%7C%7C{new_token}"
            mafile_data["Session"] = session
            return new_token

    # 3. Full re-login
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
