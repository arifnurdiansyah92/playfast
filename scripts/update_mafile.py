#!/usr/bin/env python3
"""One-off: replace mafile_data + password on an existing SteamAccount.

Use this when an account's session has gone stale and you have a fresh
.mafile to upload. Matches the target account by steam_id (taken from
the new mafile) so you can't accidentally clobber the wrong row.

Usage (from repo root):

    python scripts/update_mafile.py --mafile path/to/account.mafile --password "newpass"

Or specify the steam_id explicitly to override the one in the mafile:

    python scripts/update_mafile.py --mafile path/to/account.mafile --password "newpass" \\
        --steam-id 76561199245200478

Run on the same host as the backend so it picks up the same .env / DB.
"""

import argparse
import json
import os
import sys


def _bootstrap():
    """Mirror backend/run.py's path setup so `from app import create_app` works."""
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(here)
    backend_dir = os.path.join(project_root, "backend")
    for p in [backend_dir, project_root]:
        if p not in sys.path:
            sys.path.insert(0, p)
    from dotenv import load_dotenv
    load_dotenv(os.path.join(backend_dir, ".env"))


def main():
    parser = argparse.ArgumentParser(description="Replace mafile_data + password on an existing SteamAccount.")
    parser.add_argument("--mafile", required=True, help="Path to the new .mafile JSON")
    parser.add_argument("--password", required=True, help="New Steam password")
    parser.add_argument(
        "--steam-id",
        default=None,
        help="Override the steam_id used to find the row (default: read from mafile Session.SteamID)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.mafile):
        print(f"ERROR: mafile not found: {args.mafile}", file=sys.stderr)
        sys.exit(1)

    with open(args.mafile, "r", encoding="utf-8") as f:
        try:
            mafile_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"ERROR: mafile is not valid JSON: {e}", file=sys.stderr)
            sys.exit(1)

    required = ["identity_secret", "shared_secret", "device_id", "Session"]
    missing = [k for k in required if k not in mafile_data]
    if missing:
        print(f"ERROR: mafile is missing required fields: {missing}", file=sys.stderr)
        sys.exit(1)

    session = mafile_data.get("Session") or {}
    for key in ("SteamID", "AccessToken", "RefreshToken", "SteamLoginSecure"):
        if not session.get(key):
            print(f"ERROR: mafile Session is missing '{key}'", file=sys.stderr)
            sys.exit(1)

    steam_id = args.steam_id or session.get("SteamID")
    if not steam_id:
        print("ERROR: could not determine steam_id (mafile Session.SteamID is empty and --steam-id not given)", file=sys.stderr)
        sys.exit(1)

    _bootstrap()
    from app import create_app
    from app.extensions import db
    from app.models import SteamAccount

    app = create_app()
    with app.app_context():
        account = SteamAccount.query.filter_by(steam_id=str(steam_id)).first()
        if not account:
            print(f"ERROR: no SteamAccount with steam_id={steam_id}", file=sys.stderr)
            sys.exit(1)

        old_account_name = account.account_name
        new_account_name = mafile_data.get("account_name") or old_account_name

        print(f"Found account #{account.id}: {old_account_name} (steam_id={account.steam_id}, active={account.is_active})")
        if new_account_name != old_account_name:
            print(f"  account_name in mafile differs: '{old_account_name}' -> '{new_account_name}' (will update)")

        account.mafile_data = mafile_data
        account.password = args.password
        if new_account_name != old_account_name:
            account.account_name = new_account_name
        db.session.commit()

        print(f"OK: updated mafile_data + password for account #{account.id} ({account.account_name})")


if __name__ == "__main__":
    main()
