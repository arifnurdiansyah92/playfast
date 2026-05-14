"""Email service using SMTP (Brevo / any provider)."""

import logging
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app

logger = logging.getLogger(__name__)

LOGO_URL = "https://playfast.id/images/brand/logo-horizontal.png"
ICON_URL = "https://playfast.id/images/brand/icon.png"
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


# ---------------------------------------------------------------------------
# Email: Game Request Fulfilled
# ---------------------------------------------------------------------------

def send_game_request_fulfilled_email(
    to: str, game_name: str, game_url: str, header_image: str | None = None
):
    """Notify a voter that the game they requested is now in the catalog."""
    image_html = (
        f'<img src="{header_image}" alt="{game_name}" '
        f'style="width: 100%; height: auto; display: block;" />'
        if header_image
        else ""
    )
    content = f"""\
      {image_html}

      <!-- Body -->
      <div style="padding: 32px;">
        <h2 style="color: #ffffff; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Kabar Baik! Game Request Kamu Udah Ada</h2>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">
          <strong style="color: #c9a84c;">{game_name}</strong> sekarang udah ada di katalog Playfast — game yang kamu request bareng yang lain udah berhasil kita tambahin.
        </p>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 8px;">
          Klik tombol di bawah buat lihat detailnya, atau langsung beli/main kalau kamu udah subscribe.
        </p>

        <!-- CTA Button -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="{game_url}"
             style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;
                    letter-spacing: 0.3px;">
            Lihat Game
          </a>
        </div>

        <!-- Fallback link -->
        <p style="color: #555; font-size: 12px; line-height: 1.5; margin: 0 0 20px; word-break: break-all;">
          Tombol tidak berfungsi? Salin link ini ke browser:<br>
          <a href="{game_url}" style="color: #c9a84c; text-decoration: none;">{game_url}</a>
        </p>

        <!-- Separator -->
        <div style="border-top: 1px solid #2a2a4a; margin: 20px 0;"></div>

        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0;">
          Makasih udah bantu nentuin game apa yang kita tambahin selanjutnya. Terus request yang lain di
          <a href="{SITE_URL}/request-game" style="color: #c9a84c; text-decoration: none;">halaman Request Game</a> ya!
        </p>
      </div>"""

    send_email(to, f"Game request kamu sudah ada — {game_name}", _base_template(content))


# ---------------------------------------------------------------------------
# Email: Post-purchase welcome (order fulfilled / subscription activated)
# ---------------------------------------------------------------------------


def _step_row(num: str, color: str, html_body: str) -> str:
    """Render one step as a self-contained card row.

    Tables-based for email-client compat (Outlook/Gmail/Apple Mail). Each row
    sits on its own dark card so the list reads as discrete items rather than
    a tight wall of text.
    """
    return f"""\
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 12px; background: #131527; border: 1px solid #232743; border-radius: 10px;">
          <tr>
            <td width="56" valign="top" style="padding: 16px 0 16px 16px;">
              <table role="presentation" width="36" height="36" cellpadding="0" cellspacing="0" border="0" style="background: {color}; border-radius: 50%;">
                <tr><td align="center" style="color: #0c0e16; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 15px; font-weight: 800; line-height: 36px;">{num}</td></tr>
              </table>
            </td>
            <td valign="middle" style="padding: 16px 18px 16px 14px; color: #d8dee6; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.65;">
              {html_body}
            </td>
          </tr>
        </table>"""


def _dont_row(html_body: str) -> str:
    return f"""\
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 8px; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.25); border-radius: 8px;">
          <tr>
            <td width="40" valign="middle" align="center" style="padding: 12px 0; color: #ff6b6b; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 18px; font-weight: 700;">&times;</td>
            <td valign="middle" style="padding: 12px 16px 12px 4px; color: #c8d0dd; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13.5px; line-height: 1.6;">
              {html_body}
            </td>
          </tr>
        </table>"""


def _section_label(text: str, color: str = "#c9a84c") -> str:
    return f"""\
        <p style="color: {color}; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 12px; font-weight: 700; margin: 8px 0 14px; text-transform: uppercase; letter-spacing: 0.8px;">
          {text}
        </p>"""


def _section_divider() -> str:
    return """\
        <div style="height: 1px; background: linear-gradient(90deg, transparent 0%, #2a2a4a 50%, transparent 100%); margin: 28px 0;"></div>"""


def _play_safety_fragment() -> str:
    """Shared HTML fragment: 5-step Mode Offline workflow + 'jangan' rules.

    Used by both order and subscription welcome emails — the rules apply to
    every Steam account access regardless of how it was purchased.
    """
    steps = (
        _step_row("1", "#c9a84c", "<strong style=\"color: #fff;\">Login Steam</strong> pakai username &amp; password yang kami kirim. Masukkan kode Steam Guard dari halaman order Playfast.")
        + _step_row("2", "#c9a84c", "<strong style=\"color: #fff;\">Download game-nya</strong> dari Library Steam. Tunggu sampai 100% selesai.")
        + _step_row("3", "#c9a84c", "<strong style=\"color: #fff;\">Play game pertama kali</strong> dalam mode online &mdash; biarkan Steam sync &amp; verifikasi instalasi. Tutup game setelah masuk menu utama.")
        + _step_row("4", "#ff6b6b", "<strong style=\"color: #fff;\">Exit Steam &mdash; kemudian buka lagi.</strong> Klik <strong style=\"color: #c9a84c;\">Steam &rarr; Go Offline</strong>. Steam akan restart dalam mode offline.")
        + _step_row("5", "#4caf50", "<strong style=\"color: #fff;\">Play game-nya sekarang</strong> &mdash; aman dari konflik user lain, dan Steam tidak akan flag akun.")
    )

    donts = (
        _dont_row("<strong style=\"color: #e8eaf0;\">Main dalam mode online</strong> &mdash; akan kick user lain")
        + _dont_row("<strong style=\"color: #e8eaf0;\">Ubah password atau email</strong> akun")
        + _dont_row("<strong style=\"color: #e8eaf0;\">Add friend, accept invite, atau ubah profile</strong>")
        + _dont_row("<strong style=\"color: #e8eaf0;\">Login akun ke banyak device sekaligus</strong>")
        + _dont_row("<strong style=\"color: #e8eaf0;\">Share kredensial</strong> ke orang lain di luar Playfast")
    )

    return f"""\
        <!-- Critical workflow callout -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: rgba(201,168,76,0.10); border: 1px solid rgba(201,168,76,0.4); border-radius: 12px; margin: 0 0 28px;">
          <tr>
            <td style="padding: 22px 22px;">
              <p style="color: #c9a84c; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin: 0 0 8px; text-transform: uppercase;">
                &#9888; Aturan Paling Penting
              </p>
              <p style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 17px; font-weight: 700; line-height: 1.4; margin: 0 0 8px;">
                Selalu main dalam Mode Offline.
              </p>
              <p style="color: #b8c0cd; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13.5px; line-height: 1.65; margin: 0;">
                Akun Steam-mu di-share dengan beberapa user. Kalau kamu main online, user lain yang lagi main bakal ke-kick keluar &mdash; dan akun bisa di-flag Steam.
              </p>
            </td>
          </tr>
        </table>

        {_section_label("Cara main yang benar &mdash; 5 langkah")}
        {steps}

        {_section_divider()}

        {_section_label("Yang jangan dilakukan", color="#ff8e8e")}
        {donts}

        {_section_divider()}

        <!-- Help -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #131527; border: 1px solid #232743; border-radius: 10px;">
          <tr>
            <td style="padding: 18px 20px;">
              <p style="color: #c9a84c; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; margin: 0 0 6px; text-transform: uppercase;">
                Butuh bantuan?
              </p>
              <p style="color: #b8c0cd; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.65; margin: 0;">
                Ada masalah login, error Steam Guard, atau akun bermasalah? Klik tombol <strong style="color: #e8eaf0;">"Laporkan Masalah Akun"</strong> di halaman main game-mu, atau balas email ini. Admin respon dalam 24 jam.
              </p>
            </td>
          </tr>
        </table>"""


def _hero_block(gradient: str, eyebrow: str, *, icon_url: str | None = None, glyph: str | None = None) -> str:
    """Tall hero header with a prominent badge + eyebrow label.

    Defaults to the Playfast icon for brand consistency. Callers can pass
    `glyph` (an HTML entity / emoji) to fall back to a glyph badge — only
    used if `icon_url` is explicitly `None`.
    """
    if icon_url is None and glyph is None:
        icon_url = ICON_URL

    if icon_url:
        badge = (
            f'<img src="{icon_url}" alt="Playfast" width="56" height="56" '
            f'style="display: block; width: 56px; height: 56px; border-radius: 14px;" />'
        )
    else:
        badge = (
            f'<table role="presentation" width="76" height="76" cellpadding="0" cellspacing="0" border="0" '
            f'style="background: rgba(0,0,0,0.18); border-radius: 50%; box-shadow: 0 0 0 6px rgba(255,255,255,0.06);">'
            f'<tr><td align="center" valign="middle" style="font-size: 36px; line-height: 76px;">{glyph}</td></tr>'
            f'</table>'
        )

    return f"""\
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: {gradient};">
        <tr>
          <td align="center" style="padding: 44px 24px 36px 24px;">
            {badge}
            <p style="color: rgba(255,255,255,0.92); font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; margin: 16px 0 0;">
              {eyebrow}
            </p>
          </td>
        </tr>
      </table>"""


def _cta_button(href: str, label: str) -> str:
    """Bigger, more confident CTA — full-width on narrow viewports."""
    return f"""\
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 32px;">
        <tr>
          <td align="center">
            <a href="{href}"
               style="display: inline-block; background: #c9a84c; color: #000;
                      text-decoration: none; padding: 16px 44px; border-radius: 10px;
                      font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                      font-weight: 800; font-size: 15px; letter-spacing: 0.4px;
                      box-shadow: 0 6px 20px rgba(201,168,76,0.35);">
              {label}
            </a>
          </td>
        </tr>
      </table>"""


def send_order_welcome_email(to: str, game_name: str, play_url: str):
    """Sent on the user's FIRST fulfilled purchase order.

    The trigger logic in store.routes._fulfill_order ensures this fires only
    once per user (skipped for subscription claims and for any subsequent
    purchase orders), so the body can talk like a one-time onboarding rather
    than a per-game receipt.

    Always sends regardless of email_opted_out — this is transactional, not
    promotional. The user paid for access and needs the safety instructions.
    """
    safety = _play_safety_fragment()
    hero = _hero_block(
        gradient="linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)",
        eyebrow="Pesanan Aktif",
    )
    cta = _cta_button(play_url, "Buka Halaman Main")
    content = f"""\
      {hero}

      <!-- Body -->
      <div style="padding: 36px 32px 32px 32px;">
        <h2 style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 0 12px; font-size: 26px; font-weight: 800; line-height: 1.25;">
          Pesanan kamu sudah aktif!
        </h2>
        <p style="color: #b0b8c4; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
          Kredensial Steam untuk <strong style="color: #c9a84c;">{game_name}</strong> sudah siap dipakai. Karena ini pesanan pertamamu, baca dulu cara mainnya &mdash; aturan ini berlaku untuk semua game yang kamu beli atau klaim ke depannya.
        </p>

        {cta}

        {safety}
      </div>"""

    send_email(to, f"Pesanan aktif: {game_name} — cara main yang benar", _base_template(content))


def send_subscription_welcome_email(to: str, plan_label: str, store_url: str):
    """Sent when a subscription is activated. Always sends (transactional)."""
    safety = _play_safety_fragment()
    hero = _hero_block(
        gradient="linear-gradient(135deg, #c9a84c 0%, #a88a2e 100%)",
        eyebrow="Premium Aktif",
    )
    cta = _cta_button(store_url, "Jelajahi Katalog")
    content = f"""\
      {hero}

      <!-- Body -->
      <div style="padding: 36px 32px 32px 32px;">
        <h2 style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 0 12px; font-size: 26px; font-weight: 800; line-height: 1.25;">
          Subscription kamu sudah aktif!
        </h2>
        <p style="color: #b0b8c4; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
          Selamat &mdash; kamu sekarang punya akses <strong style="color: #c9a84c;">{plan_label}</strong> ke seluruh katalog game Playfast. Sebelum main game pertama, baca cara pakai di bawah biar pengalamanmu mulus.
        </p>

        {cta}

        {safety}
      </div>"""

    send_email(to, "Subscription aktif — cara main aman di Playfast", _base_template(content))


# ---------------------------------------------------------------------------
# Email: Account Flag Notification (to support)
# ---------------------------------------------------------------------------

SUPPORT_EMAIL = "support@playfast.id"

_FLAG_REASON_LABELS = {
    "locked": "Akun ke-lock / Steam Guard",
    "banned": "Akun di-ban Steam (VAC, dll)",
    "password_changed": "Password berubah, tidak bisa login",
    "credentials_invalid": "Username/password salah",
    "guard_code_failed": "Kode Steam Guard gagal",
    "slow_response": "Akun lambat / lag",
    "other": "Lainnya",
}


def send_account_flag_notification(
    *,
    flag_id: int,
    user_email: str,
    account_name: str,
    game_name: str | None,
    reason: str,
    description: str | None,
    order_id: int | None,
):
    """Notify support@ when a user files a new account flag.

    Fires only on the create-new path in flag_account_from_order — the
    same-user-same-account update path skips this so admin isn't spammed
    while one issue is still 'new'.
    """
    reason_label = _FLAG_REASON_LABELS.get(reason, reason)
    game_label = game_name or "(game tidak diketahui)"
    order_label = f"#{order_id}" if order_id else "—"
    description_block = (
        f"""
        <p style="color: #b0b8c4; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin: 0 0 24px; padding: 16px; background: #0f0f1a; border-left: 3px solid #c9a84c; border-radius: 4px; white-space: pre-wrap;">
          {description}
        </p>"""
        if description
        else """
        <p style="color: #777; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px; font-style: italic; margin: 0 0 24px;">
          User tidak menambahkan deskripsi.
        </p>"""
    )

    admin_url = f"{SITE_URL}/admin/account-flags"
    cta = _cta_button(admin_url, "Buka Panel Moderasi")

    content = f"""\
      <!-- Body -->
      <div style="padding: 32px 32px 28px 32px;">
        <div style="display: inline-block; padding: 4px 12px; background: rgba(255,80,80,0.15); border: 1px solid rgba(255,80,80,0.35); border-radius: 999px; font-size: 11px; color: #ff8080; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 16px;">
          Flag Baru
        </div>
        <h2 style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 0 8px; font-size: 22px; font-weight: 800; line-height: 1.3;">
          {reason_label}
        </h2>
        <p style="color: #b0b8c4; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          User <strong style="color: #c9a84c;">{user_email}</strong> melaporkan masalah pada akun <strong>{account_name}</strong>.
        </p>

        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px; color: #b0b8c4; margin-bottom: 20px;">
          <tr><td style="padding: 6px 0; color: #777; width: 110px;">Flag ID</td><td style="padding: 6px 0; color: #fff; font-family: monospace;">#{flag_id}</td></tr>
          <tr><td style="padding: 6px 0; color: #777;">Order</td><td style="padding: 6px 0; color: #fff; font-family: monospace;">{order_label}</td></tr>
          <tr><td style="padding: 6px 0; color: #777;">Game</td><td style="padding: 6px 0; color: #fff;">{game_label}</td></tr>
          <tr><td style="padding: 6px 0; color: #777;">Akun</td><td style="padding: 6px 0; color: #fff; font-family: monospace;">{account_name}</td></tr>
          <tr><td style="padding: 6px 0; color: #777;">Reporter</td><td style="padding: 6px 0; color: #fff;">{user_email}</td></tr>
        </table>

        <h3 style="color: #ffffff; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0 0 8px; font-size: 14px; font-weight: 700;">
          Deskripsi
        </h3>
        {description_block}

        {cta}
      </div>"""

    subject = f"[Account Flag] {reason_label} — {account_name}"
    send_email(SUPPORT_EMAIL, subject, _base_template(content))
