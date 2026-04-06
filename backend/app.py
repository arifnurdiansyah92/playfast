#!/usr/bin/env python3
"""Steam Desktop Authenticator — Web UI."""

import json
import os
import glob
import base64
import time
from pathlib import Path

import requests
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

from backend.steam_client import SteamAccount
from backend.steam_guard import generate_steam_guard_code, code_time_remaining

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # 16KB max upload

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_FILE = os.path.join(BASE_DIR, "accounts.json")
GAMES_CACHE_FILE = os.path.join(BASE_DIR, "games_cache.json")
MAFILE_DIR = BASE_DIR


# --- Credentials storage ---

def load_saved_credentials() -> dict:
    if not os.path.exists(ACCOUNTS_FILE):
        return {}
    with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_credentials(creds: dict):
    with open(ACCOUNTS_FILE, "w", encoding="utf-8") as f:
        json.dump(creds, f, indent=2)


def obfuscate(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def deobfuscate(text: str) -> str:
    return base64.b64decode(text.encode()).decode()


# --- Games cache ---

def load_games_cache() -> dict:
    if not os.path.exists(GAMES_CACHE_FILE):
        return {}
    with open(GAMES_CACHE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_games_cache(cache: dict):
    with open(GAMES_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


# --- Account helpers ---

def find_mafiles() -> list[str]:
    return sorted(glob.glob(os.path.join(MAFILE_DIR, "*.mafile")))


def get_account(account_name: str) -> SteamAccount | None:
    for mf in find_mafiles():
        try:
            acct = SteamAccount(mf)
            if acct.account_name == account_name:
                return acct
        except Exception:
            continue
    return None


def load_accounts() -> list[dict]:
    creds = load_saved_credentials()
    games_cache = load_games_cache()
    accounts = []
    for mf in find_mafiles():
        try:
            acct = SteamAccount(mf)
            saved = creds.get(acct.account_name, {})
            has_password = False
            if saved.get("password"):
                try:
                    deobfuscate(saved["password"])
                    has_password = True
                except Exception:
                    pass
            cached = games_cache.get(acct.account_name, {})
            accounts.append({
                "account_name": acct.account_name,
                "steam_id": acct.steam_id,
                "mafile": os.path.basename(mf),
                "has_password": has_password,
                "game_count": cached.get("game_count", None),
                "games_fetched": bool(cached.get("games")),
            })
        except Exception:
            continue
    return accounts


# --- Routes ---

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/accounts")
def api_accounts():
    return jsonify(load_accounts())


@app.route("/api/accounts/add", methods=["POST"])
def api_add_account():
    if "mafile" not in request.files:
        return jsonify({"error": "No .mafile uploaded"}), 400

    file = request.files["mafile"]
    if not file.filename or not file.filename.endswith(".mafile"):
        return jsonify({"error": "File must be a .mafile"}), 400

    content = file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON in .mafile"}), 400

    if "shared_secret" not in data or "account_name" not in data:
        return jsonify({"error": "Invalid .mafile — missing shared_secret or account_name"}), 400

    # Save the .mafile
    filename = secure_filename(file.filename)
    dest = os.path.join(MAFILE_DIR, filename)
    if os.path.exists(dest):
        return jsonify({"error": f"File {filename} already exists"}), 409

    with open(dest, "wb") as f:
        f.write(content)

    # Save password if provided
    password = request.form.get("password", "")
    if password:
        creds = load_saved_credentials()
        creds[data["account_name"]] = {"password": obfuscate(password)}
        save_credentials(creds)

    return jsonify({
        "success": True,
        "account_name": data["account_name"],
        "message": f"Account {data['account_name']} added successfully",
    })


@app.route("/api/accounts/delete", methods=["POST"])
def api_delete_account():
    data = request.json
    account_name = data.get("account_name", "")
    if not account_name:
        return jsonify({"error": "Account name required"}), 400

    # Find and remove the .mafile
    removed = False
    for mf in find_mafiles():
        try:
            acct = SteamAccount(mf)
            if acct.account_name == account_name:
                os.remove(mf)
                removed = True
                break
        except Exception:
            continue

    if not removed:
        return jsonify({"error": "Account not found"}), 404

    # Remove saved password
    creds = load_saved_credentials()
    if account_name in creds:
        del creds[account_name]
        save_credentials(creds)

    # Remove games cache
    cache = load_games_cache()
    if account_name in cache:
        del cache[account_name]
        save_games_cache(cache)

    return jsonify({"success": True})


@app.route("/api/save-password", methods=["POST"])
def api_save_password():
    data = request.json
    account_name = data.get("account_name", "")
    password = data.get("password", "")
    if not account_name or not password:
        return jsonify({"error": "Account name and password required"}), 400

    creds = load_saved_credentials()
    creds[account_name] = {"password": obfuscate(password)}
    save_credentials(creds)
    return jsonify({"success": True})


@app.route("/api/remove-password", methods=["POST"])
def api_remove_password():
    data = request.json
    account_name = data.get("account_name", "")
    creds = load_saved_credentials()
    if account_name in creds:
        del creds[account_name]
        save_credentials(creds)
    return jsonify({"success": True})


@app.route("/api/code/<account_name>")
def api_code(account_name: str):
    acct = get_account(account_name)
    if not acct:
        return jsonify({"error": "Account not found"}), 404
    code = acct.get_guard_code()
    remaining = code_time_remaining()
    return jsonify({"code": code, "remaining": remaining, "account_name": acct.account_name})


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    account_name = data.get("account_name", "")
    password = data.get("password", "")

    if not password:
        creds = load_saved_credentials()
        saved = creds.get(account_name, {})
        if saved.get("password"):
            try:
                password = deobfuscate(saved["password"])
            except Exception:
                pass

    if not password:
        return jsonify({"error": "No password provided and none saved"}), 400

    acct = get_account(account_name)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    try:
        acct.login(password)
        return jsonify({"success": True, "message": "Login successful! Session tokens updated."})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _ensure_fresh_token(acct: SteamAccount) -> bool:
    """Try to get a working access token: refresh first, then auto-login with saved password."""
    # Try token refresh
    acct.ensure_token()

    # Quick test: call a lightweight endpoint
    test = requests.get(
        "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1",
        params={"access_token": acct.access_token, "steamid": acct.steam_id},
        timeout=10,
    )
    if test.status_code != 401:
        return True

    # Refresh token explicitly
    if acct.refresh_access_token():
        test2 = requests.get(
            "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1",
            params={"access_token": acct.access_token, "steamid": acct.steam_id},
            timeout=10,
        )
        if test2.status_code != 401:
            return True

    # Tokens dead — try auto-login with saved password
    creds = load_saved_credentials()
    saved = creds.get(acct.account_name, {})
    if saved.get("password"):
        try:
            password = deobfuscate(saved["password"])
            acct.login(password)
            return True
        except Exception:
            pass

    return False


@app.route("/api/games/<account_name>")
def api_games(account_name: str):
    """Fetch owned games for an account. Auto-logins if tokens expired."""
    acct = get_account(account_name)
    if not acct:
        return jsonify({"error": "Account not found"}), 404

    if not acct.steam_id:
        return jsonify({"error": "No SteamID in .mafile"}), 400

    # Check cache (refresh if older than 1 hour)
    cache = load_games_cache()
    cached = cache.get(account_name, {})
    if cached.get("games") and (time.time() - cached.get("fetched_at", 0)) < 3600:
        return jsonify({
            "account_name": account_name,
            "games": cached["games"],
            "game_count": cached["game_count"],
            "cached": True,
        })

    # Ensure we have a working token
    if not _ensure_fresh_token(acct):
        return jsonify({"error": "Session expired — save your password and try again, or click Login first"}), 401

    # Fetch from Steam API
    try:
        resp = requests.get(
            "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1",
            params={
                "access_token": acct.access_token,
                "steamid": acct.steam_id,
                "include_appinfo": "true",
                "include_played_free_games": "true",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("response", {})
    except Exception as e:
        return jsonify({"error": f"Steam API error: {e}"}), 502

    games = []
    for g in data.get("games", []):
        games.append({
            "appid": g["appid"],
            "name": g.get("name", f"App {g['appid']}"),
            "playtime": g.get("playtime_forever", 0),
            "icon": g.get("img_icon_url", ""),
        })

    games.sort(key=lambda g: g["name"].lower())
    game_count = data.get("game_count", len(games))

    # Cache it
    cache[account_name] = {
        "games": games,
        "game_count": game_count,
        "fetched_at": time.time(),
    }
    save_games_cache(cache)

    return jsonify({
        "account_name": account_name,
        "games": games,
        "game_count": game_count,
        "cached": False,
    })


@app.route("/api/games/all")
def api_games_all():
    """Return cached game data for all accounts (for filtering)."""
    cache = load_games_cache()
    result = {}
    for account_name, data in cache.items():
        if data.get("games"):
            result[account_name] = {
                "games": data["games"],
                "game_count": data["game_count"],
            }
    return jsonify(result)


if __name__ == "__main__":
    print("Steam Desktop Authenticator — Web UI")
    print("Open http://localhost:5000 in your browser")
    print()
    app.run(debug=True, port=5000)
