"""Tripay payment gateway integration.

Tripay (https://tripay.co.id) is an Indonesian payment aggregator that
fronts the usual mix of QRIS / VA / e-wallet rails behind one merchant
account. We wire it as a third payment_mode alongside `manual` and the
existing Midtrans options.

Flow:
    1. Backend creates a closed transaction via POST /transaction/create.
       Tripay returns a `checkout_url`.
    2. Frontend redirects user to that URL.
    3. After payment Tripay POSTs a callback to our webhook (signed
       with HMAC-SHA256 of the raw body using the merchant's private
       key). We verify, mark the order/sub paid, and fulfill.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

import requests

from app.models import SiteSetting

logger = logging.getLogger(__name__)

PRODUCTION_BASE = "https://tripay.co.id/api"
SANDBOX_BASE = "https://tripay.co.id/api-sandbox"

# Tripay-side statuses we care about. Anything else is logged and ignored.
STATUS_PAID = "PAID"
STATUS_UNPAID = "UNPAID"
STATUS_EXPIRED = "EXPIRED"
STATUS_FAILED = "FAILED"
STATUS_REFUND = "REFUND"


# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------


def _is_production() -> bool:
    return (SiteSetting.get("tripay_is_production") or "false").lower() == "true"


def _base_url() -> str:
    return PRODUCTION_BASE if _is_production() else SANDBOX_BASE


def _credentials() -> dict[str, str]:
    """Return active credential set as a dict — picks sandbox/prod based on
    the toggle. Falls back to empty strings (callers must guard)."""
    prefix = "tripay_production" if _is_production() else "tripay_sandbox"
    return {
        "api_key": SiteSetting.get(f"{prefix}_api_key") or "",
        "private_key": SiteSetting.get(f"{prefix}_private_key") or "",
        "merchant_code": SiteSetting.get(f"{prefix}_merchant_code") or "",
    }


def is_configured() -> bool:
    """True only when the active credential set has all three values set —
    used by the create-transaction path to fail fast with a 503 instead of
    forwarding garbage to Tripay."""
    creds = _credentials()
    return all(creds.get(k) for k in ("api_key", "private_key", "merchant_code"))


def default_method() -> str:
    return SiteSetting.get("tripay_payment_method") or "QRIS2"


# ---------------------------------------------------------------------------
# Signature helpers
# ---------------------------------------------------------------------------


def _hmac_sha256(message: str, key: str) -> str:
    return hmac.new(key.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def transaction_signature(merchant_ref: str, amount: int) -> str:
    """Sign the create-transaction payload: HMAC-SHA256 of
    `merchant_code + merchant_ref + amount` using the private key."""
    creds = _credentials()
    return _hmac_sha256(
        f"{creds['merchant_code']}{merchant_ref}{int(amount)}",
        creds["private_key"],
    )


def verify_callback_signature(raw_body: bytes, header_signature: str) -> bool:
    """Verify the callback came from Tripay.

    Per Tripay docs the callback's `X-Callback-Signature` header is
    HMAC-SHA256 of the raw request body using the merchant's private key.
    Always read the raw body before Flask parses JSON — string-shifting
    breaks the signature.
    """
    creds = _credentials()
    if not creds["private_key"]:
        return False
    expected = _hmac_sha256(raw_body.decode("utf-8", errors="replace"), creds["private_key"])
    return hmac.compare_digest(expected, header_signature or "")


# ---------------------------------------------------------------------------
# API calls
# ---------------------------------------------------------------------------


def create_transaction(
    *,
    merchant_ref: str,
    amount: int,
    customer_email: str,
    customer_name: str,
    item_name: str,
    callback_url: str,
    return_url: str,
    expired_in_seconds: int = 60 * 60,  # 1 hour default
) -> dict[str, Any]:
    """Create a closed transaction and return Tripay's response payload.

    The caller is expected to persist `reference` (Tripay's id) onto the
    order/subscription so the callback handler can match it back. The
    `checkout_url` returned points the user at Tripay's hosted page.

    Raises a `RuntimeError` on transport errors or non-success responses
    so the caller can return a 502 to the user.
    """
    creds = _credentials()
    payload = {
        "method": default_method(),
        "merchant_ref": merchant_ref,
        "amount": int(amount),
        "customer_name": customer_name or "Customer",
        "customer_email": customer_email or "support@playfast.id",
        "order_items": [
            {"name": item_name, "price": int(amount), "quantity": 1},
        ],
        "callback_url": callback_url,
        "return_url": return_url,
        "expired_time": int(time.time()) + int(expired_in_seconds),
        "signature": transaction_signature(merchant_ref, amount),
    }
    headers = {"Authorization": f"Bearer {creds['api_key']}"}
    url = f"{_base_url()}/transaction/create"

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
    except requests.RequestException as e:
        logger.exception("Tripay transport error: %s", e)
        raise RuntimeError("Tripay unreachable") from e

    try:
        body = resp.json()
    except ValueError:
        logger.error("Tripay non-JSON response %s: %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Tripay bad response ({resp.status_code})")

    if not body.get("success"):
        # Tripay's `message` is human-readable; their `errors` field (when
        # present) carries field-level validation details. Surface whichever
        # has more signal so the admin can fix config quickly.
        msg = body.get("message")
        errs = body.get("errors") or body.get("data")
        if errs and isinstance(errs, (dict, list)) and not msg:
            msg = str(errs)
        logger.error(
            "Tripay create failed (status=%s method=%s ref=%s amount=%s): %s",
            resp.status_code, payload["method"], merchant_ref, amount, body,
        )
        raise RuntimeError(msg or f"create rejected (HTTP {resp.status_code})")

    data = body.get("data") or {}
    if not data.get("checkout_url"):
        logger.error("Tripay missing checkout_url: %s", body)
        raise RuntimeError("response missing checkout_url")

    return data
