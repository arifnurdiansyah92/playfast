"""Email service using SMTP (Brevo / any provider)."""

import logging
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app

logger = logging.getLogger(__name__)

LOGO_URL = "https://playfast.id/images/brand/logo-horizontal.png"
SITE_URL = "https://playfast.id"


def _base_template(content: str) -> str:
    """Wrap email content in a consistent branded template."""
    return f"""\
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="{SITE_URL}" style="text-decoration: none;">
        <img src="{LOGO_URL}" alt="Playfast" width="160" style="display: inline-block; max-width: 160px; height: auto;" />
      </a>
    </div>

    <!-- Card -->
    <div style="background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; overflow: hidden;">
      {content}
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0 0;">
      <p style="color: #555; font-size: 12px; line-height: 1.5; margin: 0 0 8px;">
        &copy; 2026 Playfast &middot; Akses game Steam instan &amp; terjangkau
      </p>
      <p style="color: #444; font-size: 11px; margin: 0;">
        Email ini dikirim otomatis. Jangan balas email ini.
      </p>
    </div>

  </div>
</body>
</html>"""


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


# ---------------------------------------------------------------------------
# Email: Password Reset
# ---------------------------------------------------------------------------

def send_password_reset_email(to: str, reset_url: str):
    """Send a password reset email."""
    content = f"""\
      <!-- Icon bar -->
      <div style="background: linear-gradient(135deg, #c9a84c 0%, #a88a2e 100%); padding: 24px; text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.15); display: inline-flex; align-items: center; justify-content: center; margin: 0 auto;">
          <span style="font-size: 28px;">&#128274;</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">
        <h2 style="color: #ffffff; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Reset Password Kamu</h2>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
          Kami menerima permintaan untuk mereset password akun Playfast kamu.
          Klik tombol di bawah untuk membuat password baru.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="{reset_url}"
             style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;
                    letter-spacing: 0.3px;">
            Reset Password
          </a>
        </div>

        <!-- Fallback link -->
        <p style="color: #555; font-size: 12px; line-height: 1.5; margin: 0 0 20px; word-break: break-all;">
          Tombol tidak berfungsi? Salin link ini ke browser:<br>
          <a href="{reset_url}" style="color: #c9a84c; text-decoration: none;">{reset_url}</a>
        </p>

        <!-- Separator -->
        <div style="border-top: 1px solid #2a2a4a; margin: 20px 0;"></div>

        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0;">
          Link berlaku selama <strong style="color: #8f98a0;">24 jam</strong>.
          Jika kamu tidak meminta reset password, abaikan email ini &mdash; akunmu tetap aman.
        </p>
      </div>"""

    send_email(to, "Reset Password - Playfast", _base_template(content))


# ---------------------------------------------------------------------------
# Email: Email Verification
# ---------------------------------------------------------------------------

def send_verification_email(to: str, verify_url: str):
    """Send an email verification email after registration."""
    content = f"""\
      <!-- Icon bar -->
      <div style="background: linear-gradient(135deg, #c9a84c 0%, #a88a2e 100%); padding: 24px; text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.15); display: inline-flex; align-items: center; justify-content: center; margin: 0 auto;">
          <span style="font-size: 28px;">&#9989;</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">
        <h2 style="color: #ffffff; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Selamat Datang di Playfast!</h2>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">
          Terima kasih sudah mendaftar. Satu langkah lagi &mdash; verifikasi email kamu untuk mulai menjelajahi ratusan game Steam dengan harga terjangkau.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="{verify_url}"
             style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;
                    letter-spacing: 0.3px;">
            Verifikasi Email
          </a>
        </div>

        <!-- Fallback link -->
        <p style="color: #555; font-size: 12px; line-height: 1.5; margin: 0 0 20px; word-break: break-all;">
          Tombol tidak berfungsi? Salin link ini ke browser:<br>
          <a href="{verify_url}" style="color: #c9a84c; text-decoration: none;">{verify_url}</a>
        </p>

        <!-- Separator -->
        <div style="border-top: 1px solid #2a2a4a; margin: 20px 0;"></div>

        <!-- What's next -->
        <p style="color: #888; font-size: 13px; font-weight: 600; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">Setelah verifikasi:</p>
        <table style="width: 100%; border-spacing: 0;">
          <tr>
            <td style="color: #c9a84c; font-size: 18px; padding: 4px 12px 4px 0; vertical-align: top; width: 32px;">&#127918;</td>
            <td style="color: #8f98a0; font-size: 13px; line-height: 1.5; padding: 4px 0;">Jelajahi katalog game &mdash; dari indie hingga AAA</td>
          </tr>
          <tr>
            <td style="color: #c9a84c; font-size: 18px; padding: 4px 12px 4px 0; vertical-align: top;">&#9889;</td>
            <td style="color: #8f98a0; font-size: 13px; line-height: 1.5; padding: 4px 0;">Beli &amp; langsung dapat kredensial Steam</td>
          </tr>
          <tr>
            <td style="color: #c9a84c; font-size: 18px; padding: 4px 12px 4px 0; vertical-align: top;">&#128272;</td>
            <td style="color: #8f98a0; font-size: 13px; line-height: 1.5; padding: 4px 0;">Kode Steam Guard otomatis, tanpa ribet</td>
          </tr>
        </table>

        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 20px 0 0;">
          Link berlaku selama <strong style="color: #8f98a0;">24 jam</strong>.
          Jika kamu tidak mendaftar di Playfast, abaikan email ini.
        </p>
      </div>"""

    send_email(to, "Verifikasi Email - Playfast", _base_template(content))
