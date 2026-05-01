#!/usr/bin/env python3
"""Refresh the Session tokens inside a .mafile by re-logging into Steam.

Reads the mafile, performs a full Steam login using the supplied password
and the mafile's shared_secret (for the TOTP), and writes the new
SteamID / AccessToken / RefreshToken / SteamLoginSecure back into the
file's Session block. Touches no database — only the file.

Use this when an account's session has expired (confirmations stop
working, AccessToken JWT past its `exp`, etc.) and you have the current
Steam password.

Usage (from repo root):

    python scripts/update_mafile.py --mafile 231255319.mafile --password 'newpass!@#'

The original mafile is backed up to <name>.mafile.bak before being
overwritten. Use single quotes around passwords containing `!` in bash.
"""

import argparse
import json
import os
import shutil
import sys


def _bootstrap_imports():
    """Make `steam_client` (project-root module) importable."""
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(here)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)


def main():
    parser = argparse.ArgumentParser(description="Refresh Session tokens inside a .mafile via Steam re-login.")
    parser.add_argument("--mafile", required=True, help="Path to the .mafile to refresh")
    parser.add_argument("--password", required=True, help="Current Steam password")
    parser.add_argument("--no-backup", action="store_true", help="Skip writing <file>.bak before overwriting")
    args = parser.parse_args()

    if not os.path.isfile(args.mafile):
        print(f"ERROR: mafile not found: {args.mafile}", file=sys.stderr)
        sys.exit(1)

    with open(args.mafile, "r", encoding="utf-8") as f:
        try:
            mafile = json.load(f)
        except json.JSONDecodeError as e:
            print(f"ERROR: mafile is not valid JSON: {e}", file=sys.stderr)
            sys.exit(1)

    account_name = mafile.get("account_name")
    shared_secret = mafile.get("shared_secret")
    if not account_name or not shared_secret:
        print("ERROR: mafile is missing account_name or shared_secret", file=sys.stderr)
        sys.exit(1)

    _bootstrap_imports()
    try:
        from steam_client import steam_login
    except ImportError as e:
        print(f"ERROR: could not import steam_client (run from repo root, with deps installed): {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Logging in as '{account_name}' to Steam...")
    try:
        new_session = steam_login(account_name, args.password, shared_secret)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: Steam login failed: {e}", file=sys.stderr)
        sys.exit(2)

    steam_id = str(new_session.get("SteamID") or "")
    access_token = new_session.get("AccessToken") or ""
    refresh_token = new_session.get("RefreshToken") or ""
    if not steam_id or not refresh_token:
        print(f"ERROR: Steam login returned incomplete session: {new_session!r}", file=sys.stderr)
        sys.exit(2)

    session = mafile.get("Session") or {}
    old_steam_id = session.get("SteamID", "")
    if old_steam_id and old_steam_id != steam_id:
        print(
            f"WARNING: SteamID changed: '{old_steam_id}' -> '{steam_id}'. "
            "This usually means you logged into a different account.",
            file=sys.stderr,
        )

    session["SteamID"] = steam_id
    session["AccessToken"] = access_token
    session["RefreshToken"] = refresh_token
    # SteamLoginSecure is the cookie value the confirmations endpoint expects.
    # Format: "{steam_id}||{access_token}" URL-encoded — `||` becomes `%7C%7C`.
    session["SteamLoginSecure"] = f"{steam_id}%7C%7C{access_token}"
    mafile["Session"] = session

    if not args.no_backup:
        backup_path = args.mafile + ".bak"
        shutil.copy2(args.mafile, backup_path)
        print(f"Backup written: {backup_path}")

    with open(args.mafile, "w", encoding="utf-8") as f:
        json.dump(mafile, f, separators=(",", ":"))

    print(f"OK: refreshed Session for '{account_name}' (steam_id={steam_id}) in {args.mafile}")


if __name__ == "__main__":
    main()
