"""Email blast service: audience filtering, markdown rendering, send worker."""

import logging
import smtplib
import time
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import markdown as md_lib
from sqlalchemy import and_, exists, not_, or_

from app.email_service import LOGO_URL, SITE_URL
from app.extensions import db
from app.models import (
    EmailCampaign,
    EmailCampaignRecipient,
    EmailUnsubscribeToken,
    Order,
    Subscription,
    User,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Audience query
# ---------------------------------------------------------------------------


def query_audience(filters: dict):
    """Build the User query for a campaign's audience filters.

    Filters (all optional booleans, default False):
      - verified_only: only users with email_verified=True
      - subscribers_only: only users with an active subscription right now
      - never_purchased: only users with zero fulfilled orders
      - exclude_inactive: drop users where is_active=False

    Always excludes users with email_opted_out=True.
    """
    q = User.query.filter(User.email_opted_out == False)  # noqa: E712

    if filters.get("verified_only"):
        q = q.filter(User.email_verified == True)  # noqa: E712

    if filters.get("exclude_inactive"):
        q = q.filter(User.is_active == True)  # noqa: E712

    if filters.get("subscribers_only"):
        now = datetime.now(timezone.utc)
        q = q.filter(
            exists().where(
                and_(
                    Subscription.user_id == User.id,
                    Subscription.status == "active",
                    or_(
                        Subscription.expires_at == None,  # noqa: E711
                        Subscription.expires_at > now,
                    ),
                )
            )
        )

    if filters.get("never_purchased"):
        q = q.filter(
            not_(
                exists().where(
                    and_(
                        Order.user_id == User.id,
                        Order.status == "fulfilled",
                    )
                )
            )
        )

    return q


def count_audience(filters: dict) -> int:
    return query_audience(filters).count()


# ---------------------------------------------------------------------------
# Markdown -> HTML rendering, wrapped in branded shell
# ---------------------------------------------------------------------------


def _render_markdown(text: str) -> str:
    """Render user-supplied markdown to a constrained HTML fragment.
    Headings, paragraphs, lists, links, bold/italic, blockquotes, code.
    No raw HTML passthrough (markdown.extensions.extra handles that safely
    enough for our admin-authored use case).
    """
    return md_lib.markdown(
        text,
        extensions=["extra", "nl2br", "sane_lists"],
        output_format="html5",
    )


def _styled_body_fragment(html_fragment: str) -> str:
    """Wrap rendered markdown in inline-styled paragraph/heading defaults so
    it looks consistent inside the dark email shell. Most clients ignore CSS
    blocks, so we inline everything via a wrapping div with overrides.
    """
    return (
        '<div style="padding: 32px; color: #d8dee6; font-size: 14px; line-height: 1.7;">'
        + '<style>'
        + '.pf-body h1{color:#fff;font-size:22px;margin:0 0 16px;line-height:1.3;font-weight:700;}'
        + '.pf-body h2{color:#fff;font-size:18px;margin:24px 0 12px;font-weight:700;}'
        + '.pf-body h3{color:#fff;font-size:16px;margin:20px 0 10px;font-weight:700;}'
        + '.pf-body p{margin:0 0 14px;color:#c8d0d8;}'
        + '.pf-body a{color:#c9a84c;text-decoration:underline;}'
        + '.pf-body strong{color:#fff;}'
        + '.pf-body ul,.pf-body ol{margin:0 0 14px;padding-left:20px;color:#c8d0d8;}'
        + '.pf-body li{margin:0 0 6px;}'
        + '.pf-body blockquote{border-left:3px solid #c9a84c;padding:4px 14px;margin:0 0 14px;color:#a8b0bc;background:rgba(201,168,76,0.08);}'
        + '.pf-body code{background:#0f0f1a;padding:2px 6px;border-radius:4px;color:#c9a84c;font-size:13px;}'
        + '.pf-body hr{border:none;border-top:1px solid #2a2a4a;margin:24px 0;}'
        + '</style>'
        + '<div class="pf-body">'
        + html_fragment
        + '</div>'
        + '</div>'
    )


def render_campaign_html(body_markdown: str, unsubscribe_url: str) -> str:
    """Render the full HTML email: branded shell + markdown body + unsubscribe footer."""
    body_html = _render_markdown(body_markdown)
    inner = _styled_body_fragment(body_html)
    return f"""\
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="{SITE_URL}" style="text-decoration: none;">
        <img src="{LOGO_URL}" alt="Playfast" width="160" style="display: inline-block; max-width: 160px; height: auto;" />
      </a>
    </div>

    <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; overflow: hidden;">
      {inner}
    </div>

    <div style="text-align: center; padding: 24px 0 0;">
      <p style="color: #555; font-size: 12px; line-height: 1.5; margin: 0 0 8px;">
        &copy; 2026 Playfast &middot; Akses game Steam instan &amp; terjangkau
      </p>
      <p style="color: #444; font-size: 11px; margin: 0 0 8px;">
        Kamu menerima email ini karena terdaftar di Playfast.
      </p>
      <p style="color: #444; font-size: 11px; margin: 0;">
        <a href="{unsubscribe_url}" style="color: #666; text-decoration: underline;">Berhenti berlangganan email promo</a>
      </p>
    </div>

  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Single-message SMTP send (synchronous — used by the worker)
# ---------------------------------------------------------------------------


def _send_one(smtp_config: dict, to: str, subject: str, html: str):
    msg = MIMEMultipart("alternative")
    msg["From"] = smtp_config["MAIL_SENDER"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_config["SMTP_HOST"], smtp_config["SMTP_PORT"]) as server:
        server.starttls()
        server.login(smtp_config["SMTP_USER"], smtp_config["SMTP_PASSWORD"])
        server.sendmail(smtp_config["MAIL_SENDER"], to, msg.as_string())


def _build_unsubscribe_url(token: str, frontend_url: str) -> str:
    base = (frontend_url or SITE_URL).rstrip("/")
    return f"{base}/unsubscribe/{token}"


# ---------------------------------------------------------------------------
# Test-send (single recipient, no campaign row)
# ---------------------------------------------------------------------------


def send_test_email(
    smtp_config: dict,
    frontend_url: str,
    to_email: str,
    subject: str,
    body_markdown: str,
    user_id: int | None = None,
):
    """Send one test email to the given address. If user_id is provided, uses
    that user's stable unsubscribe token; otherwise a placeholder.
    """
    token = "test-token-placeholder"
    if user_id is not None:
        tok_obj = EmailUnsubscribeToken.get_or_create_for_user(user_id)
        db.session.commit()
        token = tok_obj.token

    unsubscribe_url = _build_unsubscribe_url(token, frontend_url)
    html = render_campaign_html(body_markdown, unsubscribe_url)
    _send_one(smtp_config, to_email, f"[TEST] {subject}", html)


# ---------------------------------------------------------------------------
# Blast worker (background job target)
# ---------------------------------------------------------------------------


def run_blast(progress, campaign_id: int):
    """Background worker target. Sends a queued campaign one recipient at a
    time, updating EmailCampaignRecipient rows + campaign aggregates as it
    goes. Honors progress.cancelled between sends.

    Runs inside the app context already pushed by the job runner.
    """
    from flask import current_app
    smtp_config = {
        "SMTP_HOST": current_app.config["SMTP_HOST"],
        "SMTP_PORT": current_app.config["SMTP_PORT"],
        "SMTP_USER": current_app.config["SMTP_USER"],
        "SMTP_PASSWORD": current_app.config["SMTP_PASSWORD"],
        "MAIL_SENDER": current_app.config["MAIL_SENDER"],
    }
    frontend_url = current_app.config.get("FRONTEND_URL", SITE_URL)

    campaign = db.session.get(EmailCampaign, campaign_id)
    if not campaign:
        progress.message = f"Campaign {campaign_id} not found"
        return

    campaign.status = "sending"
    campaign.started_at = datetime.now(timezone.utc)
    db.session.commit()

    pending = (
        EmailCampaignRecipient.query
        .filter_by(campaign_id=campaign_id, status="pending")
        .order_by(EmailCampaignRecipient.id.asc())
        .all()
    )
    total = len(pending)
    progress.reset_total(total)

    processed = 0

    for rec in pending:
        if progress.cancelled:
            progress.message = f"Dibatalkan setelah {processed}/{total}"
            break

        user = db.session.get(User, rec.user_id)
        if not user or user.email_opted_out or not user.is_active:
            rec.status = "failed"
            rec.error = "Recipient unsubscribed or inactive at send time"
            rec.sent_at = datetime.now(timezone.utc)
        else:
            tok_obj = EmailUnsubscribeToken.get_or_create_for_user(user.id)
            db.session.commit()
            unsubscribe_url = _build_unsubscribe_url(tok_obj.token, frontend_url)
            html = render_campaign_html(campaign.body_markdown, unsubscribe_url)

            try:
                _send_one(smtp_config, rec.email, campaign.subject, html)
                rec.status = "sent"
                rec.sent_at = datetime.now(timezone.utc)
                rec.error = None
            except Exception as e:
                logger.exception("Blast send failed for %s", rec.email)
                rec.status = "failed"
                rec.error = str(e)[:500]
                rec.sent_at = datetime.now(timezone.utc)

        # Recompute aggregate counts from DB (correct under retries / re-runs)
        campaign.sent_count = (
            EmailCampaignRecipient.query
            .filter_by(campaign_id=campaign_id, status="sent")
            .count()
        )
        campaign.failed_count = (
            EmailCampaignRecipient.query
            .filter_by(campaign_id=campaign_id, status="failed")
            .count()
        )
        db.session.commit()

        processed += 1
        progress.processed = processed
        progress.message = (
            f"Mengirim {processed}/{total} "
            f"(sukses: {campaign.sent_count}, gagal: {campaign.failed_count})"
        )

        # Gentle pacing so SMTP / Brevo doesn't throttle us.
        time.sleep(0.4)

    campaign.finished_at = datetime.now(timezone.utc)
    if progress.cancelled:
        campaign.status = "cancelled"
    else:
        campaign.status = "completed"
    db.session.commit()
