"""Email blast endpoints: admin moderation + public unsubscribe."""

import logging
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.email_blast.service import (
    count_audience,
    query_audience,
    render_campaign_html,
    resolve_specific_emails,
    run_blast,
    send_test_email,
    verify_guest_unsubscribe_token,
)
from app.extensions import db
from app.jobs import get_current_job, request_cancel, start_job
from app.models import (
    EmailCampaign,
    EmailCampaignRecipient,
    EmailGuestOptOut,
    EmailUnsubscribeToken,
    User,
)

logger = logging.getLogger(__name__)


admin_email_blast_bp = Blueprint(
    "admin_email_blast", __name__, url_prefix="/api/admin/email-blast"
)
unsubscribe_bp = Blueprint("unsubscribe", __name__, url_prefix="/api")


def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user or not user.is_admin:
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_filters(raw: dict | None) -> dict:
    raw = raw or {}
    return {
        "verified_only": bool(raw.get("verified_only")),
        "subscribers_only": bool(raw.get("subscribers_only")),
        "never_purchased": bool(raw.get("never_purchased")),
        "exclude_inactive": bool(raw.get("exclude_inactive")),
    }


def _normalize_audience_mode(raw: str | None) -> str:
    mode = (raw or "filters").strip().lower()
    return mode if mode in ("filters", "specific") else "filters"


def _normalize_target_emails(raw) -> list[str]:
    """Coerce input into a clean list[str]. Accepts list, comma/newline-separated
    string, or None. Caps at 5000 entries to avoid abuse."""
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [e.strip() for e in raw.replace(",", "\n").splitlines()]
    elif isinstance(raw, list):
        items = [str(e).strip() for e in raw]
    else:
        return []
    return [e for e in items if e][:5000]


def _can_modify(campaign: EmailCampaign) -> bool:
    """Drafts are editable; sending/completed campaigns are not."""
    return campaign.status == "draft"


# ---------------------------------------------------------------------------
# Audience preview (count only — fast)
# ---------------------------------------------------------------------------


@admin_email_blast_bp.route("/audience-count", methods=["POST"])
@admin_required
def audience_count():
    data = request.get_json(silent=True) or {}
    mode = _normalize_audience_mode(data.get("audience_mode"))

    if mode == "specific":
        target_emails = _normalize_target_emails(data.get("target_emails"))
        result = resolve_specific_emails(target_emails)
        return jsonify({
            "audience_mode": "specific",
            "count": len(result["matched_users"]) + len(result["guest_emails"]),
            "matched_count": len(result["matched_users"]),
            "guest_count": len(result["guest_emails"]),
            "opted_out_count": len(result["opted_out"]),
            "invalid_count": len(result["invalid"]),
            "opted_out_emails": result["opted_out"][:50],  # cap for UI
            "invalid_entries": result["invalid"][:50],
        }), 200

    filters = _normalize_filters(data.get("filters"))
    return jsonify({
        "audience_mode": "filters",
        "count": count_audience(filters),
        "filters": filters,
    }), 200


# ---------------------------------------------------------------------------
# Campaign CRUD
# ---------------------------------------------------------------------------


@admin_email_blast_bp.route("/campaigns", methods=["GET"])
@admin_required
def list_campaigns():
    items = (
        EmailCampaign.query.order_by(EmailCampaign.created_at.desc()).all()
    )
    return jsonify({"items": [c.to_dict() for c in items]}), 200


@admin_email_blast_bp.route("/campaigns", methods=["POST"])
@admin_required
def create_campaign():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    subject = (data.get("subject") or "").strip()
    body_markdown = data.get("body_markdown") or ""
    filters = _normalize_filters(data.get("filters"))
    audience_mode = _normalize_audience_mode(data.get("audience_mode"))
    target_emails = _normalize_target_emails(data.get("target_emails"))

    if not subject:
        return jsonify({"error": "Subject tidak boleh kosong"}), 400

    campaign = EmailCampaign(
        subject=subject,
        body_markdown=body_markdown,
        filters_json=filters,
        audience_mode=audience_mode,
        target_emails=target_emails or None,
        status="draft",
        created_by_user_id=user_id,
    )
    db.session.add(campaign)
    db.session.commit()
    return jsonify({"campaign": campaign.to_dict(include_body=True)}), 201


@admin_email_blast_bp.route("/campaigns/<int:campaign_id>", methods=["GET"])
@admin_required
def get_campaign(campaign_id: int):
    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    show_recipients = (request.args.get("recipients") or "").lower() in ("1", "true", "yes")
    data = campaign.to_dict(include_body=True)
    if show_recipients:
        data["recipients"] = [
            {
                **r.to_dict(),
                "user_email": r.email,
            }
            for r in campaign.recipients.order_by(
                EmailCampaignRecipient.id.asc()
            ).all()
        ]
    return jsonify({"campaign": data}), 200


@admin_email_blast_bp.route("/campaigns/<int:campaign_id>", methods=["PUT"])
@admin_required
def update_campaign(campaign_id: int):
    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404
    if not _can_modify(campaign):
        return jsonify({"error": "Campaign sudah dikirim, tidak bisa diubah"}), 400

    data = request.get_json(silent=True) or {}
    if "subject" in data:
        subject = (data.get("subject") or "").strip()
        if not subject:
            return jsonify({"error": "Subject tidak boleh kosong"}), 400
        campaign.subject = subject
    if "body_markdown" in data:
        campaign.body_markdown = data.get("body_markdown") or ""
    if "filters" in data:
        campaign.filters_json = _normalize_filters(data.get("filters"))
    if "audience_mode" in data:
        campaign.audience_mode = _normalize_audience_mode(data.get("audience_mode"))
    if "target_emails" in data:
        emails = _normalize_target_emails(data.get("target_emails"))
        campaign.target_emails = emails or None

    db.session.commit()
    return jsonify({"campaign": campaign.to_dict(include_body=True)}), 200


@admin_email_blast_bp.route("/campaigns/<int:campaign_id>", methods=["DELETE"])
@admin_required
def delete_campaign(campaign_id: int):
    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404
    if not _can_modify(campaign):
        return jsonify({"error": "Campaign sudah dikirim, tidak bisa dihapus"}), 400
    db.session.delete(campaign)
    db.session.commit()
    return jsonify({"message": "Draft dihapus"}), 200


# ---------------------------------------------------------------------------
# Test send (to current admin's email)
# ---------------------------------------------------------------------------


@admin_email_blast_bp.route("/campaigns/<int:campaign_id>/send-test", methods=["POST"])
@admin_required
def send_test(campaign_id: int):
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Admin user not found"}), 404

    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404

    if not (campaign.subject or "").strip():
        return jsonify({"error": "Subject masih kosong"}), 400

    smtp_config = {
        "SMTP_HOST": current_app.config["SMTP_HOST"],
        "SMTP_PORT": current_app.config["SMTP_PORT"],
        "SMTP_USER": current_app.config["SMTP_USER"],
        "SMTP_PASSWORD": current_app.config["SMTP_PASSWORD"],
        "MAIL_SENDER": current_app.config["MAIL_SENDER"],
    }
    frontend_url = current_app.config.get("FRONTEND_URL", "")

    try:
        send_test_email(
            smtp_config=smtp_config,
            frontend_url=frontend_url,
            to_email=user.email,
            subject=campaign.subject,
            body_markdown=campaign.body_markdown or "",
            user_id=user.id,
        )
    except Exception as e:
        logger.exception("Test send failed")
        return jsonify({"error": f"Gagal kirim test: {e}"}), 502

    return jsonify({"message": f"Test email terkirim ke {user.email}"}), 200


# ---------------------------------------------------------------------------
# HTML preview (server-side rendered) — useful for in-app preview pane
# ---------------------------------------------------------------------------


@admin_email_blast_bp.route("/preview", methods=["POST"])
@admin_required
def preview():
    data = request.get_json(silent=True) or {}
    body_markdown = data.get("body_markdown") or ""
    frontend_url = current_app.config.get("FRONTEND_URL", "")
    sample_url = f"{(frontend_url or '').rstrip('/')}/unsubscribe/sample-token"
    html = render_campaign_html(body_markdown, sample_url)
    return jsonify({"html": html}), 200


# ---------------------------------------------------------------------------
# Send blast (queue recipients + start background job)
# ---------------------------------------------------------------------------


@admin_email_blast_bp.route("/campaigns/<int:campaign_id>/send", methods=["POST"])
@admin_required
def send_blast(campaign_id: int):
    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        return jsonify({"error": "Campaign not found"}), 404
    if campaign.status != "draft":
        return jsonify({"error": f"Campaign sudah berstatus {campaign.status}"}), 400

    if not (campaign.subject or "").strip():
        return jsonify({"error": "Subject masih kosong"}), 400
    if not (campaign.body_markdown or "").strip():
        return jsonify({"error": "Body email masih kosong"}), 400

    # Snapshot the audience NOW (so opt-outs that happen after send-time but
    # before a slow job processes them are still respected at iteration time
    # via the per-row check).
    audience_mode = campaign.audience_mode or "filters"

    if audience_mode == "specific":
        target_emails = campaign.target_emails or []
        resolved = resolve_specific_emails(target_emails)
        matched_users = resolved["matched_users"]
        guest_emails = resolved["guest_emails"]
        recipients_count = len(matched_users) + len(guest_emails)

        if recipients_count == 0:
            return jsonify({
                "error": "Audience kosong — tidak ada email valid yang akan dikirim"
            }), 400
    else:
        filters = campaign.filters_json or {}
        matched_users = query_audience(filters).all()
        guest_emails = []
        recipients_count = len(matched_users)

        if recipients_count == 0:
            return jsonify({
                "error": "Audience kosong — tidak ada penerima yang cocok"
            }), 400

    # Block if a job is already running
    current = get_current_job()
    if current and current.get("status") == "running":
        return jsonify({
            "error": f"Job lain sedang berjalan ({current.get('job_type')}). Selesaikan dulu."
        }), 409

    # Wipe any previous recipients (re-queue from scratch) and re-create
    EmailCampaignRecipient.query.filter_by(campaign_id=campaign_id).delete()
    for u in matched_users:
        rec = EmailCampaignRecipient(
            campaign_id=campaign_id,
            user_id=u.id,
            email=u.email,
            status="pending",
        )
        db.session.add(rec)
    for email in guest_emails:
        rec = EmailCampaignRecipient(
            campaign_id=campaign_id,
            user_id=None,
            email=email,
            status="pending",
        )
        db.session.add(rec)

    campaign.total_recipients = recipients_count
    campaign.sent_count = 0
    campaign.failed_count = 0
    campaign.status = "draft"  # worker flips to 'sending' once it starts
    db.session.commit()

    job = start_job(
        "email_blast",
        run_blast,
        args=(campaign_id,),
        total=recipients_count,
    )
    if job is None:
        return jsonify({"error": "Gagal memulai job"}), 500

    return jsonify({
        "message": f"Blast dimulai untuk {recipients_count} penerima",
        "campaign": campaign.to_dict(),
        "job": job,
    }), 202


@admin_email_blast_bp.route("/cancel", methods=["POST"])
@admin_required
def cancel():
    ok = request_cancel()
    if not ok:
        return jsonify({"error": "Tidak ada job yang berjalan"}), 400
    return jsonify({"message": "Cancel diminta. Job akan berhenti setelah email saat ini."}), 200


# ---------------------------------------------------------------------------
# Public unsubscribe
# ---------------------------------------------------------------------------


@unsubscribe_bp.route("/unsubscribe/<token>", methods=["GET", "POST"])
def unsubscribe(token: str):
    """One-click unsubscribe. Marks the user as opted-out.
    Idempotent: hitting twice is fine.
    """
    if not token or len(token) > 200:
        return jsonify({"error": "Token tidak valid"}), 400

    tok = EmailUnsubscribeToken.query.filter_by(token=token).first()
    if not tok:
        return jsonify({"error": "Token tidak ditemukan"}), 404

    user = db.session.get(User, tok.user_id)
    if not user:
        return jsonify({"error": "User tidak ditemukan"}), 404

    if not user.email_opted_out:
        user.email_opted_out = True
        db.session.commit()

    return jsonify({
        "message": "Kamu sudah berhasil unsubscribe dari email promo Playfast.",
        "email": user.email,
    }), 200


@unsubscribe_bp.route("/unsubscribe-guest/<token>", methods=["GET", "POST"])
def unsubscribe_guest(token: str):
    """Unsubscribe path for non-registered emails. The token is a self-
    contained HMAC of the email — no DB row required to issue it. Verifying
    succeeds → upsert into EmailGuestOptOut so future blasts skip this email.
    """
    if not token or len(token) > 500:
        return jsonify({"error": "Token tidak valid"}), 400

    secret = current_app.config.get("SECRET_KEY") or "playfast-fallback-secret"
    email = verify_guest_unsubscribe_token(token, secret)
    if not email:
        return jsonify({"error": "Token tidak valid atau sudah kadaluarsa"}), 400

    existing = EmailGuestOptOut.query.filter_by(email=email).first()
    if not existing:
        db.session.add(EmailGuestOptOut(email=email))
        db.session.commit()

    return jsonify({
        "message": "Kamu sudah berhasil unsubscribe dari email promo Playfast.",
        "email": email,
    }), 200
