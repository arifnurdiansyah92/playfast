#!/usr/bin/env python3
"""Steam Desktop Authenticator — CLI tool for Steam Guard codes and confirmations."""

import argparse
import glob
import os
import sys
import time

from backend.steam_client import SteamAccount
from backend.steam_guard import code_time_remaining


def ask_password(prompt: str = "Password: ") -> str:
    """Ask for a password, with fallback if getpass doesn't work."""
    try:
        import getpass
        return getpass.getpass(prompt)
    except Exception:
        return input(prompt)


def find_mafiles(directory: str = ".") -> list[str]:
    """Find all .mafile files in the given directory."""
    return sorted(glob.glob(os.path.join(directory, "*.mafile")))


def cmd_code(account: SteamAccount, watch: bool = False):
    """Generate and display a Steam Guard code."""
    if watch:
        print(f"Steam Guard codes for {account.account_name} (Ctrl+C to stop)\n")
        try:
            last_code = ""
            while True:
                code = account.get_guard_code()
                remaining = code_time_remaining()
                if code != last_code:
                    last_code = code
                    print()
                bar = "#" * remaining + "-" * (30 - remaining)
                print(f"\r  Code: {code}  [{bar}] {remaining:2d}s ", end="", flush=True)
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("\n")
    else:
        code = account.get_guard_code()
        remaining = code_time_remaining()
        print(f"Account:   {account.account_name}")
        print(f"Code:      {code}")
        print(f"Expires:   {remaining}s")


def cmd_confirmations(account: SteamAccount):
    """List pending confirmations."""
    print(f"Fetching confirmations for {account.account_name}...")
    try:
        confs = account.fetch_confirmations()
    except Exception as e:
        print(f"Error: {e}")
        return

    if not confs:
        print("No pending confirmations.")
        return

    print(f"\n{len(confs)} pending confirmation(s):\n")
    for i, conf in enumerate(confs, 1):
        print(f"  [{i}] ID: {conf.get('id')}")
        print(f"      Type: {conf.get('type_name', conf.get('type', 'Unknown'))}")
        print(f"      Summary: {conf.get('headline', 'N/A')}")
        desc_lines = conf.get("summary", [])
        if isinstance(desc_lines, list):
            for line in desc_lines:
                print(f"      {line}")
        print()

    return confs


def cmd_confirm(account: SteamAccount, confirm_all: bool = False, deny: bool = False):
    """Confirm or deny confirmations."""
    if confirm_all:
        action = "Denying" if deny else "Confirming"
        print(f"{action} all for {account.account_name}...")
        try:
            results = account.deny_all() if deny else account.confirm_all()
        except Exception as e:
            print(f"Error: {e}")
            return

        if not results:
            print("No pending confirmations.")
            return

        for r in results:
            status = "OK" if r["success"] else "FAILED"
            print(f"  [{status}] {r.get('summary', r['id'])}")
        return

    # Interactive mode — list then ask
    confs = cmd_confirmations(account)
    if not confs:
        return

    choice = input("Enter number to confirm (or 'a' for all, 'd' to deny all, 'q' to quit): ").strip()
    if choice.lower() == "q":
        return
    elif choice.lower() == "a":
        for conf in confs:
            ok = account.confirm(str(conf["id"]), str(conf["nonce"]))
            status = "OK" if ok else "FAILED"
            print(f"  [{status}] {conf.get('headline', conf['id'])}")
    elif choice.lower() == "d":
        for conf in confs:
            ok = account.deny(str(conf["id"]), str(conf["nonce"]))
            status = "OK" if ok else "FAILED"
            print(f"  [{status}] Denied: {conf.get('headline', conf['id'])}")
    else:
        try:
            idx = int(choice) - 1
            conf = confs[idx]
            action = input("  (c)onfirm or (d)eny? ").strip().lower()
            if action == "c":
                ok = account.confirm(str(conf["id"]), str(conf["nonce"]))
            elif action == "d":
                ok = account.deny(str(conf["id"]), str(conf["nonce"]))
            else:
                print("Cancelled.")
                return
            print("OK" if ok else "FAILED")
        except (ValueError, IndexError):
            print("Invalid choice.")


def cmd_login(account: SteamAccount):
    """Login to refresh session tokens."""
    print(f"Account: {account.account_name}")
    print()
    password = ask_password("Password: ")
    if not password:
        print("No password entered. Aborted.")
        return

    print("Logging in...")
    try:
        account.login(password)
        print("Login successful! Session tokens updated in .mafile.")
    except RuntimeError as e:
        if "EMAIL_CODE_REQUIRED" in str(e):
            print("Error: Steam requires an email code. This account uses email-based Steam Guard.")
        else:
            print(f"Error: {e}")
    except Exception as e:
        print(f"Error: {e}")


def cmd_change_password(account: SteamAccount):
    """Change the Steam account password."""
    print(f"Account: {account.account_name}")
    print()

    current_pw = ask_password("Current password: ")
    if not current_pw:
        print("Aborted.")
        return

    new_pw = ask_password("New password: ")
    if not new_pw:
        print("Aborted.")
        return

    confirm_pw = ask_password("Confirm new password: ")
    if new_pw != confirm_pw:
        print("Passwords do not match. Aborted.")
        return

    if len(new_pw) < 7:
        print("Password must be at least 7 characters. Aborted.")
        return

    # Login first to get fresh tokens
    print("\nLogging in first to get fresh session...")
    try:
        account.login(current_pw)
        print("Login OK.")
    except Exception as e:
        print(f"Login failed: {e}")
        return

    print("Changing password...")
    try:
        result = account.change_password(current_pw, new_pw)
    except Exception as e:
        print(f"Error: {e}")
        return

    if result.get("success"):
        print("\nPassword changed successfully!")
        print("All other sessions (including your friend's) are now invalidated.")
        print("Logging in again with new password...")
        try:
            account.login(new_pw)
            print("New session saved to .mafile.")
        except Exception as e:
            print(f"Warning: Re-login failed: {e}")
            print("You may need to run 'python sda.py login' manually.")
    else:
        print(f"Failed to change password: {result}")


def cmd_link_phone(account: SteamAccount, phone_number: str):
    """Link a phone number to the Steam account."""
    print(f"Account: {account.account_name}")
    print(f"Phone:   {phone_number}")
    print()

    # Step 1: Submit phone number
    print("Submitting phone number to Steam...")
    try:
        result = account.add_phone_number(phone_number)
    except Exception as e:
        print(f"Error: {e}")
        return

    if not result.get("success"):
        print(f"Failed: {result}")
        return

    # Step 2: Email confirmation (Steam may require confirming via email first)
    if result.get("showResend") or result.get("state") == "email_verification":
        print("\nSteam sent a confirmation email to the address on this account.")
        print("Please check your email and click the confirmation link.")
        input("Press Enter once you've confirmed the email...")

        print("Checking email confirmation...")
        try:
            for attempt in range(12):
                email_result = account.confirm_phone_email()
                if email_result.get("success"):
                    print("Email confirmed!")
                    break
                print(f"  Waiting... ({attempt + 1}/12)")
                time.sleep(5)
            else:
                print("Timed out waiting for email confirmation.")
                return
        except Exception as e:
            print(f"Error checking email: {e}")
            return

    # Step 3: Enter SMS code
    print("\nSteam is sending an SMS code to your phone...")
    sms_code = input("Enter the SMS code: ").strip()
    if not sms_code:
        print("No code entered. Aborted.")
        return

    print("Verifying SMS code...")
    try:
        verify_result = account.verify_phone_sms(sms_code)
    except Exception as e:
        print(f"Error: {e}")
        return

    if verify_result.get("success"):
        print(f"Phone number {phone_number} linked successfully!")
        print("You can now run 'python sda.py setup' to add Steam Guard.")
    else:
        print(f"SMS verification failed: {verify_result.get('errorText', verify_result)}")


def cmd_setup(account: SteamAccount, directory: str):
    """Add a new Steam Guard authenticator to the account."""
    print(f"Account: {account.account_name}")
    print(f"SteamID: {account.steam_id}")
    print()

    if not account.access_token:
        print("Error: No access token found in .mafile session. Cannot add authenticator.")
        print("You need a valid session — try logging in again first.")
        return

    print("This will add a new Steam Guard Mobile Authenticator.")
    print("Steam will send an SMS code to the phone number linked to this account.")
    print()
    confirm = input("Proceed? (y/n): ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    print("\nRequesting authenticator from Steam...")
    try:
        add_data = account.add_authenticator()
    except Exception as e:
        print(f"Error: {e}")
        return

    status = add_data.get("status")
    if status == 29:
        print("Error: This account already has an authenticator linked.")
        return
    elif status == 84:
        print("Error: Rate limited. Wait a while and try again.")
        return
    elif status != 1:
        print(f"Error: Unexpected status {status}")
        print(f"Response: {add_data}")
        return

    # Save the .mafile immediately — if finalization fails, user still has revocation code
    session_data = {
        "SteamID": account.steam_id,
        "SessionID": account.session_id,
        "SteamLoginSecure": account.steam_login_secure,
        "RefreshToken": account.refresh_token,
        "AccessToken": account.access_token,
    }
    mafile_path = SteamAccount.save_mafile(add_data, session_data, directory)
    print(f"\nNew .mafile saved to: {mafile_path}")
    print(f"Revocation code: {add_data.get('revocation_code', 'N/A')}")
    print("IMPORTANT: Back up this file and revocation code!\n")

    # Finalize with SMS code
    sms_code = input("Enter the SMS code sent to your phone: ").strip()
    if not sms_code:
        print("No SMS code entered. Authenticator is NOT finalized.")
        print("You can re-run setup or use the revocation code to remove it.")
        return

    print("Finalizing authenticator...")
    try:
        result = account.finalize_authenticator(add_data["shared_secret"], sms_code)
    except Exception as e:
        print(f"Error: {e}")
        print("The .mafile was saved. You may need to use the revocation code to clean up.")
        return

    if result.get("success"):
        print("Steam Guard authenticator added and activated successfully!")
        print(f"Your new 2FA codes will work from: {mafile_path}")
    elif result.get("want_more"):
        print("Steam wants another code — the SMS code may have been wrong.")
        print("Try running setup again or use the revocation code to remove and retry.")
    else:
        print(f"Finalization failed: {result}")
        print("The .mafile was saved with the revocation code for cleanup.")


def cmd_remove(account: SteamAccount):
    """Remove Steam Guard authenticator from the account."""
    print(f"Account: {account.account_name}")
    print(f"SteamID: {account.steam_id}")
    print()
    print("WARNING: This will REMOVE the Steam Guard Mobile Authenticator.")
    print("Your account will revert to email-based Steam Guard codes.")
    print("You will have a 15-day trade hold after removal.")
    print()
    confirm = input("Type the account name to confirm removal: ").strip()
    if confirm != account.account_name:
        print("Account name does not match. Aborted.")
        return

    print("Removing authenticator...")
    try:
        result = account.remove_authenticator()
    except Exception as e:
        print(f"Error: {e}")
        return

    if result.get("success"):
        print("Steam Guard authenticator removed successfully.")
        print("Your account now uses email-based Steam Guard.")
    else:
        print(f"Failed to remove authenticator.")
        if result:
            print(f"Response: {result}")


def cmd_info(account: SteamAccount):
    """Display account info."""
    print(f"Account:         {account.account_name}")
    print(f"SteamID:         {account.steam_id}")
    print(f"Serial:          {account.serial_number}")
    print(f"Device ID:       {account.device_id}")
    print(f"Revocation Code: {account.revocation_code}")


def select_account(directory: str, account_name: str | None = None) -> SteamAccount:
    """Find and load an account from .mafile files."""
    mafiles = find_mafiles(directory)
    if not mafiles:
        print(f"No .mafile files found in {os.path.abspath(directory)}")
        sys.exit(1)

    if account_name:
        for mf in mafiles:
            try:
                acct = SteamAccount(mf)
                if acct.account_name.lower() == account_name.lower():
                    return acct
            except Exception:
                continue
        print(f"Account '{account_name}' not found.")
        sys.exit(1)

    if len(mafiles) == 1:
        return SteamAccount(mafiles[0])

    # Multiple accounts — let user pick
    print("Available accounts:")
    accounts = []
    for mf in mafiles:
        try:
            acct = SteamAccount(mf)
            accounts.append(acct)
            print(f"  [{len(accounts)}] {acct.account_name}")
        except Exception as e:
            print(f"  [?] {os.path.basename(mf)} (error: {e})")

    choice = input("\nSelect account: ").strip()
    try:
        return accounts[int(choice) - 1]
    except (ValueError, IndexError):
        print("Invalid choice.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Steam Desktop Authenticator — generate codes & manage confirmations"
    )
    parser.add_argument("-d", "--directory", default=".", help="Directory containing .mafile files")
    parser.add_argument("-a", "--account", help="Account name to use")

    sub = parser.add_subparsers(dest="command")

    # code
    code_parser = sub.add_parser("code", help="Generate a Steam Guard code")
    code_parser.add_argument("-w", "--watch", action="store_true", help="Continuously display code with countdown")

    # confirmations
    sub.add_parser("list", help="List pending confirmations")

    # confirm
    confirm_parser = sub.add_parser("confirm", help="Confirm pending actions")
    confirm_parser.add_argument("--all", action="store_true", dest="confirm_all", help="Confirm all without prompting")

    # deny
    deny_parser = sub.add_parser("deny", help="Deny pending actions")
    deny_parser.add_argument("--all", action="store_true", dest="deny_all", help="Deny all without prompting")

    # login
    sub.add_parser("login", help="Login to refresh session tokens")

    # change-password
    sub.add_parser("change-password", help="Change the account password")

    # link-phone
    phone_parser = sub.add_parser("link-phone", help="Link a phone number to the account")
    phone_parser.add_argument("phone", help="Phone number with country code (e.g. +62 82240708329)")

    # setup (add authenticator)
    sub.add_parser("setup", help="Add a new Steam Guard authenticator to account")

    # remove
    sub.add_parser("remove", help="Remove Steam Guard authenticator from account")

    # info
    sub.add_parser("info", help="Show account info")

    args = parser.parse_args()

    # Default to 'code' if no command given
    if not args.command:
        args.command = "code"

    account = select_account(args.directory, args.account)

    if args.command == "code":
        cmd_code(account, watch=getattr(args, "watch", False))
    elif args.command == "list":
        cmd_confirmations(account)
    elif args.command == "confirm":
        if getattr(args, "confirm_all", False):
            cmd_confirm(account, confirm_all=True, deny=False)
        else:
            cmd_confirm(account)
    elif args.command == "deny":
        if getattr(args, "deny_all", False):
            cmd_confirm(account, confirm_all=True, deny=True)
        else:
            cmd_confirm(account, deny=True)
    elif args.command == "login":
        cmd_login(account)
    elif args.command == "change-password":
        cmd_change_password(account)
    elif args.command == "link-phone":
        cmd_link_phone(account, args.phone)
    elif args.command == "setup":
        cmd_setup(account, args.directory)
    elif args.command == "remove":
        cmd_remove(account)
    elif args.command == "info":
        cmd_info(account)


if __name__ == "__main__":
    main()
