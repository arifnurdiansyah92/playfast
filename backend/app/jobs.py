"""Simple background job runner for long-running tasks."""

import threading
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_current_job = None
_lock = threading.Lock()


class Job:
    def __init__(self, job_type: str, total: int = 0):
        self.job_type = job_type
        self.total = total
        self.processed = 0
        self.status = "running"  # running | completed | failed
        self.message = ""
        self.started_at = datetime.now(timezone.utc)
        self.finished_at = None

    def to_dict(self):
        return {
            "job_type": self.job_type,
            "status": self.status,
            "total": self.total,
            "processed": self.processed,
            "message": self.message,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }


def get_current_job() -> Job | None:
    return _current_job


def start_job(job_type: str, target, args=(), total: int = 0) -> Job | None:
    """Start a background job. Returns None if a job is already running."""
    global _current_job

    with _lock:
        if _current_job and _current_job.status == "running":
            return None
        job = Job(job_type, total)
        _current_job = job

    thread = threading.Thread(target=_run_job, args=(job, target, args), daemon=True)
    thread.start()
    return job


def _run_job(job: Job, target, args):
    try:
        target(job, *args)
        if job.status == "running":
            job.status = "completed"
    except Exception as e:
        logger.exception("Background job %s failed: %s", job.job_type, e)
        job.status = "failed"
        job.message = str(e)
    finally:
        job.finished_at = datetime.now(timezone.utc)
