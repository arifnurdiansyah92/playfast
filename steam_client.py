"""Steam API client for fetching and acting on trade confirmations."""

import base64
import json
import time
import uuid
from pathlib import Path
from urllib.parse import quote

import requests
import rsa

from steam_guard import (
    build_confirmation_params,
    generate_confirmation_hash,
    generate_steam_guard_code,
)

CONF_URL = "https://steamcommunity.com/mobileconf"
TWOFACTOR_URL = "https://api.steampowered.com/ITwoFactorService"
PHONE_URL = "https://store.steampowered.com/phone"
AUTH_URL = "https://api.steampowered.com/IAuthenticationService"


def steam_login(username: str, password: str, shared_secret: str | None = None) -> dict:
    """Full Steam login flow. Returns session dict with tokens."""

    # Step 1: Get RSA key for password encryption
    resp = requests.get(
        f"{AUTH_URL}/GetPasswordRSAPublicKey/v1",
        params={"account_name": username},
        timeout=15,
    )
    resp.raise_for_status()
    rsa_data = resp.json().get("response", {})

    mod = int(rsa_data["publickey_mod"], 16)
    exp = int(rsa_data["publickey_exp"], 16)
    timestamp = rsa_data["timestamp"]

    pub_key = rsa.PublicKey(mod, exp)
    encrypted_pw = base64.b64encode(rsa.encrypt(password.encode("utf-8"), pub_key)).decode("utf-8")

    # Step 2: Begin auth session
    resp = requests.post(
        f"{AUTH_URL}/BeginAuthSessionViaCredentials/v1",
        data={
            "account_name": username,
            "encrypted_password": encrypted_pw,
            "encryption_timestamp": timestamp,
            "persistence": "1",
            "device_friendly_name": "SDA",
        },
        timeout=15,
    )
    resp.raise_for_status()
    auth_data = resp.json().get("response", {})

    client_id = auth_data.get("client_id")
    request_id = auth_data.get("request_id")
    steamid = auth_data.get("steamid")

    if not client_id:
        raise RuntimeError(f"Login failed: {auth_data}")

    # Step 3: Submit 2FA code if we have shared_secret
    guard_type = None
    for conf in auth_data.get("allowed_confirmations", []):
        guard_type = conf.get("confirmation_type")
        break

    if guard_type == 3 and shared_secret:
        # TOTP code required
        code = generate_steam_guard_code(shared_secret)
        resp = requests.post(
            f"{AUTH_URL}/UpdateAuthSessionWithSteamGuardCode/v1",
            data={
                "client_id": client_id,
                "steamid": steamid,
                "code": code,
                "code_type": "3",
            },
            timeout=15,
        )
        resp.raise_for_status()
    elif guard_type == 2:
        # Email code required — need user input
        raise RuntimeError("EMAIL_CODE_REQUIRED")
    elif guard_type == 3 and not shared_secret:
        raise RuntimeError("TOTP_CODE_REQUIRED")

    # Step 4: Poll for tokens
    for _ in range(10):
        resp = requests.post(
            f"{AUTH_URL}/PollAuthSessionStatus/v1",
            data={
                "client_id": client_id,
                "request_id": request_id,
            },
            timeout=15,
        )
        resp.raise_for_status()
        poll = resp.json().get("response", {})

        refresh_token = poll.get("refresh_token")
        access_token = poll.get("access_token")

        if refresh_token:
            return {
                "SteamID": steamid,
                "AccessToken": access_token or "",
                "RefreshToken": refresh_token,
                "SessionID": auth_data.get("client_id", ""),
            }

        time.sleep(2)

    raise RuntimeError("Login timed out waiting for tokens")


def encrypt_password_for_change(password: str, rsa_key: dict) -> str:
    """Encrypt a password using Steam's RSA public key."""
    mod = int(rsa_key["publickey_mod"], 16)
    exp = int(rsa_key["publickey_exp"], 16)
    pub_key = rsa.PublicKey(mod, exp)
    return base64.b64encode(rsa.encrypt(password.encode("utf-8"), pub_key)).decode("utf-8")


class SteamAccount:
    """Represents a Steam account loaded from an .mafile."""

    def __init__(self, mafile_path: str):
        self.mafile_path = mafile_path
        data = json.loads(Path(mafile_path).read_text(encoding="utf-8"))
        self._raw = data

        self.shared_secret: str = data["shared_secret"]
        self.identity_secret: str = data["identity_secret"]
        self.device_id: str = data["device_id"]
        self.account_name: str = data["account_name"]
        self.serial_number: str = data["serial_number"]
        self.revocation_code: str = data["revocation_code"]

        session = data.get("Session", {})
        self.steam_id: str = session.get("SteamID", "")
        self.session_id: str = session.get("SessionID", "")
        self.access_token: str = session.get("AccessToken", "")
        self.refresh_token: str = session.get("RefreshToken", "")
        self.steam_login_secure: str = session.get("SteamLoginSecure", "")

    def refresh_access_token(self) -> bool:
        """Use the refresh token to get a new access token. Updates the .mafile."""
        if not self.refresh_token:
            return False

        resp = requests.post(
            f"{AUTH_URL}/GenerateAccessTokenForApp/v1",
            data={
                "refresh_token": self.refresh_token,
                "steamid": self.steam_id,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("response", {})
        new_token = data.get("access_token")
        if not new_token:
            return False

        self.access_token = new_token
        self.steam_login_secure = f"{self.steam_id}%7C%7C{new_token}"

        # Update the .mafile on disk
        self._raw["Session"]["AccessToken"] = new_token
        self._raw["Session"]["SteamLoginSecure"] = self.steam_login_secure
        Path(self.mafile_path).write_text(
            json.dumps(self._raw, indent=2), encoding="utf-8"
        )
        return True

    def ensure_token(self):
        """Refresh the access token if it looks expired."""
        if not self.access_token:
            return
        try:
            payload = self.access_token.split(".")[1]
            payload += "=" * (4 - len(payload) % 4)
            import base64
            claims = json.loads(base64.b64decode(payload))
            if claims.get("exp", 0) < time.time():
                print("Session expired, refreshing token...")
                if self.refresh_access_token():
                    print("Token refreshed successfully.")
                else:
                    print("Warning: Failed to refresh token.")
        except Exception:
            pass

    def get_guard_code(self, timestamp: int | None = None) -> str:
        return generate_steam_guard_code(self.shared_secret, timestamp)

    def _session(self) -> requests.Session:
        s = requests.Session()
        s.cookies.set("steamLoginSecure", self.steam_login_secure, domain="steamcommunity.com")
        s.cookies.set("sessionid", self.session_id, domain="steamcommunity.com")
        s.headers.update({
            "User-Agent": "Mozilla/5.0 (Linux; U; Android 13; en-us) AppleWebKit/999+ (KHTML, like Gecko) Steam/3.8.5",
            "Accept": "application/json",
        })
        return s

    def _store_session(self) -> requests.Session:
        s = requests.Session()
        s.cookies.set("steamLoginSecure", self.steam_login_secure, domain="store.steampowered.com")
        s.cookies.set("sessionid", self.session_id, domain="store.steampowered.com")
        s.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://store.steampowered.com",
            "Referer": "https://store.steampowered.com/phone/add",
        })
        return s

    def fetch_confirmations(self) -> list[dict]:
        params = build_confirmation_params(
            self.identity_secret, self.device_id, self.steam_id, "getlist"
        )
        sess = self._session()
        resp = sess.get(f"{CONF_URL}/getlist", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"Failed to fetch confirmations: {data.get('message', 'unknown error')}")
        return data.get("conf", [])

    def _send_confirmation_action(self, conf_id: str, conf_key: str, action: str) -> bool:
        tag = "allow" if action == "allow" else "cancel"
        params = build_confirmation_params(
            self.identity_secret, self.device_id, self.steam_id, tag
        )
        params["op"] = tag
        params["cid"] = conf_id
        params["ck"] = conf_key
        sess = self._session()
        resp = sess.get(f"{CONF_URL}/ajaxop", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("success", False)

    def confirm(self, conf_id: str, conf_key: str) -> bool:
        return self._send_confirmation_action(conf_id, conf_key, "allow")

    def deny(self, conf_id: str, conf_key: str) -> bool:
        return self._send_confirmation_action(conf_id, conf_key, "cancel")

    def confirm_all(self) -> list[dict]:
        confirmations = self.fetch_confirmations()
        results = []
        for conf in confirmations:
            cid = conf.get("id", "")
            ckey = conf.get("nonce", "")
            ok = self.confirm(str(cid), str(ckey))
            results.append({"id": cid, "success": ok, "summary": conf.get("headline", "")})
        return results

    def deny_all(self) -> list[dict]:
        confirmations = self.fetch_confirmations()
        results = []
        for conf in confirmations:
            cid = conf.get("id", "")
            ckey = conf.get("nonce", "")
            ok = self.deny(str(cid), str(ckey))
            results.append({"id": cid, "success": ok, "summary": conf.get("headline", "")})
        return results

    def add_authenticator(self) -> dict:
        device_id = f"android:{uuid.uuid4()}"
        resp = requests.post(
            f"{TWOFACTOR_URL}/AddAuthenticator/v1",
            params={"access_token": self.access_token},
            data={
                "steamid": self.steam_id,
                "authenticator_type": "1",
                "device_identifier": device_id,
                "sms_phone_id": "1",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("response", {})
        data["device_id"] = device_id
        return data

    def finalize_authenticator(self, shared_secret: str, sms_code: str) -> dict:
        timestamp = int(time.time())
        auth_code = generate_steam_guard_code(shared_secret, timestamp)
        resp = requests.post(
            f"{TWOFACTOR_URL}/FinalizeAddAuthenticator/v1",
            params={"access_token": self.access_token},
            data={
                "steamid": self.steam_id,
                "activation_code": sms_code,
                "authenticator_code": auth_code,
                "authenticator_time": str(timestamp),
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("response", {})

    @staticmethod
    def save_mafile(data: dict, session: dict, directory: str = ".") -> str:
        mafile = {
            "shared_secret": data["shared_secret"],
            "serial_number": data.get("serial_number", ""),
            "revocation_code": data.get("revocation_code", ""),
            "uri": data.get("uri", ""),
            "account_name": data.get("account_name", ""),
            "token_gid": data.get("token_gid", ""),
            "identity_secret": data.get("identity_secret", ""),
            "secret_1": data.get("secret_1", ""),
            "device_id": data.get("device_id", ""),
            "server_time": data.get("server_time", 0),
            "fully_enrolled": True,
            "Session": session,
        }
        steam_id = session.get("SteamID", "unknown")
        path = Path(directory) / f"{steam_id}.mafile"
        path.write_text(json.dumps(mafile, indent=2), encoding="utf-8")
        return str(path)

    def login(self, password: str) -> bool:
        session = steam_login(self.account_name, password, self.shared_secret)
        self.steam_id = session["SteamID"]
        self.access_token = session["AccessToken"]
        self.refresh_token = session["RefreshToken"]
        self.session_id = session.get("SessionID", self.session_id)
        self.steam_login_secure = f"{self.steam_id}%7C%7C{self.access_token}"
        self._raw["Session"]["SteamID"] = self.steam_id
        self._raw["Session"]["AccessToken"] = self.access_token
        self._raw["Session"]["RefreshToken"] = self.refresh_token
        self._raw["Session"]["SteamLoginSecure"] = self.steam_login_secure
        self._raw["Session"]["SessionID"] = self.session_id
        Path(self.mafile_path).write_text(
            json.dumps(self._raw, indent=2), encoding="utf-8"
        )
        return True

    def change_password(self, current_password: str, new_password: str) -> dict:
        self.ensure_token()
        resp = requests.get(
            f"{AUTH_URL}/GetPasswordRSAPublicKey/v1",
            params={"account_name": self.account_name},
            timeout=15,
        )
        resp.raise_for_status()
        rsa_key = resp.json().get("response", {})
        encrypted_current = encrypt_password_for_change(current_password, rsa_key)
        encrypted_new = encrypt_password_for_change(new_password, rsa_key)
        sess = self._store_session()
        resp = sess.post(
            "https://store.steampowered.com/account/changepassword",
            data={
                "sessionid": self.session_id,
                "current": encrypted_current,
                "new": encrypted_new,
                "rsatimestamp": rsa_key["timestamp"],
            },
            timeout=15,
        )
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return {"success": False, "error": resp.text[:300]}

    def remove_authenticator(self, scheme: int = 2) -> dict:
        url = "https://api.steampowered.com/ITwoFactorService/RemoveAuthenticator/v1"
        resp = requests.post(
            url,
            params={"access_token": self.access_token},
            data={
                "steamid": self.steam_id,
                "revocation_code": self.revocation_code,
                "revocation_reason": 1,
                "steamguard_scheme": str(scheme),
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", {})
