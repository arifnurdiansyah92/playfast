# Email Delivery Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist setiap percobaan kirim email transactional ke DB + tangkap Brevo delivery events via webhook + admin UI untuk inspect/resend/manual-verify, supaya admin bisa tracking kenapa user tidak terima email.

**Architecture:** Tambah `email_logs` table; refactor `email_service.py` agar setiap send membuat row `queued` → update `sent`/`failed` setelah SMTP selesai (parse Brevo `X-Message-Id` dari SMTP response 250); blueprint baru `app/webhooks/routes.py` untuk POST `/api/webhooks/brevo` yang verify shared secret + update row by `brevo_message_id`; admin endpoints + global page `/admin/email-logs` + tab "Email History" di `AdminUserDetailPage`.

**Tech Stack:** Flask 3, SQLAlchemy, Flask-JWT-Extended, psycopg2, smtplib (Brevo), Next.js (App Router), React Query, MUI. Spec referensi: `docs/superpowers/specs/2026-05-15-email-delivery-tracking-design.md`. Karena codebase tidak punya pytest harness, plan ini pakai manual smoke test bukan TDD — ikut konvensi existing.

---

## File Structure

**Backend:**
- Modify `backend/app/models.py` — add `EmailLog` model
- Modify `backend/app/__init__.py` — register `EmailLog.__table__.create` + new `webhooks_bp` blueprint
- Modify `backend/app/email_service.py` — wrap `send_email` to create+update log row, capture Brevo message-id from SMTP reply
- Create `backend/app/webhooks/__init__.py` (empty)
- Create `backend/app/webhooks/routes.py` — Brevo webhook handler
- Modify `backend/app/admin/routes.py` — add `/email-logs` list/detail/resend + `/users/<id>/mark-email-verified` endpoints
- Modify `backend/app/config.py` — add `BREVO_WEBHOOK_SECRET`

**Frontend:**
- Modify `frontend/src/lib/api.ts` — add `EmailLog` type + `adminApi.emailLogs.*` methods
- Create `frontend/src/views/admin/AdminEmailLogsPage.tsx` — global page
- Create `frontend/src/views/admin/EmailLogDetailDialog.tsx` — detail modal shared between global + tab
- Create `frontend/src/app/(dashboard)/admin/email-logs/page.tsx` — App Router entry
- Modify `frontend/src/components/layout/horizontal/HorizontalMenu.tsx` — add menu item under "Marketing" submenu
- Modify `frontend/src/views/admin/AdminUserDetailPage.tsx` — add "Email History" tab

**Docs:**
- Modify `docs/superpowers/plans/` — this file
- Update Brevo webhook setup notes (where? — append to spec doc since no separate deployment runbook exists)

---

## Task 1: EmailLog model + migration

**Files:**
- Modify: `backend/app/models.py` (append new class at end)
- Modify: `backend/app/__init__.py:229-262` (`_run_schema_upgrades` — add table creation)

- [ ] **Step 1: Add EmailLog model**

Append to `backend/app/models.py`:

```python
class EmailLog(db.Model):
    __tablename__ = "email_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    recipient_email = db.Column(db.String(255), nullable=False, index=True)
    type = db.Column(db.String(50), nullable=False, index=True)
    subject = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="queued", index=True)
    smtp_response = db.Column(db.Text, nullable=True)
    brevo_message_id = db.Column(db.String(255), nullable=True, index=True)
    error_message = db.Column(db.Text, nullable=True)
    log_metadata = db.Column("metadata", db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    brevo_event_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", backref="email_logs")

    # Status constants — keep in sync with spec
    STATUS_QUEUED = "queued"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_DELIVERED = "delivered"
    STATUS_BOUNCED = "bounced"
    STATUS_SOFT_BOUNCED = "soft_bounced"
    STATUS_SPAM = "spam"
    STATUS_BLOCKED = "blocked"
    STATUS_INVALID_EMAIL = "invalid_email"
    STATUS_DEFERRED = "deferred"

    # Event types — keep in sync with email_service senders
    TYPE_VERIFICATION = "verification"
    TYPE_PASSWORD_RESET = "password_reset"
    TYPE_ORDER_WELCOME = "order_welcome"
    TYPE_SUBSCRIPTION_WELCOME = "subscription_welcome"
    TYPE_GAME_REQUEST_FULFILLED = "game_request_fulfilled"
    TYPE_ACCOUNT_FLAG = "account_flag"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "recipient_email": self.recipient_email,
            "type": self.type,
            "subject": self.subject,
            "status": self.status,
            "smtp_response": self.smtp_response,
            "brevo_message_id": self.brevo_message_id,
            "error_message": self.error_message,
            "metadata": self.log_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "brevo_event_at": self.brevo_event_at.isoformat() if self.brevo_event_at else None,
        }
```

Note: `metadata` adalah reserved word di SQLAlchemy Declarative, jadi Python attribute pakai `log_metadata` tapi DB column name dipaksa ke `"metadata"`.

- [ ] **Step 2: Register table creation in app factory**

In `backend/app/__init__.py`, after the existing model creation block (around line 261, after `CreatorApplication.__table__.create(...)`), add:

```python
    from app.models import EmailLog
    EmailLog.__table__.create(db.engine, checkfirst=True)
```

- [ ] **Step 3: Add helpful composite index via ALTER**

In `_run_schema_upgrades` (`backend/app/__init__.py`), append to the `alter_statements` list:

```python
        # Email delivery tracking
        "CREATE INDEX IF NOT EXISTS ix_email_logs_user_created ON email_logs (user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_email_logs_type_status_created ON email_logs (type, status, created_at DESC)",
```

- [ ] **Step 4: Smoke test — start backend, ensure table created**

```bash
cd backend && python run.py
```

Expected: no exception during startup. Then in psql:

```sql
\d email_logs
```

Expected: table exists with all columns and indexes ix_email_logs_user_id, ix_email_logs_recipient_email, ix_email_logs_type, ix_email_logs_status, ix_email_logs_brevo_message_id, ix_email_logs_created_at, ix_email_logs_user_created, ix_email_logs_type_status_created.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/__init__.py
git commit -m "feat(email-logs): EmailLog model + migration"
```

---

## Task 2: Helpers on EmailLog (create_queued / mark_sent / mark_failed / apply_brevo_event)

**Files:**
- Modify: `backend/app/models.py` (extend EmailLog class)

- [ ] **Step 1: Add helper classmethods**

Inside the `EmailLog` class (before the closing of the class, after `to_dict`), add:

```python
    @classmethod
    def create_queued(
        cls,
        *,
        recipient_email: str,
        type: str,
        subject: str,
        user_id: int | None = None,
        metadata: dict | None = None,
    ) -> "EmailLog":
        log = cls(
            user_id=user_id,
            recipient_email=recipient_email,
            type=type,
            subject=subject,
            status=cls.STATUS_QUEUED,
            log_metadata=metadata,
        )
        db.session.add(log)
        db.session.commit()
        return log

    @classmethod
    def mark_sent(cls, log_id: int, smtp_response: str, brevo_message_id: str | None):
        log = db.session.get(cls, log_id)
        if not log:
            return
        log.status = cls.STATUS_SENT
        log.smtp_response = smtp_response
        log.brevo_message_id = brevo_message_id
        log.sent_at = datetime.now(timezone.utc)
        db.session.commit()

    @classmethod
    def mark_failed(cls, log_id: int, error_message: str):
        log = db.session.get(cls, log_id)
        if not log:
            return
        log.status = cls.STATUS_FAILED
        log.error_message = error_message
        db.session.commit()

    # Brevo event -> status mapping
    BREVO_EVENT_MAP = {
        "delivered": STATUS_DELIVERED,
        "hard_bounce": STATUS_BOUNCED,
        "soft_bounce": STATUS_SOFT_BOUNCED,
        "spam": STATUS_SPAM,
        "blocked": STATUS_BLOCKED,
        "invalid_email": STATUS_INVALID_EMAIL,
        "deferred": STATUS_DEFERRED,
    }

    def apply_brevo_event(self, event: str, event_at: datetime, reason: str | None) -> bool:
        """Apply a Brevo webhook event. Returns True if applied, False if skipped (unknown/older)."""
        new_status = self.BREVO_EVENT_MAP.get(event)
        if not new_status:
            return False
        if self.brevo_event_at and event_at <= self.brevo_event_at:
            return False
        self.status = new_status
        self.brevo_event_at = event_at
        if reason:
            self.error_message = reason
        db.session.commit()
        return True
```

- [ ] **Step 2: Smoke test from Python shell**

```bash
cd backend && python -c "
from app import create_app
from app.models import EmailLog
from datetime import datetime, timezone
app = create_app()
with app.app_context():
    log = EmailLog.create_queued(
        recipient_email='test@example.com',
        type=EmailLog.TYPE_VERIFICATION,
        subject='Test',
        user_id=None,
        metadata={'foo': 'bar'},
    )
    print('Created:', log.id, log.status)
    EmailLog.mark_sent(log.id, '250 OK', 'msg-123')
    log2 = EmailLog.query.get(log.id)
    print('After mark_sent:', log2.status, log2.brevo_message_id)
    EmailLog.mark_failed(log.id, 'test error')
    log3 = EmailLog.query.get(log.id)
    print('After mark_failed:', log3.status, log3.error_message)
"
```

Expected output:
```
Created: 1 queued
After mark_sent: sent msg-123
After mark_failed: failed test error
```

- [ ] **Step 3: Cleanup test row**

```bash
cd backend && python -c "
from app import create_app
from app.extensions import db
from app.models import EmailLog
app = create_app()
with app.app_context():
    EmailLog.query.filter_by(recipient_email='test@example.com').delete()
    db.session.commit()
    print('cleaned')
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(email-logs): create_queued / mark_sent / mark_failed / apply_brevo_event helpers"
```

---

## Task 3: Refactor email_service.send_email to log lifecycle

**Files:**
- Modify: `backend/app/email_service.py` (replace `send_email` + `_send_async`, update each sender)

- [ ] **Step 1: Update imports and helpers**

At top of `backend/app/email_service.py`, add `re` import and import EmailLog lazily inside functions to avoid circular import:

```python
import logging
import re
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app
```

After imports, add a regex to parse the Brevo message-id from the SMTP reply:

```python
# Brevo balikin "250 2.0.0 OK: queued as <abcd1234>" sebagai last reply.
# Sebagian gateway juga balikin angle-bracket "<id>" — terima keduanya.
_BREVO_ID_RE = re.compile(r"queued as[\s:]+<?([^\s>]+)>?", re.IGNORECASE)


def _extract_brevo_message_id(response_text: str | None) -> str | None:
    if not response_text:
        return None
    m = _BREVO_ID_RE.search(response_text)
    return m.group(1) if m else None
```

- [ ] **Step 2: Subclass SMTP to capture last reply**

`smtplib.SMTP.sendmail` returns `{}` on full success and doesn't expose the final 250 reply directly. The reply lives on `server.docmd` calls. The cleanest hook: capture `getreply` after `sendmail`. We use `smtplib.SMTP`'s internal `_get_last_response` is not standard — instead, subclass to record the last code/msg:

Add this class above `_send_async`:

```python
class _CapturingSMTP(smtplib.SMTP):
    """SMTP client that records the (code, msg) of every reply.

    The Brevo `queued as <id>` token appears on the final 250 reply after the
    DATA command. We expose `last_response` so the caller can inspect it.
    """

    last_response_code: int | None = None
    last_response_msg: bytes | None = None

    def getreply(self):
        code, msg = super().getreply()
        self.last_response_code = code
        self.last_response_msg = msg
        return code, msg

    @property
    def last_response_text(self) -> str | None:
        if self.last_response_msg is None:
            return None
        try:
            return self.last_response_msg.decode("utf-8", errors="replace")
        except Exception:
            return str(self.last_response_msg)
```

- [ ] **Step 3: Replace `_send_async` and `send_email`**

Replace the existing `_send_async` and `send_email` functions with:

```python
def _send_async(app, app_config: dict, to: str, subject: str, html: str, log_id: int):
    """Send email in a background thread and update the log row.

    Receives the Flask app object so it can establish an app context for the
    db.session updates — threading.Thread loses the request context.
    """
    from app.models import EmailLog  # local import to avoid circular

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = app_config["MAIL_SENDER"]
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        with _CapturingSMTP(app_config["SMTP_HOST"], app_config["SMTP_PORT"]) as server:
            server.starttls()
            server.login(app_config["SMTP_USER"], app_config["SMTP_PASSWORD"])
            server.sendmail(app_config["MAIL_SENDER"], to, msg.as_string())
            smtp_response = (
                f"{server.last_response_code} {server.last_response_text}"
                if server.last_response_code
                else None
            )

        brevo_id = _extract_brevo_message_id(smtp_response)
        logger.info("Email sent to %s: %s (brevo_id=%s)", to, subject, brevo_id)

        with app.app_context():
            EmailLog.mark_sent(log_id, smtp_response or "", brevo_id)

    except Exception as e:
        logger.exception("Failed to send email to %s", to)
        try:
            with app.app_context():
                EmailLog.mark_failed(log_id, repr(e))
        except Exception:
            logger.exception("Also failed to mark email_log %d as failed", log_id)


def send_email(
    to: str,
    subject: str,
    html: str,
    *,
    email_type: str,
    user_id: int | None = None,
    metadata: dict | None = None,
) -> int:
    """Queue an email send and create an EmailLog row.

    Returns the log_id so callers can correlate.
    """
    from app.models import EmailLog  # local import

    log = EmailLog.create_queued(
        recipient_email=to,
        type=email_type,
        subject=subject,
        user_id=user_id,
        metadata=metadata,
    )

    config = {
        "SMTP_HOST": current_app.config["SMTP_HOST"],
        "SMTP_PORT": current_app.config["SMTP_PORT"],
        "SMTP_USER": current_app.config["SMTP_USER"],
        "SMTP_PASSWORD": current_app.config["SMTP_PASSWORD"],
        "MAIL_SENDER": current_app.config["MAIL_SENDER"],
    }
    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_send_async,
        args=(app, config, to, subject, html, log.id),
    )
    thread.daemon = True
    thread.start()
    return log.id
```

- [ ] **Step 4: Update each sender to pass email_type / user_id / metadata**

Replace function signatures and their `send_email(...)` calls.

`send_password_reset_email`:

```python
def send_password_reset_email(to: str, reset_url: str, *, user_id: int | None = None):
    """Send a password reset email."""
    content = f"""\
      <!-- ... existing content unchanged ... -->"""

    send_email(
        to,
        "Reset Password - Playfast",
        _base_template(content),
        email_type="password_reset",
        user_id=user_id,
    )
```

`send_verification_email`:

```python
def send_verification_email(to: str, verify_url: str, *, user_id: int | None = None, token_id: int | None = None):
    """Send an email verification email after registration."""
    content = f"""\
      <!-- ... existing content unchanged ... -->"""

    send_email(
        to,
        "Verifikasi Email - Playfast",
        _base_template(content),
        email_type="verification",
        user_id=user_id,
        metadata={"token_id": token_id} if token_id else None,
    )
```

`send_game_request_fulfilled_email`:

```python
def send_game_request_fulfilled_email(
    to: str,
    game_name: str,
    game_url: str,
    header_image: str | None = None,
    *,
    user_id: int | None = None,
    game_id: int | None = None,
):
    # ... existing body unchanged ...
    send_email(
        to,
        f"Game request kamu sudah ada — {game_name}",
        _base_template(content),
        email_type="game_request_fulfilled",
        user_id=user_id,
        metadata={"game_name": game_name, "game_id": game_id},
    )
```

`send_order_welcome_email`:

```python
def send_order_welcome_email(to: str, game_name: str, play_url: str, *, user_id: int | None = None, order_id: int | None = None):
    # ... existing body unchanged ...
    send_email(
        to,
        f"Pesanan aktif: {game_name} — cara main yang benar",
        _base_template(content),
        email_type="order_welcome",
        user_id=user_id,
        metadata={"game_name": game_name, "order_id": order_id},
    )
```

`send_subscription_welcome_email`:

```python
def send_subscription_welcome_email(to: str, plan_label: str, store_url: str, *, user_id: int | None = None, subscription_id: int | None = None):
    # ... existing body unchanged ...
    send_email(
        to,
        "Subscription aktif — cara main aman di Playfast",
        _base_template(content),
        email_type="subscription_welcome",
        user_id=user_id,
        metadata={"plan_label": plan_label, "subscription_id": subscription_id},
    )
```

`send_account_flag_notification`:

```python
def send_account_flag_notification(
    *,
    flag_id: int,
    user_email: str,
    account_name: str,
    game_name: str | None,
    reason: str,
    description: str | None,
    order_id: int | None,
    reporter_user_id: int | None = None,
):
    # ... existing body unchanged ...
    subject = f"[Account Flag] {reason_label} — {account_name}"
    send_email(
        SUPPORT_EMAIL,
        subject,
        _base_template(content),
        email_type="account_flag",
        user_id=None,  # recipient is support@, not the reporter
        metadata={
            "flag_id": flag_id,
            "reporter_email": user_email,
            "reporter_user_id": reporter_user_id,
            "account_name": account_name,
            "game_name": game_name,
            "order_id": order_id,
            "reason": reason,
        },
    )
```

- [ ] **Step 5: Update callers to pass user_id / token_id**

Find every caller of these senders and add the new kwargs. Run:

```bash
grep -rn "send_verification_email\|send_password_reset_email\|send_order_welcome_email\|send_subscription_welcome_email\|send_game_request_fulfilled_email\|send_account_flag_notification" backend/app --include="*.py"
```

For each call site:

- `backend/app/auth/routes.py:74` (register flow):
  ```python
  send_verification_email(email, verify_url, user_id=user.id, token_id=token.id)
  ```
- `backend/app/auth/routes.py:318` (resend):
  ```python
  send_verification_email(user.email, verify_url, user_id=user.id, token_id=token.id)
  ```
- Wherever `send_password_reset_email` is called: add `user_id=user.id`
- `send_order_welcome_email` and `send_subscription_welcome_email`: add `user_id=` and the relevant order/sub id
- `send_game_request_fulfilled_email`: add `user_id=` and `game_id=`
- `send_account_flag_notification`: add `reporter_user_id=` (the user who filed the flag)

For each call site, make the change and verify the call signature matches the new signature.

- [ ] **Step 6: Smoke test — registration flow**

```bash
cd backend && python run.py  # ensure it starts
```

Then in another shell:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest+log@playfast.id","password":"testtest"}'
```

Then verify in psql:

```sql
SELECT id, recipient_email, type, status, brevo_message_id, error_message
FROM email_logs
WHERE recipient_email = 'smoketest+log@playfast.id'
ORDER BY id DESC LIMIT 1;
```

Expected: status `sent` (or `queued` if very fast — re-query after 5s), `brevo_message_id` populated if Brevo is the SMTP and the regex matched, otherwise NULL.

Cleanup:
```sql
DELETE FROM users WHERE email = 'smoketest+log@playfast.id';
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/email_service.py backend/app/auth/routes.py backend/app/store/routes.py backend/app/game_requests/routes.py backend/app/admin/routes.py
git commit -m "feat(email-logs): log lifecycle for every transactional send"
```

(Adjust `git add` list to only files actually modified — `grep` output in Step 5 tells you which.)

---

## Task 4: Brevo webhook endpoint

**Files:**
- Create: `backend/app/webhooks/__init__.py` (empty)
- Create: `backend/app/webhooks/routes.py`
- Modify: `backend/app/__init__.py` (register blueprint)
- Modify: `backend/app/config.py` (add `BREVO_WEBHOOK_SECRET`)

- [ ] **Step 1: Add config var**

In `backend/app/config.py`, in each config class that loads env vars, add:

```python
BREVO_WEBHOOK_SECRET = os.getenv("BREVO_WEBHOOK_SECRET", "")
```

Place it next to other email/SMTP config. If `config.py` uses one shared base class, add it there only.

- [ ] **Step 2: Add `.env.production` entry placeholder**

Edit `.env.production` (currently in git status as modified) and add:

```
BREVO_WEBHOOK_SECRET=
```

Leave value blank; will be filled during Brevo dashboard setup post-deploy. Do not commit a real secret to git.

- [ ] **Step 3: Create webhooks package**

Create `backend/app/webhooks/__init__.py` as an empty file:

```python
```

- [ ] **Step 4: Create webhook handler**

Create `backend/app/webhooks/routes.py`:

```python
"""Inbound webhooks from third parties (currently: Brevo email events)."""

import logging
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models import EmailLog

logger = logging.getLogger(__name__)

webhooks_bp = Blueprint("webhooks", __name__, url_prefix="/api/webhooks")


def _parse_brevo_date(s: str | None) -> datetime | None:
    """Brevo sends ISO 8601 with timezone offset, e.g. '2026-05-15T14:32:01+00:00'."""
    if not s:
        return None
    try:
        # Python 3.11+ handles '+HH:MM' offsets natively
        return datetime.fromisoformat(s)
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
    if provided != expected:
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

    # Brevo wraps message-id in angle brackets sometimes; normalize.
    message_id = message_id.strip().lstrip("<").rstrip(">")

    log = EmailLog.query.filter_by(brevo_message_id=message_id).first()
    if not log:
        logger.info("Brevo webhook for unknown message-id %s (event=%s)", message_id, event)
        return jsonify({"status": "ignored", "reason": "unknown message-id"}), 200

    applied = log.apply_brevo_event(event, event_at, reason)
    return jsonify({"status": "applied" if applied else "skipped", "event": event}), 200
```

- [ ] **Step 5: Register blueprint**

In `backend/app/__init__.py`, alongside the other blueprint imports (around line 69-85), add:

```python
    from app.webhooks.routes import webhooks_bp
```

And next to the other `app.register_blueprint(...)` calls:

```python
    app.register_blueprint(webhooks_bp)
```

- [ ] **Step 6: Smoke test — webhook with sample payload**

Set a temp secret:

```bash
export BREVO_WEBHOOK_SECRET=test-secret-abc
cd backend && python run.py
```

Insert a fake log row to match against:

```bash
python -c "
from app import create_app
from app.models import EmailLog
app = create_app()
with app.app_context():
    log = EmailLog.create_queued(
        recipient_email='wh-test@example.com',
        type=EmailLog.TYPE_VERIFICATION,
        subject='Webhook smoke',
    )
    EmailLog.mark_sent(log.id, '250 OK queued as <wh-msg-1>', 'wh-msg-1')
    print('Log id:', log.id)
"
```

Send a delivered event:

```bash
curl -X POST http://localhost:5000/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -H "X-Brevo-Secret: test-secret-abc" \
  -d '{"event":"delivered","message-id":"wh-msg-1","date":"2026-05-15T14:32:01+00:00"}'
```

Expected: `{"status":"applied","event":"delivered"}`. Verify in psql:

```sql
SELECT status, brevo_event_at FROM email_logs WHERE brevo_message_id = 'wh-msg-1';
```

Expected: status `delivered`, `brevo_event_at` populated.

Test idempotency — send same event again:

```bash
curl -X POST http://localhost:5000/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -H "X-Brevo-Secret: test-secret-abc" \
  -d '{"event":"delivered","message-id":"wh-msg-1","date":"2026-05-15T14:32:01+00:00"}'
```

Expected: `{"status":"skipped","event":"delivered"}` (because event_at <= brevo_event_at).

Test bounce:

```bash
curl -X POST http://localhost:5000/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -H "X-Brevo-Secret: test-secret-abc" \
  -d '{"event":"hard_bounce","message-id":"wh-msg-1","date":"2026-05-15T15:00:00+00:00","reason":"mailbox does not exist"}'
```

Expected: status now `bounced`, error_message = `mailbox does not exist`.

Test auth failure:

```bash
curl -X POST http://localhost:5000/api/webhooks/brevo \
  -H "Content-Type: application/json" \
  -H "X-Brevo-Secret: wrong" \
  -d '{"event":"delivered","message-id":"wh-msg-1"}'
```

Expected: 401.

Cleanup:
```bash
python -c "
from app import create_app
from app.extensions import db
from app.models import EmailLog
app = create_app()
with app.app_context():
    EmailLog.query.filter_by(recipient_email='wh-test@example.com').delete()
    db.session.commit()
"
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/webhooks/__init__.py backend/app/webhooks/routes.py backend/app/__init__.py backend/app/config.py .env.production
git commit -m "feat(email-logs): Brevo webhook endpoint with shared-secret auth"
```

---

## Task 5: Admin list + detail endpoints

**Files:**
- Modify: `backend/app/admin/routes.py` (append new section at end)

- [ ] **Step 1: Add imports**

If not already present, at top of `backend/app/admin/routes.py`:

```python
from app.models import EmailLog  # add to existing models import
```

- [ ] **Step 2: List endpoint**

Append to `backend/app/admin/routes.py`:

```python
# ---------------------------------------------------------------------------
# Email delivery tracking
# ---------------------------------------------------------------------------


_EMAIL_LOG_PER_PAGE_DEFAULT = 50
_EMAIL_LOG_PER_PAGE_MAX = 200


@admin_bp.route("/email-logs", methods=["GET"])
@admin_required
def list_email_logs():
    """Paginated list with filters.

    Query params:
      - recipient: substring match on recipient_email
      - type: comma-separated email types
      - status: comma-separated statuses
      - user_id: filter to a single user
      - from, to: ISO date strings for created_at range
      - failed_only: '1' to restrict to failed/bounced/spam/blocked/invalid_email
      - page, per_page
    """
    q = EmailLog.query

    recipient = (request.args.get("recipient") or "").strip().lower()
    if recipient:
        q = q.filter(EmailLog.recipient_email.ilike(f"%{recipient}%"))

    types = [t for t in (request.args.get("type") or "").split(",") if t]
    if types:
        q = q.filter(EmailLog.type.in_(types))

    statuses = [s for s in (request.args.get("status") or "").split(",") if s]
    if statuses:
        q = q.filter(EmailLog.status.in_(statuses))

    user_id_param = request.args.get("user_id")
    if user_id_param:
        try:
            q = q.filter(EmailLog.user_id == int(user_id_param))
        except ValueError:
            return jsonify({"error": "invalid user_id"}), 400

    from_str = request.args.get("from")
    if from_str:
        try:
            q = q.filter(EmailLog.created_at >= datetime.fromisoformat(from_str))
        except ValueError:
            return jsonify({"error": "invalid 'from' date"}), 400
    to_str = request.args.get("to")
    if to_str:
        try:
            q = q.filter(EmailLog.created_at <= datetime.fromisoformat(to_str))
        except ValueError:
            return jsonify({"error": "invalid 'to' date"}), 400

    if request.args.get("failed_only") == "1":
        q = q.filter(EmailLog.status.in_([
            EmailLog.STATUS_FAILED,
            EmailLog.STATUS_BOUNCED,
            EmailLog.STATUS_SOFT_BOUNCED,
            EmailLog.STATUS_SPAM,
            EmailLog.STATUS_BLOCKED,
            EmailLog.STATUS_INVALID_EMAIL,
        ]))

    page = max(1, int(request.args.get("page", 1) or 1))
    per_page = min(
        _EMAIL_LOG_PER_PAGE_MAX,
        max(1, int(request.args.get("per_page", _EMAIL_LOG_PER_PAGE_DEFAULT) or _EMAIL_LOG_PER_PAGE_DEFAULT)),
    )

    pagination = (
        q.order_by(EmailLog.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return jsonify({
        "logs": [log.to_dict() for log in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pagination.pages,
    })


@admin_bp.route("/email-logs/<int:log_id>", methods=["GET"])
@admin_required
def get_email_log(log_id: int):
    log = db.session.get(EmailLog, log_id)
    if not log:
        return jsonify({"error": "Not found"}), 404
    data = log.to_dict()
    # Include recipient user info if available
    if log.user_id and log.user:
        data["user"] = {
            "id": log.user.id,
            "email": log.user.email,
            "email_verified": log.user.email_verified,
        }
    return jsonify(data)
```

- [ ] **Step 3: Smoke test**

Start backend, then:

```bash
# Get admin auth cookie first via login...
curl -X GET "http://localhost:5000/api/admin/email-logs?per_page=5" \
  --cookie cookies.txt
```

Expected: JSON with `logs` (up to 5), `total`, `pages` fields.

```bash
curl -X GET "http://localhost:5000/api/admin/email-logs?failed_only=1" --cookie cookies.txt
curl -X GET "http://localhost:5000/api/admin/email-logs?type=verification" --cookie cookies.txt
curl -X GET "http://localhost:5000/api/admin/email-logs?recipient=playfast" --cookie cookies.txt
```

Expected: filters apply.

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat(email-logs): admin list + detail endpoints"
```

---

## Task 6: Admin resend endpoint

**Files:**
- Modify: `backend/app/admin/routes.py`

- [ ] **Step 1: Add resend handler**

Append to the email-logs section in `backend/app/admin/routes.py`:

```python
_RESEND_COOLDOWN_SECONDS = 60


@admin_bp.route("/email-logs/<int:log_id>/resend", methods=["POST"])
@admin_required
def resend_email_log(log_id: int):
    """Re-trigger a previously-sent email using its metadata.

    Rate-limited: 60s cooldown per (user_id, type) — same as user-facing
    /auth/resend-verification.

    Supports only the types we know how to regenerate. For unsupported types
    (e.g. account_flag, where metadata refers to flag state that may have
    changed), returns 400.
    """
    log = db.session.get(EmailLog, log_id)
    if not log:
        return jsonify({"error": "Not found"}), 404

    # Cooldown check
    cooldown_cutoff = datetime.now(timezone.utc) - timedelta(seconds=_RESEND_COOLDOWN_SECONDS)
    recent = (
        EmailLog.query
        .filter(EmailLog.type == log.type)
        .filter(EmailLog.recipient_email == log.recipient_email)
        .filter(EmailLog.created_at > cooldown_cutoff)
        .filter(EmailLog.id != log.id)
        .first()
    )
    if recent:
        return jsonify({
            "error": f"Tunggu {_RESEND_COOLDOWN_SECONDS} detik sebelum kirim ulang.",
            "retry_after": _RESEND_COOLDOWN_SECONDS,
        }), 429

    # Lazy imports to avoid circular
    from app.email_service import (
        send_verification_email,
        send_password_reset_email,
        send_order_welcome_email,
        send_subscription_welcome_email,
        send_game_request_fulfilled_email,
    )
    from app.models import EmailVerificationToken, PasswordResetToken, Game

    metadata = log.log_metadata or {}
    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")

    if log.type == EmailLog.TYPE_VERIFICATION:
        if not log.user_id:
            return jsonify({"error": "No user_id on log"}), 400
        user = db.session.get(User, log.user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        if user.email_verified:
            return jsonify({"error": "Email already verified"}), 400
        token = EmailVerificationToken.create_for_user(user.id)
        db.session.commit()
        verify_url = f"{frontend_url}/verify-email?token={token.token}"
        send_verification_email(user.email, verify_url, user_id=user.id, token_id=token.id)

    elif log.type == EmailLog.TYPE_PASSWORD_RESET:
        if not log.user_id:
            return jsonify({"error": "No user_id on log"}), 400
        user = db.session.get(User, log.user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        token = PasswordResetToken.create_for_user(user.id)
        db.session.commit()
        reset_url = f"{frontend_url}/reset-password?token={token.token}"
        send_password_reset_email(user.email, reset_url, user_id=user.id)

    elif log.type == EmailLog.TYPE_ORDER_WELCOME:
        game_name = metadata.get("game_name") or "(game)"
        order_id = metadata.get("order_id")
        play_url = f"{frontend_url}/orders/{order_id}" if order_id else frontend_url
        send_order_welcome_email(
            log.recipient_email, game_name, play_url,
            user_id=log.user_id, order_id=order_id,
        )

    elif log.type == EmailLog.TYPE_SUBSCRIPTION_WELCOME:
        plan_label = metadata.get("plan_label") or "Premium"
        subscription_id = metadata.get("subscription_id")
        store_url = f"{frontend_url}/store"
        send_subscription_welcome_email(
            log.recipient_email, plan_label, store_url,
            user_id=log.user_id, subscription_id=subscription_id,
        )

    elif log.type == EmailLog.TYPE_GAME_REQUEST_FULFILLED:
        game_name = metadata.get("game_name") or "(game)"
        game_id = metadata.get("game_id")
        # Try to resolve a real game URL + header image; fall back if game gone
        header_image = None
        if game_id:
            game = db.session.get(Game, game_id)
            if game:
                header_image = game.custom_header_image or game.header_image
        game_url = f"{frontend_url}/games/{game_id}" if game_id else frontend_url
        send_game_request_fulfilled_email(
            log.recipient_email, game_name, game_url, header_image,
            user_id=log.user_id, game_id=game_id,
        )

    else:
        return jsonify({"error": f"Resend not supported for type '{log.type}'"}), 400

    return jsonify({"message": "Email queued for resend"})
```

- [ ] **Step 2: Smoke test**

Trigger a resend on an existing verification log (use a real user-id from psql first):

```bash
# Find a recent verification log id
psql -c "SELECT id, user_id, recipient_email FROM email_logs WHERE type='verification' ORDER BY id DESC LIMIT 5;"
```

```bash
curl -X POST "http://localhost:5000/api/admin/email-logs/<id>/resend" --cookie cookies.txt
```

Expected: `{"message":"Email queued for resend"}`. Verify a new row appears in `email_logs` for that user with the same recipient/type and status `queued` → `sent`.

Then immediately resend again:

```bash
curl -X POST "http://localhost:5000/api/admin/email-logs/<id>/resend" --cookie cookies.txt
```

Expected: 429 with `retry_after`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat(email-logs): admin resend endpoint with cooldown"
```

---

## Task 7: Admin manual mark-verified endpoint

**Files:**
- Modify: `backend/app/admin/routes.py`

- [ ] **Step 1: Add endpoint**

Append to the email-logs section:

```python
@admin_bp.route("/users/<int:user_id>/mark-email-verified", methods=["POST"])
@admin_required
def admin_mark_email_verified(user_id: int):
    """Manually override email_verified=True for a user.

    Useful when delivery is broken on the recipient side (typo'd domain, mail
    server blocking us) but the user is provably legit (e.g. already paid).
    Logs the action with the admin's id for auditability.
    """
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "User not found"}), 404
    if target.email_verified:
        return jsonify({"message": "Already verified"}), 200

    target.email_verified = True
    db.session.commit()

    admin_id = int(get_jwt_identity())
    logger.warning(
        "admin %d manually marked user %d (%s) as email_verified",
        admin_id, target.id, target.email,
    )
    return jsonify({"message": "Email marked as verified", "user": target.to_dict()})
```

- [ ] **Step 2: Smoke test**

Find an unverified user:

```bash
psql -c "SELECT id, email, email_verified FROM users WHERE email_verified = FALSE LIMIT 3;"
```

```bash
curl -X POST "http://localhost:5000/api/admin/users/<id>/mark-email-verified" --cookie cookies.txt
```

Expected: `{"message":"Email marked as verified",...}`. Verify in psql that `email_verified = TRUE`. Also check the backend logs contain a WARNING line about the manual override.

Idempotency check — repeat:

```bash
curl -X POST "http://localhost:5000/api/admin/users/<id>/mark-email-verified" --cookie cookies.txt
```

Expected: `{"message":"Already verified"}` 200.

- [ ] **Step 3: Commit**

```bash
git add backend/app/admin/routes.py
git commit -m "feat(email-logs): admin manual mark-verified endpoint"
```

---

## Task 8: Frontend API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add types**

Near other admin-related types in `frontend/src/lib/api.ts`, add:

```typescript
export type EmailLogStatus =
  | 'queued' | 'sent' | 'failed'
  | 'delivered' | 'bounced' | 'soft_bounced'
  | 'spam' | 'blocked' | 'invalid_email' | 'deferred'

export type EmailLogType =
  | 'verification' | 'password_reset' | 'order_welcome'
  | 'subscription_welcome' | 'game_request_fulfilled' | 'account_flag'

export interface EmailLog {
  id: number
  user_id: number | null
  recipient_email: string
  type: EmailLogType
  subject: string
  status: EmailLogStatus
  smtp_response: string | null
  brevo_message_id: string | null
  error_message: string | null
  metadata: Record<string, any> | null
  created_at: string
  sent_at: string | null
  brevo_event_at: string | null
}

export interface EmailLogDetail extends EmailLog {
  user?: { id: number; email: string; email_verified: boolean }
}

export interface EmailLogsListResponse {
  logs: EmailLog[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface EmailLogsFilters {
  recipient?: string
  type?: EmailLogType[]
  status?: EmailLogStatus[]
  user_id?: number
  from?: string
  to?: string
  failed_only?: boolean
  page?: number
  per_page?: number
}
```

- [ ] **Step 2: Add methods to `adminApi`**

Inside the `adminApi` object (around line 1153), add new methods at the end (before the closing `}`):

```typescript
  listEmailLogs(filters: EmailLogsFilters = {}) {
    const sp = new URLSearchParams()
    if (filters.recipient) sp.set('recipient', filters.recipient)
    if (filters.type?.length) sp.set('type', filters.type.join(','))
    if (filters.status?.length) sp.set('status', filters.status.join(','))
    if (filters.user_id != null) sp.set('user_id', String(filters.user_id))
    if (filters.from) sp.set('from', filters.from)
    if (filters.to) sp.set('to', filters.to)
    if (filters.failed_only) sp.set('failed_only', '1')
    if (filters.page) sp.set('page', String(filters.page))
    if (filters.per_page) sp.set('per_page', String(filters.per_page))
    return request<EmailLogsListResponse>(`/api/admin/email-logs?${sp.toString()}`)
  },

  getEmailLog(id: number) {
    return request<EmailLogDetail>(`/api/admin/email-logs/${id}`)
  },

  resendEmailLog(id: number) {
    return request<{ message: string }>(`/api/admin/email-logs/${id}/resend`, { method: 'POST' })
  },

  markEmailVerified(userId: number) {
    return request<{ message: string }>(`/api/admin/users/${userId}/mark-email-verified`, { method: 'POST' })
  },
```

- [ ] **Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(email-logs): frontend API types + adminApi methods"
```

---

## Task 9: Detail dialog component

**Files:**
- Create: `frontend/src/views/admin/EmailLogDetailDialog.tsx`

- [ ] **Step 1: Build the component**

Create `frontend/src/views/admin/EmailLogDetailDialog.tsx`:

```typescript
'use client'

import { useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'

import { adminApi } from '@/lib/api'
import type { EmailLogStatus } from '@/lib/api'

interface Props {
  logId: number | null
  open: boolean
  onClose: () => void
}

const STATUS_COLOR: Record<EmailLogStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  queued: 'default',
  sent: 'info',
  failed: 'error',
  delivered: 'success',
  bounced: 'error',
  soft_bounced: 'warning',
  spam: 'error',
  blocked: 'error',
  invalid_email: 'error',
  deferred: 'warning',
}

const TYPE_LABEL: Record<string, string> = {
  verification: 'Verifikasi Email',
  password_reset: 'Reset Password',
  order_welcome: 'Order Welcome',
  subscription_welcome: 'Subscription Welcome',
  game_request_fulfilled: 'Game Request Fulfilled',
  account_flag: 'Account Flag',
}

const formatTs = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID') : '—')

export default function EmailLogDetailDialog({ logId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-email-log', logId],
    queryFn: () => adminApi.getEmailLog(logId!),
    enabled: open && logId != null,
  })

  const resendMutation = useMutation({
    mutationFn: () => adminApi.resendEmailLog(logId!),
    onSuccess: res => {
      setResendMsg(res.message)
      setResendError(null)
      queryClient.invalidateQueries({ queryKey: ['admin-email-logs'] })
    },
    onError: (err: any) => {
      setResendError(err?.message || 'Gagal kirim ulang')
      setResendMsg(null)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: () => adminApi.markEmailVerified(data!.user!.id),
    onSuccess: res => {
      setVerifyMsg(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-email-log', logId] })
      queryClient.invalidateQueries({ queryKey: ['admin-user-profile'] })
    },
  })

  if (!open) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>
        {data ? `Email Log #${data.id}` : 'Email Log'}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
        {isError && <Alert severity='error'>{(error as any)?.message || 'Gagal memuat log'}</Alert>}
        {data && (
          <Stack spacing={2}>
            <Box>
              <Typography variant='caption' color='text.secondary'>Status</Typography>
              <Box><Chip size='small' label={data.status} color={STATUS_COLOR[data.status]} /></Box>
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Type</Typography>
              <Typography>{TYPE_LABEL[data.type] || data.type}</Typography>
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Recipient</Typography>
              <Typography sx={{ fontFamily: 'monospace' }}>{data.recipient_email}</Typography>
              {data.user && (
                <Typography variant='caption' color='text.secondary'>
                  User #{data.user.id} · {data.user.email_verified ? 'verified' : 'not verified'}
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant='caption' color='text.secondary'>Subject</Typography>
              <Typography>{data.subject}</Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant='caption' color='text.secondary'>Timeline</Typography>
              <Typography variant='body2'>queued: {formatTs(data.created_at)}</Typography>
              <Typography variant='body2'>sent: {formatTs(data.sent_at)}</Typography>
              <Typography variant='body2'>Brevo event: {formatTs(data.brevo_event_at)}</Typography>
            </Box>

            {data.smtp_response && (
              <Box>
                <Typography variant='caption' color='text.secondary'>SMTP response</Typography>
                <Typography component='pre' sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', m: 0 }}>
                  {data.smtp_response}
                </Typography>
              </Box>
            )}

            {data.brevo_message_id && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Brevo message id</Typography>
                <Typography sx={{ fontFamily: 'monospace' }}>{data.brevo_message_id}</Typography>
              </Box>
            )}

            {data.error_message && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Error / reason</Typography>
                <Alert severity='error' sx={{ mt: 0.5 }}>{data.error_message}</Alert>
              </Box>
            )}

            {data.metadata && Object.keys(data.metadata).length > 0 && (
              <Box>
                <Typography variant='caption' color='text.secondary'>Metadata</Typography>
                <Typography component='pre' sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', m: 0 }}>
                  {JSON.stringify(data.metadata, null, 2)}
                </Typography>
              </Box>
            )}

            {resendMsg && <Alert severity='success'>{resendMsg}</Alert>}
            {resendError && <Alert severity='error'>{resendError}</Alert>}
            {verifyMsg && <Alert severity='success'>{verifyMsg}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {data && (
          <Button
            color='warning'
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
          >
            Kirim Ulang
          </Button>
        )}
        {data && data.type === 'verification' && data.user && !data.user.email_verified && (
          <Button
            color='success'
            onClick={() => {
              if (window.confirm(`Tandai email ${data.user!.email} sebagai verified secara manual?`)) {
                verifyMutation.mutate()
              }
            }}
            disabled={verifyMutation.isPending}
          >
            Mark Verified
          </Button>
        )}
        <Button onClick={onClose}>Tutup</Button>
      </DialogActions>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/admin/EmailLogDetailDialog.tsx
git commit -m "feat(email-logs): detail dialog with resend + mark-verified actions"
```

---

## Task 10: Global page `/admin/email-logs`

**Files:**
- Create: `frontend/src/views/admin/AdminEmailLogsPage.tsx`
- Create: `frontend/src/app/(dashboard)/admin/email-logs/page.tsx`
- Modify: `frontend/src/components/layout/horizontal/HorizontalMenu.tsx` (add menu item)

- [ ] **Step 1: Create the view**

Create `frontend/src/views/admin/AdminEmailLogsPage.tsx`:

```typescript
'use client'

import { useMemo, useState } from 'react'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TablePagination from '@mui/material/TablePagination'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'

import { adminApi } from '@/lib/api'
import type { EmailLogStatus, EmailLogType } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import EmailLogDetailDialog from './EmailLogDetailDialog'

const STATUS_COLOR: Record<EmailLogStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  queued: 'default',
  sent: 'info',
  failed: 'error',
  delivered: 'success',
  bounced: 'error',
  soft_bounced: 'warning',
  spam: 'error',
  blocked: 'error',
  invalid_email: 'error',
  deferred: 'warning',
}

const TYPE_OPTIONS: { value: EmailLogType; label: string }[] = [
  { value: 'verification', label: 'Verifikasi Email' },
  { value: 'password_reset', label: 'Reset Password' },
  { value: 'order_welcome', label: 'Order Welcome' },
  { value: 'subscription_welcome', label: 'Subscription Welcome' },
  { value: 'game_request_fulfilled', label: 'Game Request Fulfilled' },
  { value: 'account_flag', label: 'Account Flag' },
]

const formatTs = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID') : '—')

export default function AdminEmailLogsPage() {
  const { user } = useAuth()
  const [recipient, setRecipient] = useState('')
  const [typeFilter, setTypeFilter] = useState<EmailLogType | ''>('')
  const [failedOnly, setFailedOnly] = useState(false)
  const [page, setPage] = useState(0) // MUI 0-indexed
  const [perPage, setPerPage] = useState(50)
  const [openId, setOpenId] = useState<number | null>(null)

  const filters = useMemo(() => ({
    recipient: recipient || undefined,
    type: typeFilter ? [typeFilter] : undefined,
    failed_only: failedOnly || undefined,
    page: page + 1,
    per_page: perPage,
  }), [recipient, typeFilter, failedOnly, page, perPage])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-email-logs', filters],
    queryFn: () => adminApi.listEmailLogs(filters),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-4'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>Email Logs</Typography>
        <Typography variant='body2' color='text.secondary'>
          Lacak status kirim setiap email transactional. Klik row untuk detail dan tombol kirim ulang.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size='small'
              label='Recipient'
              placeholder='email atau substring'
              value={recipient}
              onChange={e => { setRecipient(e.target.value); setPage(0) }}
              sx={{ minWidth: 240 }}
              InputProps={{
                endAdornment: recipient && (
                  <InputAdornment position='end'>
                    <IconButton size='small' onClick={() => setRecipient('')}><i className='tabler-x' /></IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              size='small'
              select
              label='Type'
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value as EmailLogType | ''); setPage(0) }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value=''>Semua</MenuItem>
              {TYPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={failedOnly} onChange={e => { setFailedOnly(e.target.checked); setPage(0) }} />}
              label='Hanya gagal/bounce'
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {isError && <Alert severity='error' sx={{ m: 2 }}>{(error as any)?.message || 'Gagal memuat'}</Alert>}
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Recipient</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={5}><Skeleton variant='text' /></TableCell>
                  </TableRow>
                ))}
                {data?.logs.map(log => (
                  <TableRow
                    key={log.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setOpenId(log.id)}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTs(log.created_at)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{log.recipient_email}</TableCell>
                    <TableCell>{log.type}</TableCell>
                    <TableCell>
                      <Chip size='small' label={log.status} color={STATUS_COLOR[log.status]} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.error_message || ''}
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.logs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                      Tidak ada log yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component='div'
            count={data?.total || 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={perPage}
            onRowsPerPageChange={e => { setPerPage(parseInt(e.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[25, 50, 100, 200]}
          />
        </CardContent>
      </Card>

      <EmailLogDetailDialog
        logId={openId}
        open={openId != null}
        onClose={() => setOpenId(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create App Router page**

Create directory and file: `frontend/src/app/(dashboard)/admin/email-logs/page.tsx`

```typescript
import type { Metadata } from 'next'

import AdminEmailLogsPage from '@/views/admin/AdminEmailLogsPage'

export const metadata: Metadata = { title: 'Email Logs - Playfast Admin' }

export default function Page() {
  return <AdminEmailLogsPage />
}
```

- [ ] **Step 3: Add menu item**

In `frontend/src/components/layout/horizontal/HorizontalMenu.tsx`, inside the `Sistem` SubMenu (around line 167), add a new MenuItem before the `Settings` entry:

```tsx
              <MenuItem href='/admin/email-logs' icon={<i className='tabler-mail-search' />}>
                Email Logs
              </MenuItem>
```

The whole Sistem block becomes:

```tsx
            <SubMenu label='Sistem' icon={<i className='tabler-settings' />}>
              <MenuItem href='/admin/reports' icon={<i className='tabler-report-money' />}>
                Laporan Transaksi
              </MenuItem>
              <MenuItem href='/admin/audit' icon={<i className='tabler-file-search' />}>
                Log Audit
              </MenuItem>
              <MenuItem href='/admin/email-logs' icon={<i className='tabler-mail-search' />}>
                Email Logs
              </MenuItem>
              <MenuItem href='/admin/settings' icon={<i className='tabler-settings-2' />}>
                Settings
              </MenuItem>
            </SubMenu>
```

- [ ] **Step 4: Type check + start dev server**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

Start dev server (frontend usually runs alongside backend):

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/admin/email-logs` while logged in as admin. Verify:

- Page renders with table + filters
- Table shows recent logs from DB (use the smoketest entries created earlier, or any real logs from the registration flow)
- Filter by Type works
- "Hanya gagal/bounce" toggle works
- Clicking a row opens the detail dialog
- "Kirim Ulang" button visible inside the dialog

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin/AdminEmailLogsPage.tsx frontend/src/app/\(dashboard\)/admin/email-logs/page.tsx frontend/src/components/layout/horizontal/HorizontalMenu.tsx
git commit -m "feat(email-logs): /admin/email-logs page with filters + detail dialog"
```

---

## Task 11: "Email History" tab in user detail page

**Files:**
- Modify: `frontend/src/views/admin/AdminUserDetailPage.tsx`

- [ ] **Step 1: Read the tabPanels structure**

Re-read `frontend/src/views/admin/AdminUserDetailPage.tsx` around lines 149-260 to confirm tab indices. The current panels are:

```
0: Overview
1: Orders
2: Subscriptions
3: OTP History
4: Assignments
5: Misc
```

We'll add a new tab "Email History" at index 6.

- [ ] **Step 2: Add the tab label and a query**

At the top of the component (in the imports section), add:

```typescript
import { adminApi } from '@/lib/api'
import EmailLogDetailDialog from './EmailLogDetailDialog'
```

(Adjust to match the import style already in the file — `adminApi` should already be imported.)

Inside the component, after the existing `useState` for `otpPage`, add:

```typescript
  const [emailLogPage, setEmailLogPage] = useState(1)
  const [emailLogOpenId, setEmailLogOpenId] = useState<number | null>(null)
```

After the existing `otpData` query, add:

```typescript
  const { data: emailLogData, isFetching: emailLogFetching } = useQuery({
    queryKey: ['admin-user-email-logs', userId, emailLogPage],
    queryFn: () => adminApi.listEmailLogs({ user_id: userId, page: emailLogPage, per_page: 50 }),
    enabled: currentUser?.role === 'admin' && Number.isFinite(userId) && tab === 6,
    placeholderData: keepPreviousData,
  })
```

Update the `tabPanels` array:

```typescript
  const tabPanels = [
    'Overview',
    `Orders (${orders.length})`,
    `Subscriptions (${subscriptions.length})`,
    `OTP History (${stats.code_request_count})`,
    `Assignments (${assignments.length})`,
    `Misc`,
    `Email History`,
  ]
```

- [ ] **Step 3: Render the panel**

Find where the other tab panels are rendered (look for `tab === 5`-style conditionals around line 320+). Following the same pattern, add a new section conditional on `tab === 6`:

```tsx
{tab === 6 && (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant='h6'>Email yang dikirim ke user ini</Typography>
        {!user.email_verified && (
          <Button
            size='small'
            color='warning'
            startIcon={<i className='tabler-mail-fast' />}
            onClick={async () => {
              // Find the most recent verification log to resend; fallback: send a generic resend via existing user resend path
              const logs = emailLogData?.logs || []
              const lastVerification = logs.find(l => l.type === 'verification')
              if (lastVerification) {
                try {
                  await adminApi.resendEmailLog(lastVerification.id)
                  setSnackMsg('Email verifikasi dikirim ulang')
                } catch (e: any) {
                  setSnackMsg(e?.message || 'Gagal kirim ulang')
                }
              } else {
                setSnackMsg('Belum ada log verifikasi — minta user register ulang atau pakai resend dari sisi user')
              }
            }}
          >
            Kirim ulang verifikasi
          </Button>
        )}
      </Box>
      <TableContainer>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {emailLogFetching && (
              <TableRow><TableCell colSpan={4}><Skeleton variant='text' /></TableCell></TableRow>
            )}
            {emailLogData?.logs.map(log => (
              <TableRow
                key={log.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => setEmailLogOpenId(log.id)}
              >
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell>{log.type}</TableCell>
                <TableCell>
                  <Chip
                    size='small'
                    label={log.status}
                    color={
                      log.status === 'delivered' || log.status === 'sent' ? 'success' :
                      log.status === 'queued' ? 'default' :
                      log.status === 'soft_bounced' || log.status === 'deferred' ? 'warning' :
                      'error'
                    }
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.error_message || ''}
                </TableCell>
              </TableRow>
            ))}
            {emailLogData && emailLogData.logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                  Belum ada email yang ter-track untuk user ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {emailLogData && emailLogData.pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
          <Button size='small' disabled={emailLogPage <= 1} onClick={() => setEmailLogPage(p => p - 1)}>Prev</Button>
          <Typography variant='body2' sx={{ alignSelf: 'center' }}>{emailLogPage} / {emailLogData.pages}</Typography>
          <Button size='small' disabled={emailLogPage >= emailLogData.pages} onClick={() => setEmailLogPage(p => p + 1)}>Next</Button>
        </Box>
      )}
    </CardContent>
  </Card>
)}

<EmailLogDetailDialog
  logId={emailLogOpenId}
  open={emailLogOpenId != null}
  onClose={() => setEmailLogOpenId(null)}
/>
```

Make sure the `EmailLogDetailDialog` render is inside the component return tree (not inside the `tab === 6` conditional — it should always be mounted so the dialog can show/hide based on its own state).

- [ ] **Step 4: Type check + manual test**

```bash
cd frontend && npx tsc --noEmit
```

Then open `/admin/users/<id>` for a user with email logs, click the "Email History" tab. Verify:

- Tab appears
- Table populated with the user's emails
- Clicking opens detail dialog
- If user not verified, "Kirim ulang verifikasi" button shows in header

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin/AdminUserDetailPage.tsx
git commit -m "feat(email-logs): Email History tab on user detail page"
```

---

## Task 12: Update spec with deployment notes + push everything

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-email-delivery-tracking-design.md`

- [ ] **Step 1: Append deployment notes**

Append to the design doc:

```markdown
## Deployment runbook (post-merge)

1. **Set webhook secret env var** on the VPS:
   ```
   BREVO_WEBHOOK_SECRET=<generate via `openssl rand -hex 24`>
   ```
   Update `.env.production` on the server and restart the backend.

2. **Configure Brevo dashboard:**
   - Login to Brevo → Transactional → Settings → Webhook
   - Add new webhook:
     - URL: `https://playfast.id/api/webhooks/brevo`
     - Events: check `Delivered`, `Hard bounce`, `Soft bounce`, `Spam`, `Blocked`, `Invalid email`, `Deferred`
     - Custom HTTP headers: `X-Brevo-Secret: <same value as env var>`

3. **Smoke test** post-deploy:
   - Register a test account with a real email — verify log appears with status `sent` then `delivered`
   - Register with an obviously invalid mailbox (e.g. `nonexistent-xyz123@gmail.com`) — verify log moves to `bounced` within ~1 min
```

- [ ] **Step 2: Commit + push everything**

```bash
git add docs/superpowers/specs/2026-05-15-email-delivery-tracking-design.md
git commit -m "docs(email-logs): deployment runbook for Brevo webhook setup"
git push origin master
```

---

## Self-Review

**Spec coverage** — walked through each section of the spec:

- Problem statement & goals: covered by Tasks 1-11 (the whole pipeline).
- `email_logs` table schema (DB layer): Task 1 + Task 2 (helpers).
- `email_service.py` refactor: Task 3.
- Brevo webhook endpoint: Task 4.
- UI (global page): Task 10. Detail modal: Task 9. User detail tab: Task 11.
- Backend routes (admin list/detail/resend, manual mark-verified, webhook): Tasks 4-7.
- Error handling (idempotent webhook, resend cooldown, manual mark-verified audit log): inline in respective tasks.
- Testing: each task has its own smoke test step. Manual smoke matches the spec's "Manual smoke test post-deploy" section. No automated tests because codebase has no pytest harness — explicit decision aligned with existing convention.
- Migration: Task 1 covers table creation + indexes.
- Open Items from spec:
  - SMTP last-response parsing → resolved in Task 3 via `_CapturingSMTP` subclass.
  - Admin audit table for mark-verified → resolved in Task 7 via `logger.warning` (no new table — keeps scope tight).
  - Stuck-queued cleanup → NOT included in this plan. Acceptable because in practice the thread daemon always either calls `mark_sent` or `mark_failed`; stuck queued only happens on hard process crash mid-thread, which is rare. If it becomes an issue, add a cron later. **This deviates from the spec's mention** — calling it out so reviewer can decide. If the user wants cleanup now, add a startup hook in Task 1 step 2 area.

**Placeholder scan**: no "TBD", "TODO", or vague instructions. Every code step shows code.

**Type consistency**:
- Backend statuses string-match between `EmailLog` constants → `BREVO_EVENT_MAP` → admin route filter list → frontend `EmailLogStatus` union → dialog `STATUS_COLOR` map. Cross-checked.
- Backend types string-match between `EmailLog` constants → email_service kwargs → frontend `EmailLogType` union → `TYPE_OPTIONS`. Cross-checked.
- `log_metadata` Python attribute / `metadata` DB column / `metadata` JSON serialization: handled by `to_dict` mapping `log_metadata` → `"metadata"` key.

**Spec deviations to surface to user before/during execution**: stuck-queued cleanup not implemented (see above).
