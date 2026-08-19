import time
import uuid
import threading
import urllib.request
import json
from typing import Dict, Any, Optional

class JobManager:
    """
    Unified, thread-safe asynchronous job tracker.
    Handles job creation, progress updates, cancellation tokens, TTL memory cleanup,
    and optional webhook callback notifications.
    """
    def __init__(self, default_ttl_seconds: int = 3600):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.cancel_events: Dict[str, threading.Event] = {}
        self.lock = threading.Lock()
        self.default_ttl_seconds = default_ttl_seconds
        
        # Start periodic TTL cleanup thread
        self.cleanup_timer = None
        self._start_periodic_cleanup()

    def _start_periodic_cleanup(self):
        def cleanup_loop():
            while True:
                time.sleep(600)  # Run cleanup every 10 minutes
                self.purge_expired_jobs()

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()

    def create_job(self, job_type: str, metadata: Optional[Dict[str, Any]] = None, callback_url: Optional[str] = None) -> str:
        job_id = f"job_{job_type}_{uuid.uuid4().hex[:8]}"
        now = time.time()
        
        with self.lock:
            self.jobs[job_id] = {
                "job_id": job_id,
                "job_type": job_type,
                "status": "pending",  # "pending" | "running" | "completed" | "failed" | "cancelled"
                "progress": 0.0,
                "result": None,
                "error": None,
                "created_at": now,
                "updated_at": now,
                "metadata": metadata or {},
                "callback_url": callback_url
            }
            self.cancel_events[job_id] = threading.Event()
            
        return job_id

    def get_cancel_event(self, job_id: str) -> Optional[threading.Event]:
        with self.lock:
            return self.cancel_events.get(job_id)

    def is_cancelled(self, job_id: str) -> bool:
        event = self.get_cancel_event(job_id)
        return event.is_set() if event else False

    def update_job(
        self,
        job_id: str,
        status: Optional[str] = None,
        progress: Optional[float] = None,
        result: Any = None,
        error: Optional[str] = None
    ):
        callback_to_fire = None
        job_snapshot = None

        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                if status is not None:
                    job["status"] = status
                if progress is not None:
                    job["progress"] = max(0.0, min(1.0, progress))
                if result is not None:
                    job["result"] = result
                if error is not None:
                    job["error"] = error
                job["updated_at"] = time.time()

                if job["status"] in ("completed", "failed", "cancelled") and job.get("callback_url"):
                    callback_to_fire = job["callback_url"]
                    job_snapshot = job.copy()

        if callback_to_fire and job_snapshot:
            self._dispatch_webhook_async(callback_to_fire, job_snapshot)

    def cancel_job(self, job_id: str) -> bool:
        with self.lock:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                if job["status"] in ("completed", "failed", "cancelled"):
                    return False  # Already reached terminal state
                
                job["status"] = "cancelled"
                job["error"] = "Job cancelled by user"
                job["updated_at"] = time.time()
                
                # Signal cancellation event to worker thread
                if job_id in self.cancel_events:
                    self.cancel_events[job_id].set()
                return True
        return False

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            if job_id in self.jobs:
                return self.jobs[job_id].copy()
        return None

    def purge_expired_jobs(self, ttl_seconds: Optional[int] = None):
        ttl = ttl_seconds or self.default_ttl_seconds
        cutoff = time.time() - ttl
        
        with self.lock:
            to_delete = []
            for j_id, job in self.jobs.items():
                if job["status"] in ("completed", "failed", "cancelled") and job["updated_at"] < cutoff:
                    to_delete.append(j_id)
            
            for j_id in to_delete:
                del self.jobs[j_id]
                if j_id in self.cancel_events:
                    del self.cancel_events[j_id]

            if to_delete:
                print(f"[JobManager] Purged {len(to_delete)} expired jobs from RAM memory cache.")

    def _dispatch_webhook_async(self, callback_url: str, payload: Dict[str, Any]):
        def fire():
            try:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    callback_url,
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    print(f"[JobManager] Webhook dispatched to {callback_url} (HTTP {resp.status})")
            except Exception as e:
                print(f"[JobManager] Failed to dispatch webhook to {callback_url}: {e}")

        threading.Thread(target=fire, daemon=True).start()

# Global JobManager instance
job_manager = JobManager()
