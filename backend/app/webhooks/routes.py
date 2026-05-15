"""Inbound webhooks from third parties (currently: Brevo email events)."""

import hmac
import logging
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from app.models import EmailLog

logger = logging.getLogger(__name__)

webhooks_bp = Blueprint("webhooks", __name__, url_prefix="/api/webhooks")


def _parse_brevo_date(s: str | None) -> datetime | None:
    """Brevo sends ISO 8601 with timezone offset, e.g. '2026-05-15T14:32:01+00:00'."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@webhooks_bp.route("/brevo", methods=["POST"])
def brevo_webhook():
    """Receive transactional email events from Brevo.

    Brevo standard payload (https://developers.brevo.com/docs/transactional-webhooks):
        {
          "event": "delivered" | "hard_bounce" | "soft_bounce" | ...,
          "message-id": "<abcd1234>",
          "date": "2026-05-15T14:32:01+00:00",
          "reason": "...",     # optional, present on bounce/blocked
          ...
        }

    Auth: requires custom header `X-Brevo-Secret` matching env BREVO_WEBHOOK_SECRET.
    Returns 200 even when message-id is unknown (so Brevo doesn't retry forever
    on legacy emails that pre-date this tracker).
    """
    expected = current_app.config.get("BREVO_WEBHOOK_SECRET", "")
    if not expected:
        logger.warning("BREVO_WEBHOOK_SECRET is empty — refusing all webhook calls")
        return jsonify({"error": "webhook not configured"}), 503

    provided = request.headers.get("X-Brevo-Secret", "")
    if not hmac.compare_digest(provided, expected):
        logger.warning("Brevo webhook rejected: bad secret")
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    event = (payload.get("event") or "").lower()
    message_id = payload.get("message-id") or payload.get("messageId")
    event_at = _parse_brevo_date(payload.get("date")) or datetime.now(timezone.utc)
    reason = payload.get("reason")

    if not message_id:
        logger.info("Brevo webhook missing message-id, ignoring: %s", event)
        return jsonify({"status": "ignored", "reason": "no message-id"}), 200

    message_id = message_id.strip().lstrip("<").rstrip(">")

    log = EmailLog.query.filter_by(brevo_message_id=message_id).first()
    if not log:
        logger.info("Brevo webhook for unknown message-id %s (event=%s)", message_id, event)
        return jsonify({"status": "ignored", "reason": "unknown message-id"}), 200

    applied = log.apply_brevo_event(event, event_at, reason)
    return jsonify({"status": "applied" if applied else "skipped", "event": event}), 200
