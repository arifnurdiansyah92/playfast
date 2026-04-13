"""Email service using SMTP (Brevo / any provider)."""

import logging
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app

logger = logging.getLogger(__name__)


def _send_async(app_config: dict, to: str, subject: str, html: str):
    """Send email in a background thread to avoid blocking the request."""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = app_config["MAIL_SENDER"]
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(app_config["SMTP_HOST"], app_config["SMTP_PORT"]) as server:
            server.starttls()
            server.login(app_config["SMTP_USER"], app_config["SMTP_PASSWORD"])
            server.sendmail(app_config["MAIL_SENDER"], to, msg.as_string())

        logger.info("Email sent to %s: %s", to, subject)
    except Exception:
        logger.exception("Failed to send email to %s", to)


def send_email(to: str, subject: str, html: str):
    """Queue an email to be sent asynchronously."""
    config = {
        "SMTP_HOST": current_app.config["SMTP_HOST"],
        "SMTP_PORT": current_app.config["SMTP_PORT"],
        "SMTP_USER": current_app.config["SMTP_USER"],
        "SMTP_PASSWORD": current_app.config["SMTP_PASSWORD"],
        "MAIL_SENDER": current_app.config["MAIL_SENDER"],
    }
    thread = threading.Thread(target=_send_async, args=(config, to, subject, html))
    thread.daemon = True
    thread.start()


def send_password_reset_email(to: str, reset_url: str):
    """Send a password reset email."""
    html = f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h2 style="color: #c9a84c; margin: 0;">Playfast</h2>
      </div>
      <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 32px;">
        <h3 style="color: #fff; margin: 0 0 16px;">Reset Password</h3>
        <p style="color: #aaa; line-height: 1.6; margin: 0 0 24px;">
          Kamu meminta untuk mereset password akun Playfast. Klik tombol di bawah untuk membuat password baru.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{reset_url}" style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
          Link ini berlaku selama 24 jam. Jika kamu tidak meminta reset password, abaikan email ini.
        </p>
      </div>
      <p style="color: #555; font-size: 12px; text-align: center; margin-top: 24px;">
        &copy; Playfast. Email ini dikirim otomatis, jangan balas email ini.
      </p>
    </div>
    """
    send_email(to, "Reset Password - Playfast", html)


def send_verification_email(to: str, verify_url: str):
    """Send an email verification email."""
    html = f"""\
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h2 style="color: #c9a84c; margin: 0;">Playfast</h2>
      </div>
      <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 32px;">
        <h3 style="color: #fff; margin: 0 0 16px;">Verifikasi Email</h3>
        <p style="color: #aaa; line-height: 1.6; margin: 0 0 24px;">
          Terima kasih telah mendaftar di Playfast! Klik tombol di bawah untuk memverifikasi alamat email kamu.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{verify_url}" style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px;">
            Verifikasi Email
          </a>
        </div>
        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
          Link ini berlaku selama 24 jam. Jika kamu tidak mendaftar di Playfast, abaikan email ini.
        </p>
      </div>
      <p style="color: #555; font-size: 12px; text-align: center; margin-top: 24px;">
        &copy; Playfast. Email ini dikirim otomatis, jangan balas email ini.
      </p>
    </div>
    """
    send_email(to, "Verifikasi Email - Playfast", html)
