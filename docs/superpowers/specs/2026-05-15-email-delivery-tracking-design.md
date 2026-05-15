# Email Delivery Tracking — Design

**Date:** 2026-05-15
**Status:** Approved, ready for plan

## Problem

Beberapa user lapor tidak menerima verification email setelah register. Saat ini `email_service.py` mengirim email asynchronous via thread; jika gagal, `logger.exception` hanya menulis ke file log dan tidak ada catatan persisten yang bisa di-query. Admin tidak punya cara untuk:

1. Mengecek apakah email tertentu pernah dikirim ke seorang user
2. Mengetahui penyebab kegagalan (SMTP error, bounce, spam, invalid email)
3. Mengirim ulang email dari sisi admin tanpa minta user klik tombol resend
4. Membedakan apakah masalahnya di sisi kita (SMTP gagal) atau di sisi tujuan (mailbox bounce / spam folder)

## Goals

- Catat setiap percobaan kirim email transactional ke DB beserta status lifecycle-nya
- Tangkap event delivery dari Brevo (delivered, soft_bounce, hard_bounce, spam, blocked, invalid_email, deferred) via webhook
- Admin UI untuk inspect log secara global dan per-user
- Admin bisa resend email atau manually mark email sebagai verified ketika delivery terbukti bermasalah di sisi recipient

## Non-Goals

- Tidak menyimpan rendered HTML body (hemat DB; bisa di-regenerate dari template)
- Tidak track open / click event (overkill untuk tujuan debugging delivery, dan butuh tier Brevo yang sesuai)
- Tidak retention/auto-cleanup — metadata kecil, simpan selamanya
- Tidak ada validasi typo email saat register (misal `gnail.com` → `gmail.com`) — di luar scope

## Scope

Email jenis yang akan di-track (semua sender saat ini di `email_service.py`):

- `verification` — `send_verification_email`
- `password_reset` — `send_password_reset_email`
- `order_welcome` — `send_order_welcome_email`
- `subscription_welcome` — `send_subscription_welcome_email`
- `game_request_fulfilled` — `send_game_request_fulfilled_email`
- `account_flag` — `send_account_flag_notification`

Email tambahan di masa depan tinggal ikuti pola yang sama.

## Architecture

Tiga komponen utama:

### 1. `email_logs` table

```
email_logs
  id                  PK
  user_id             FK users.id, nullable, indexed
                      (nullable karena account_flag dikirim ke support@, bukan user)
  recipient_email     string, indexed
  type                string, indexed
                      (verification | password_reset | order_welcome |
                       subscription_welcome | game_request_fulfilled |
                       account_flag)
  subject             string
  status              string, indexed
                      (queued | sent | failed | delivered | bounced |
                       soft_bounced | spam | blocked | invalid_email |
                       deferred)
  smtp_response       text, nullable
                      (string returned by smtplib, contains Brevo message-id
                       in "queued as <id>" format)
  brevo_message_id    string, nullable, indexed
                      (extracted from smtp_response, used to match Brevo
                       webhook events back to this row)
  error_message       text, nullable
                      (exception repr saat send gagal)
  metadata            JSON, nullable
                      (token_id, order_id, game_name dll — konteks tambahan
                       tergantung type)
  created_at          datetime, indexed (= queued_at)
  sent_at             datetime, nullable
                      (saat smtplib.sendmail return sukses)
  brevo_event_at      datetime, nullable
                      (timestamp event terakhir dari Brevo webhook)
```

**Indeks:**
- `(user_id, created_at DESC)` — untuk tab di user detail page
- `(created_at DESC)` — untuk global page default sort
- `brevo_message_id` — untuk webhook lookup
- `(type, status, created_at DESC)` — untuk filter di global page

**Status transitions:**

```
queued ──> sent ──> delivered
   │         │   ╲
   │         │    ╲──> bounced / soft_bounced / spam /
   │         │         blocked / invalid_email / deferred
   │         │
   └─> failed (smtp gagal, tidak pernah ke Brevo)
```

`failed` adalah terminal state untuk error sisi kita (SMTP unreachable, auth fail, dll). Status post-`sent` semuanya berasal dari Brevo webhook.

### 2. `email_service.py` refactor

Setiap fungsi sender (`send_verification_email` dkk) berubah signature untuk menerima `user_id` (optional) dan konteks tambahan untuk metadata. Internal API:

```python
def send_email(
    to: str,
    subject: str,
    html: str,
    *,
    email_type: str,
    user_id: int | None = None,
    metadata: dict | None = None,
) -> int:
    """Queue email; returns log_id."""
    # 1. Create email_logs row dengan status='queued', dapatkan log_id
    # 2. Start thread: _send_async(config, to, subject, html, log_id)
    # 3. Return log_id
```

Di `_send_async`:

```python
def _send_async(app_config, to, subject, html, log_id):
    # Butuh app context untuk db.session di thread
    with app.app_context():
        try:
            with smtplib.SMTP(...) as server:
                server.starttls()
                server.login(...)
                response = server.sendmail(...)
            # sendmail return {} on success; tapi connection has last response:
            # gunakan server.docmd / capture last_response. Brevo balikin
            # "250 2.0.0 OK: queued as <message_id>"
            smtp_resp = _get_last_smtp_response(server)
            brevo_id = _extract_brevo_message_id(smtp_resp)
            EmailLog.mark_sent(log_id, smtp_resp, brevo_id)
        except Exception as e:
            EmailLog.mark_failed(log_id, repr(e))
            logger.exception("Failed to send email to %s", to)
```

Karena `smtplib.SMTP.sendmail` me-return error dict (kalau partial) dan tidak expose last response code secara langsung, kita perlu intercept reply. Detail teknis: buat thin wrapper yang capture `getreply()` setelah `data()` — atau pakai `server.send_message()` lalu cek `last_response_code` / `last_response`. Spek implementasi akan eksplorasi pilihan ini di plan.

### 3. Brevo webhook endpoint

Route baru di `app/webhooks/routes.py` (blueprint baru):

```
POST /api/webhooks/brevo
Auth: shared secret di header `X-Brevo-Secret` (env var BREVO_WEBHOOK_SECRET)
Body: Brevo standard event payload (lihat https://developers.brevo.com/docs/transactional-webhooks)
```

Handler:

1. Verify `X-Brevo-Secret` header matches env var; return 401 jika tidak
2. Parse event: `event` (string), `message-id`, `date`, optional `reason`
3. Lookup `EmailLog.query.filter_by(brevo_message_id=message_id).first()`
4. Jika tidak ketemu, log warning + return 200 (jangan retry — mungkin pre-tracking email)
5. Map event → status:
   - `delivered` → `delivered`
   - `hard_bounce` → `bounced`
   - `soft_bounce` → `soft_bounced`
   - `spam` → `spam`
   - `blocked` → `blocked`
   - `invalid_email` → `invalid_email`
   - `deferred` → `deferred`
   - lainnya → ignore (jangan overwrite status)
6. Idempotent: kalau `brevo_event_at` ada dan event_date <= brevo_event_at → skip
7. Update `status`, `brevo_event_at`, plus simpan reason ke `error_message` kalau ada
8. Return 200

Konfigurasi di Brevo dashboard: webhook URL `https://playfast.id/api/webhooks/brevo`, subscribe ke semua transactional events di atas, set custom header `X-Brevo-Secret: <generated_value>`.

## UI

### Global page: `/admin/email-logs`

Tabel dengan kolom:

| Time | Recipient | Type | Status | SMTP |
|---|---|---|---|---|
| 2026-05-15 14:32 | user@gmail.com | verification | delivered (badge hijau) | 250 OK |
| 2026-05-15 14:28 | typo@gnail.com | verification | bounced (badge merah) | hard_bounce |
| 2026-05-15 14:15 | x@yahoo.com | password_reset | failed (badge merah) | SMTPException |

Filter di atas tabel:
- Search recipient email (substring)
- Dropdown type (multi-select)
- Dropdown status (multi-select)
- Date range picker (default: 7 hari terakhir)
- Hanya menampilkan failed/bounced (toggle)

Pagination 50 per page, default sort `created_at DESC`.

Klik row → buka detail modal.

### Detail modal

Tampilkan semua field log + tombol action:

```
[Verification — typo@gnail.com]
ID: 1234
User: #567 - Budi (jika user_id ada, link ke admin user detail)
Status: bounced (badge merah)
Timeline:
  - 14:28:01 queued
  - 14:28:02 sent (250 OK, queued as <brevo_id>)
  - 14:29:15 bounced (hard_bounce: mailbox does not exist)
SMTP response: 250 2.0.0 OK: queued as 8a7b6c5d
Error: hard_bounce — Reason: mailbox does not exist
Metadata: { "token_id": 4321 }

[Resend]  [Mark email verified]  (only if type=verification & user not verified)
```

### Tab di `AdminUserDetailPage`

Tab baru "Email History" di samping tab yang sudah ada (Orders, Subscriptions, dll — sesuai struktur saat ini). Pre-filtered `user_id=<this user>`, sama format dengan global page tapi tanpa kolom Recipient. Tombol "Kirim ulang verifikasi" muncul di header tab kalau user belum `email_verified`.

## Backend Routes

Tambahan di `app/admin/routes.py`:

- `GET /api/admin/email-logs` — query params: `recipient`, `type[]`, `status[]`, `from`, `to`, `failed_only`, `page`, `per_page`. Returns paginated list.
- `GET /api/admin/email-logs/<id>` — full detail.
- `POST /api/admin/email-logs/<id>/resend` — re-trigger. Server-side: load original log → call appropriate sender function lagi dengan args dari `metadata` → bikin log row baru. Rate-limit 60s per (user_id, type) — sama dengan `/auth/resend-verification`.
- `POST /api/admin/users/<id>/mark-email-verified` — set `email_verified=true`. Catat di audit log (admin_logs / equivalent) supaya jelas siapa yang override kapan.

Webhook (blueprint terpisah):

- `POST /api/webhooks/brevo` — handler di atas.

## Error handling

- **Webhook idempotency**: cek `brevo_event_at` >= incoming event date sebelum update.
- **Webhook auth failure**: return 401 + log warning. Brevo akan retry — pastikan secret di env var match.
- **Resend rate limit**: 60s cooldown per (user_id, type). Return 429 dengan `retry_after`.
- **Manual mark verified**: confirm modal di UI; backend tidak memerlukan token apa-apa, tapi tercatat di audit log dengan admin yang melakukan.
- **Email yang dikirim sebelum tracking aktif**: tidak punya row di `email_logs` — tab di user detail akan kosong sebelum migration. Tidak backfill (tidak ada data historisnya).
- **Thread crash sebelum sempat update log**: row stuck di `queued`. Job cleanup ringan (cron / startup hook): row `queued` > 5 menit → set `failed` dengan error "stuck in queue".

## Testing

**Unit tests** (`backend/tests`):

- `EmailLog.create_queued` membuat row dengan status `queued`
- `EmailLog.mark_sent` update status + sent_at + brevo_message_id
- `EmailLog.mark_failed` update status + error_message
- Sender wrappers (`send_verification_email` dkk) memanggil `send_email` dengan `email_type` yang benar dan menyimpan metadata yang relevan
- Brevo webhook parser: map setiap event type → status, handle unknown event (ignore), idempotency check
- Webhook auth: tanpa header → 401, dengan header salah → 401, benar → 200

**Integration tests:**

- Mock SMTP success → row berakhir di `sent` dengan brevo_message_id ter-parse
- Mock SMTP raise exception → row di `failed` dengan error_message terisi
- Register user → cek log baru type=verification status `queued` / `sent`
- POST webhook dengan event `delivered` matching message_id → row jadi `delivered`
- POST webhook dengan event `hard_bounce` → row jadi `bounced` dengan reason
- POST webhook duplicate (event_date sama atau lebih lama) → no-op
- Admin resend endpoint → row baru dibuat, rate-limit kicks in pada call kedua dalam 60s

**Manual smoke test post-deploy:**

- Register akun test dengan email valid → cek log status berubah ke `delivered` dalam ~30s
- Register akun test dengan email typo (`xxx@invalid-domain-zzz.com`) → cek log status berubah ke `hard_bounce`
- Trigger resend dari admin → email baru sampai inbox

## Migration

- Tambah tabel `email_logs` (lihat `app/__init__.py` migration pattern yang sudah dipakai: `ALTER TABLE ... ADD COLUMN ...` style sederhana)
- Tidak ada backfill untuk email yang dikirim sebelumnya — riwayat dimulai dari deploy
- Brevo webhook configuration manual via dashboard pasca-deploy (deployment runbook update)

## Open Items (resolved during planning)

- Cara persis mendapatkan `smtp_response` + `brevo_message_id` dari `smtplib` — eksplorasi di plan (kemungkinan subclass `SMTP` untuk intercept reply, atau parse di error path saja)
- Apakah perlu admin_logs / audit table baru, atau cukup tulis ke standard logger untuk action manual mark-verified — tentukan di plan
- Mekanisme stuck-queued cleanup: startup hook vs. cron vs. on-read repair — tentukan di plan

## Deployment runbook (post-merge)

1. **Set webhook secret env var** di VPS. Generate secret yang kuat:

   ```bash
   openssl rand -hex 24
   ```

   Update `.env.production` di server, isi `BREVO_WEBHOOK_SECRET=<value>`, lalu restart backend (`systemctl restart playfast-backend` atau setara). Sebelum nilai ini terisi, endpoint `/api/webhooks/brevo` akan menolak semua request dengan 503 — aman by default.

2. **Konfigurasi Brevo dashboard:**
   - Login ke Brevo → Transactional → Settings → Webhook → Add new webhook
   - URL: `https://playfast.id/api/webhooks/brevo`
   - Events: centang `Delivered`, `Hard bounce`, `Soft bounce`, `Spam`, `Blocked`, `Invalid email`, `Deferred`
   - Custom HTTP headers: tambah header `X-Brevo-Secret` dengan nilai yang sama persis dengan env var di atas
   - Save

3. **Smoke test post-deploy:**
   - Buka `/admin/email-logs` di production — pastikan halaman render dan list kosong (atau berisi log baru kalau ada email yang dikirim sejak deploy)
   - Register akun test dengan email valid yang kamu punya → cek log baru muncul dengan status `sent`, lalu beberapa detik kemudian update jadi `delivered`
   - Register akun test dengan email salah (misal `nonexistent-zzz-xyz123@gmail.com`) → cek log update jadi `bounced` dalam ~1 menit
   - Test resend dari admin → verify log baru dibuat dan email sampai inbox
   - Test mark-verified dari admin → verify `email_verified` flip di DB
