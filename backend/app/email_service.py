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


def _play_safety_fragment() -> str:
    """Shared HTML fragment: 5-step Mode Offline workflow + 'jangan' rules.

    Used by both order and subscription welcome emails — the rules apply to
    every Steam account access regardless of how it was purchased.
    """
    return """\
        <!-- Critical workflow callout -->
        <div style="background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.35); border-radius: 8px; padding: 18px 20px; margin: 0 0 24px;">
          <p style="color: #c9a84c; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; margin: 0 0 6px; text-transform: uppercase;">
            &#9888; Aturan Paling Penting
          </p>
          <p style="color: #e8eaf0; font-size: 15px; font-weight: 700; line-height: 1.5; margin: 0 0 6px;">
            Selalu main dalam Mode Offline.
          </p>
          <p style="color: #b0b8c4; font-size: 13px; line-height: 1.6; margin: 0;">
            Akun Steam-mu di-share dengan beberapa user. Kalau kamu main online, user lain yang lagi main bakal ke-kick keluar &mdash; dan akun bisa di-flag Steam.
          </p>
        </div>

        <!-- Step-by-step workflow -->
        <p style="color: #888; font-size: 13px; font-weight: 700; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          Cara main yang benar (5 langkah):
        </p>

        <table style="width: 100%; border-spacing: 0; margin: 0 0 24px;">
          <tr>
            <td style="background: #c9a84c; color: #000; font-weight: 700; width: 32px; height: 32px; text-align: center; border-radius: 50%; font-size: 14px; vertical-align: middle;">1</td>
            <td style="padding: 0 0 0 14px; color: #d8dee6; font-size: 14px; line-height: 1.6; vertical-align: middle;">
              <strong style="color: #fff;">Login Steam</strong> pakai username &amp; password yang kami kirim. Masukkan kode Steam Guard dari halaman order Playfast.
            </td>
          </tr>
          <tr><td colspan="2" style="height: 12px;"></td></tr>
          <tr>
            <td style="background: #c9a84c; color: #000; font-weight: 700; width: 32px; height: 32px; text-align: center; border-radius: 50%; font-size: 14px; vertical-align: middle;">2</td>
            <td style="padding: 0 0 0 14px; color: #d8dee6; font-size: 14px; line-height: 1.6; vertical-align: middle;">
              <strong style="color: #fff;">Download game-nya</strong> dari Library Steam. Tunggu sampai 100% selesai.
            </td>
          </tr>
          <tr><td colspan="2" style="height: 12px;"></td></tr>
          <tr>
            <td style="background: #c9a84c; color: #000; font-weight: 700; width: 32px; height: 32px; text-align: center; border-radius: 50%; font-size: 14px; vertical-align: middle;">3</td>
            <td style="padding: 0 0 0 14px; color: #d8dee6; font-size: 14px; line-height: 1.6; vertical-align: middle;">
              <strong style="color: #fff;">Play game pertama kali</strong> dalam mode online &mdash; ini biarkan Steam sync &amp; verifikasi instalasi. Tutup game setelah masuk menu utama.
            </td>
          </tr>
          <tr><td colspan="2" style="height: 12px;"></td></tr>
          <tr>
            <td style="background: #ff6b6b; color: #fff; font-weight: 700; width: 32px; height: 32px; text-align: center; border-radius: 50%; font-size: 14px; vertical-align: middle;">4</td>
            <td style="padding: 0 0 0 14px; color: #d8dee6; font-size: 14px; line-height: 1.6; vertical-align: middle;">
              <strong style="color: #fff;">Exit Steam &mdash; kemudian buka lagi.</strong> Klik menu <strong style="color: #c9a84c;">Steam &rarr; Go Offline</strong>. Steam akan restart dalam mode offline.
            </td>
          </tr>
          <tr><td colspan="2" style="height: 12px;"></td></tr>
          <tr>
            <td style="background: #4caf50; color: #fff; font-weight: 700; width: 32px; height: 32px; text-align: center; border-radius: 50%; font-size: 14px; vertical-align: middle;">5</td>
            <td style="padding: 0 0 0 14px; color: #d8dee6; font-size: 14px; line-height: 1.6; vertical-align: middle;">
              <strong style="color: #fff;">Play game-nya sekarang</strong> &mdash; aman dari konflik user lain, dan Steam tidak akan flag akun.
            </td>
          </tr>
        </table>

        <!-- Don'ts -->
        <p style="color: #888; font-size: 13px; font-weight: 700; margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          Yang JANGAN dilakukan:
        </p>
        <table style="width: 100%; border-spacing: 0; margin: 0 0 24px;">
          <tr>
            <td style="color: #ff6b6b; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top; width: 24px;">&times;</td>
            <td style="color: #b0b8c4; font-size: 13px; line-height: 1.6; padding: 4px 0;">
              <strong style="color: #d8dee6;">Main dalam mode online</strong> &mdash; akan kick user lain
            </td>
          </tr>
          <tr>
            <td style="color: #ff6b6b; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top;">&times;</td>
            <td style="color: #b0b8c4; font-size: 13px; line-height: 1.6; padding: 4px 0;">
              <strong style="color: #d8dee6;">Ubah password atau email</strong> akun
            </td>
          </tr>
          <tr>
            <td style="color: #ff6b6b; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top;">&times;</td>
            <td style="color: #b0b8c4; font-size: 13px; line-height: 1.6; padding: 4px 0;">
              <strong style="color: #d8dee6;">Add friend, accept invite, atau ubah profile</strong>
            </td>
          </tr>
          <tr>
            <td style="color: #ff6b6b; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top;">&times;</td>
            <td style="color: #b0b8c4; font-size: 13px; line-height: 1.6; padding: 4px 0;">
              <strong style="color: #d8dee6;">Login akun ke banyak device sekaligus</strong>
            </td>
          </tr>
          <tr>
            <td style="color: #ff6b6b; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top;">&times;</td>
            <td style="color: #b0b8c4; font-size: 13px; line-height: 1.6; padding: 4px 0;">
              <strong style="color: #d8dee6;">Share kredensial</strong> ke orang lain di luar Playfast
            </td>
          </tr>
        </table>

        <!-- Help -->
        <div style="border-top: 1px solid #2a2a4a; padding-top: 18px; margin-top: 8px;">
          <p style="color: #888; font-size: 12px; line-height: 1.6; margin: 0;">
            Ada masalah login, error Steam Guard, atau akun bermasalah? Klik tombol <strong style="color: #d8dee6;">"Laporkan Masalah Akun"</strong> di halaman main game-mu, atau balas email ini. Admin respon dalam 24 jam.
          </p>
        </div>"""


def send_order_welcome_email(to: str, game_name: str, play_url: str):
    """Sent when an order is fulfilled (Steam account assigned).

    Always sends regardless of email_opted_out — this is transactional, not
    promotional. The user paid for access and needs the safety instructions.
    """
    safety = _play_safety_fragment()
    content = f"""\
      <!-- Icon bar -->
      <div style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); padding: 24px; text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.15); display: inline-flex; align-items: center; justify-content: center; margin: 0 auto;">
          <span style="font-size: 28px;">&#10003;</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">
        <h2 style="color: #ffffff; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Pesanan kamu sudah aktif!</h2>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
          Kredensial Steam untuk <strong style="color: #c9a84c;">{game_name}</strong> sudah siap dipakai. Sebelum mulai main, baca dulu cara pakainya di bawah &mdash; ini penting biar pengalamanmu (dan user lain) tetap mulus.
        </p>

        <!-- CTA Button: open play page -->
        <div style="text-align: center; margin: 0 0 28px;">
          <a href="{play_url}"
             style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;
                    letter-spacing: 0.3px;">
            Buka Halaman Main
          </a>
        </div>

        {safety}
      </div>"""

    send_email(to, f"Pesanan aktif: {game_name} — cara main yang benar", _base_template(content))


def send_subscription_welcome_email(to: str, plan_label: str, store_url: str):
    """Sent when a subscription is activated. Always sends (transactional)."""
    safety = _play_safety_fragment()
    content = f"""\
      <!-- Icon bar -->
      <div style="background: linear-gradient(135deg, #c9a84c 0%, #a88a2e 100%); padding: 24px; text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.15); display: inline-flex; align-items: center; justify-content: center; margin: 0 auto;">
          <span style="font-size: 28px;">&#127775;</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">
        <h2 style="color: #ffffff; margin: 0 0 8px; font-size: 22px; font-weight: 700;">Subscription kamu sudah aktif!</h2>
        <p style="color: #8f98a0; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
          Selamat &mdash; kamu sekarang punya akses <strong style="color: #c9a84c;">{plan_label}</strong> ke seluruh katalog game Playfast. Sebelum main game pertama, baca cara pakai di bawah biar pengalamanmu mulus.
        </p>

        <!-- CTA Button: open store -->
        <div style="text-align: center; margin: 0 0 28px;">
          <a href="{store_url}"
             style="display: inline-block; background: #c9a84c; color: #000; text-decoration: none;
                    padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;
                    letter-spacing: 0.3px;">
            Jelajahi Katalog
          </a>
        </div>

        {safety}
      </div>"""

    send_email(to, "Subscription aktif — cara main aman di Playfast", _base_template(content))
