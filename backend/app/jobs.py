"""Simple background job runner with DB-persisted state."""

import json
import threading
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_running = False

JOB_SETTING_KEY = "_background_job"


def _get_db():
    from app.extensions import db
    from app.models import SiteSetting
    return db, SiteSetting


def _save_state(state: dict):
    db, SiteSetting = _get_db()
    setting = SiteSetting.query.filter_by(key=JOB_SETTING_KEY).first()
    value = json.dumps(state)
    if setting:
        setting.value = value
    else:
        db.session.add(SiteSetting(key=JOB_SETTING_KEY, value=value))
    db.session.commit()


def _load_state() -> dict | None:
    _, SiteSetting = _get_db()
    setting = SiteSetting.query.filter_by(key=JOB_SETTING_KEY).first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def get_current_job() -> dict | None:
    """Get current job state from DB."""
    state = _load_state()
    if not state:
        return None
    # If status is running but no thread is active, it was interrupted
    if state.get("status") == "running" and not _running:
        state["status"] = "interrupted"
        state["message"] = "Job was interrupted (server restarted). Please run again."
        _save_state(state)
    return state


def start_job(job_type: str, target, args=(), total: int = 0) -> dict | None:
    """Start a background job. Returns None if a job is already running."""
    global _running

    with _lock:
        if _running:
            return None
        _running = True

    state = {
        "job_type": job_type,
        "status": "running",
        "total": total,
        "processed": 0,
        "message": "",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "cancel_requested": False,
    }
    _save_state(state)

    thread = threading.Thread(target=_run_job, args=(state, target, args), daemon=True)
    thread.start()
    return state


def request_cancel() -> bool:
    """Mark the running job for cancellation. Returns True if a job was running."""
    if not _running:
        return False
    state = _load_state()
    if not state or state.get("status") != "running":
        return False
    state["cancel_requested"] = True
    _save_state(state)
    return True


class JobProgress:
    """Helper passed to job functions to update progress."""

    def __init__(self, state: dict):
        self._state = state
        self._counter = 0

    @property
    def processed(self):
        return self._state["processed"]

    @processed.setter
    def processed(self, value):
        self._state["processed"] = value
        self._counter += 1
        # Save to DB every 5 updates
        if self._counter % 5 == 0:
            _save_state(self._state)

    @property
    def message(self):
        return self._state["message"]

    @message.setter
    def message(self, value):
        self._state["message"] = value

    @property
    def status(self):
        return self._state["status"]

    @property
    def cancelled(self) -> bool:
        """True if an admin requested job cancellation. Workers should check
        this between iterations and break early when set."""
        # Re-load from DB on each check so the in-memory worker thread sees
        # writes from the cancel endpoint (different request thread).
        fresh = _load_state()
        if fresh and fresh.get("cancel_requested"):
            self._state["cancel_requested"] = True
            return True
        return bool(self._state.get("cancel_requested"))


def _run_job(state: dict, target, args):
    global _running
    progress = JobProgress(state)
    try:
        target(progress, *args)
        if state["status"] == "running":
            state["status"] = "cancelled" if state.get("cancel_requested") else "completed"
    except Exception as e:
        logger.exception("Background job %s failed: %s", state["job_type"], e)
        state["status"] = "failed"
        state["message"] = str(e)
    finally:
        state["finished_at"] = datetime.now(timezone.utc).isoformat()
        _save_state(state)
        _running = False
