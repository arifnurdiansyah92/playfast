"""Steam Guard code generator and confirmation handler using .mafile data."""

import base64
import hashlib
import hmac
import struct
import time

STEAM_ALPHABET = "23456789BCDFGHJKMNPQRTVWXY"


def generate_steam_guard_code(shared_secret: str, timestamp: int | None = None) -> str:
    """Generate a Steam Guard 2FA code from the shared_secret."""
    if timestamp is None:
        timestamp = int(time.time())

    time_step = timestamp // 30
    time_bytes = struct.pack(">Q", time_step)

    secret = base64.b64decode(shared_secret)
    mac = hmac.new(secret, time_bytes, hashlib.sha1).digest()

    offset = mac[-1] & 0x0F
    code_int = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF

    code = ""
    for _ in range(5):
        code += STEAM_ALPHABET[code_int % len(STEAM_ALPHABET)]
        code_int //= len(STEAM_ALPHABET)

    return code


def code_time_remaining(timestamp: int | None = None) -> int:
    """Seconds until the current code expires."""
    if timestamp is None:
        timestamp = int(time.time())
    return 30 - (timestamp % 30)


def generate_confirmation_hash(identity_secret: str, tag: str, timestamp: int | None = None) -> str:
    """Generate a confirmation hash for Steam trade confirmations."""
    if timestamp is None:
        timestamp = int(time.time())

    secret = base64.b64decode(identity_secret)
    msg = struct.pack(">Q", timestamp) + tag.encode("utf-8")
    mac = hmac.new(secret, msg, hashlib.sha1).digest()
    return base64.b64encode(mac).decode("utf-8")


def build_confirmation_params(identity_secret: str, device_id: str, steam_id: str, tag: str, timestamp: int | None = None) -> dict:
    """Build the query parameters needed for the confirmations endpoint."""
    if timestamp is None:
        timestamp = int(time.time())

    return {
        "p": device_id,
        "a": steam_id,
        "k": generate_confirmation_hash(identity_secret, tag, timestamp),
        "t": str(timestamp),
        "m": "react",
        "tag": tag,
    }
