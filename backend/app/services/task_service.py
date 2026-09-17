"""
Task Service — Persistent background AI task queue.

Architecture:
  - Tasks are stored in the `ai_tasks` PostgreSQL table.
  - A ThreadPoolExecutor runs worker threads that pick up 'pending' tasks,
    process them via the appropriate AI service, and store results.
  - The frontend polls GET /api/ai-tasks/{id} for status.
  - Tasks survive server restarts: any 'running' tasks found on startup are
    reset to 'pending' so they are re-processed.

Supported task_types:
  - 'jd_generation'       → generate_job_description()
  - 'resume_parse'        → parse_resume() + match_candidate_with_jd()
  - 'email_draft'         → draft_email_content()
  - 'candidate_comparison'→ compare_two_candidates_with_llm()
  - 'candidate_match'     → match_candidate_with_jd()
"""

import uuid
import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional

from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

# ── Worker configuration ──────────────────────────────────────────────────────
_POLL_INTERVAL_SECS = 3   # How often the worker checks for pending tasks
_MAX_WORKERS = 1           # Process tasks sequentially to avoid LLM rate limits
_executor: Optional[ThreadPoolExecutor] = None
_worker_thread: Optional[threading.Thread] = None
_shutdown_event = threading.Event()


# ── Task CRUD ─────────────────────────────────────────────────────────────────

def create_task(
    task_type: str,
    input_data: dict,
    created_by: Optional[str] = None,
    org_id: Optional[str] = None,
) -> str:
    """Insert a new pending task and return its UUID."""
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_tasks (id, task_type, status, input_data, created_by, org_id, created_at, updated_at)
                VALUES (%s, %s, 'pending', %s, %s, %s, %s, %s)
                """,
                (
                    task_id,
                    task_type,
                    json.dumps(input_data),
                    created_by,
                    org_id,
                    now,
                    now,
                ),
            )
        conn.commit()
    logger.info("AI task created: %s (type=%s)", task_id, task_type)
    return task_id


def get_task(task_id: str) -> Optional[dict]:
    """Fetch a single task by ID."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, task_type, status, input_data, result_data, error_message,
                       created_by, org_id, created_at, updated_at
                FROM ai_tasks WHERE id = %s
                """,
                (task_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def list_tasks(
    created_by: Optional[str] = None,
    org_id: Optional[str] = None,
    task_type: Optional[str] = None,
    limit: int = 50,
) -> list:
    """List recent tasks with optional filters."""
    where = []
    params = []
    if created_by:
        where.append("created_by = %s")
        params.append(created_by)
    if org_id:
        where.append("org_id = %s")
        params.append(org_id)
    if task_type:
        where.append("task_type = %s")
        params.append(task_type)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    params.append(limit)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, task_type, status, input_data, result_data, error_message,
                       created_by, org_id, created_at, updated_at
                FROM ai_tasks {where_sql}
                ORDER BY created_at DESC
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()
    return [_row_to_dict(r) for r in rows]


def _update_task(task_id: str, status: str, result_data: Optional[dict] = None, error: Optional[str] = None):
    """Update task status, result, and error."""
    now = datetime.now(timezone.utc)
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_tasks
                SET status = %s,
                    result_data = %s,
                    error_message = %s,
                    updated_at = %s
                WHERE id = %s
                """,
                (
                    status,
                    json.dumps(result_data) if result_data is not None else None,
                    error,
                    now,
                    task_id,
                ),
            )
        conn.commit()


def _claim_pending_task() -> Optional[dict]:
    """
    Atomically claim one pending task by setting it to 'running'.
    Returns the task dict or None if no pending task is available.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_tasks
                SET status = 'running', updated_at = NOW()
                WHERE id = (
                    SELECT id FROM ai_tasks
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, task_type, input_data
                """,
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "task_type": row[1],
        "input_data": row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}"),
    }


def reset_stale_running_tasks():
    """
    On startup: reset any tasks stuck in 'running' back to 'pending'
    so they are re-processed after a server restart.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_tasks SET status = 'pending', updated_at = NOW()
                WHERE status = 'running'
                """
            )
            count = cur.rowcount
        conn.commit()
    if count:
        logger.info("Reset %d stale 'running' AI tasks to 'pending' on startup.", count)


# ── Task Dispatcher ───────────────────────────────────────────────────────────

def _dispatch_task(task: dict):
    """Execute the appropriate AI function for the given task type."""
    task_id = task["id"]
    task_type = task["task_type"]
    inp = task["input_data"]

    logger.info("Worker processing task %s (type=%s)", task_id, task_type)

    try:
        result = None

        if task_type == "jd_generation":
            from app.services.ai_service import generate_job_description
            jd_text = generate_job_description(
                title=inp.get("job_title", ""),
                department=inp.get("department", "General"),
                location=inp.get("location", "Office"),
                job_type=inp.get("employment_type", "Full-time"),
                experience_required=inp.get("experience_required", "Entry-level"),
                qualification=inp.get("qualification", "Not specified"),
                salary=inp.get("salary", "Competitive"),
                skills_required=inp.get("skills_required", []),
            )
            result = {"description": jd_text}

        elif task_type == "resume_parse":
            from app.services.resume_parser import parse_resume, ResumeRejected
            import os
            file_path = inp.get("file_path", "")
            job_id = inp.get("job_id", "")
            org_id = inp.get("org_id", "")
            hr_id = inp.get("hr_id", "")
            filename = inp.get("filename", "resume.pdf")

            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Resume file not found: {file_path}")

            with open(file_path, "rb") as f:
                content = f.read()

            parsed = parse_resume(content, filename)

            # AI matching
            jd_text = ""
            if job_id:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """SELECT experience_required, qualification, skills_required,
                                      job_description
                               FROM job_vacancies WHERE id = %s""",
                            (job_id,),
                        )
                        row = cur.fetchone()
                        if row:
                            jd_text = (
                                f"Experience Required: {row[0] or ''}\n"
                                f"Qualification: {row[1] or ''}\n"
                                f"Skills Required: {row[2] or ''}\n"
                                f"Description: {row[3] or ''}"
                            )

            match_data = {"match_percentage": 0, "match_explanation": "JD not found"}
            if jd_text:
                from app.services.ai_service import match_candidate_with_jd
                match_data = match_candidate_with_jd(parsed, jd_text)

            resume_text = parsed.get("resume_text", "")
            # Generate a tmp_filename for later save
            tmp_uuid = str(uuid.uuid4())
            tmp_filename = f"tmp_{tmp_uuid}_{filename}"
            from app.routers.candidates import UPLOAD_DIR
            tmp_filepath = os.path.join(UPLOAD_DIR, tmp_filename)
            # Copy to tmp path for later /save call
            with open(tmp_filepath, "wb") as f:
                f.write(content)

            result = {
                "name": parsed.get("candidate_name", ""),
                "email": parsed.get("email_address", ""),
                "phone": parsed.get("contact_number", ""),
                "gender": parsed.get("gender", ""),
                "address": parsed.get("address", ""),
                "total_experience": parsed.get("total_experience", ""),
                "skills": parsed.get("skills", ""),
                "education": parsed.get("education", ""),
                "qualification": parsed.get("qualification", ""),
                "linkedin_url": parsed.get("linkedin_url", ""),
                "github_url": parsed.get("github_url", ""),
                "job_id": job_id,
                "org_id": org_id,
                "hr_id": hr_id,
                "filename": filename,
                "tmp_filename": tmp_filename,
                "resume_text": resume_text,
                "match_percentage": match_data["match_percentage"],
                "match_explanation": match_data["match_explanation"],
            }

        elif task_type == "email_draft":
            from app.services.email_service import draft_email_content
            import re
            hr_id = inp.get("hr_id", "")
            prompt = inp.get("prompt", "")
            candidate_id = inp.get("candidate_id")
            raw_draft = draft_email_content(hr_id, prompt, candidate_id)

            subject = "No Subject"
            body = raw_draft
            subject_match = re.search(r'SUBJECT:\s*(.*)', raw_draft, re.IGNORECASE)
            if subject_match:
                subject = subject_match.group(1).strip()
            body_match = re.search(r'BODY:\s*(.*)', raw_draft, re.IGNORECASE | re.DOTALL)
            if body_match:
                body = body_match.group(1).strip()
            elif "BODY:" in raw_draft.upper():
                parts = re.split(r'BODY:', raw_draft, flags=re.IGNORECASE)
                if len(parts) > 1:
                    body = parts[1].strip()

            result = {"subject": subject, "body": body}

        elif task_type == "candidate_comparison":
            from app.services.ai_service import compare_two_candidates_with_llm
            job_data = inp.get("job_data", {})
            c1 = inp.get("candidate1", {})
            c2 = inp.get("candidate2", {})
            llm_res = compare_two_candidates_with_llm(job_data, c1, c2)
            if llm_res:
                llm_res["job_info"] = job_data
                result = llm_res
            else:
                raise RuntimeError("LLM comparison returned no result.")

        elif task_type == "candidate_match":
            from app.services.ai_service import match_candidate_with_jd
            candidate_data = inp.get("candidate_data", {})
            jd_text = inp.get("jd_text", "")
            result = match_candidate_with_jd(candidate_data, jd_text)

        else:
            raise ValueError(f"Unknown task_type: {task_type!r}")

        _update_task(task_id, "completed", result_data=result)
        logger.info("Task %s completed successfully.", task_id)

    except Exception as exc:
        logger.error("Task %s failed: %s", task_id, exc, exc_info=True)
        _update_task(task_id, "failed", error=str(exc))


# ── Worker Loop ───────────────────────────────────────────────────────────────

def _worker_loop():
    """Background thread: continuously poll for pending tasks and dispatch them."""
    logger.info("AI task worker started.")
    while not _shutdown_event.is_set():
        try:
            task = _claim_pending_task()
            if task:
                _executor.submit(_dispatch_task, task)
            else:
                _shutdown_event.wait(timeout=_POLL_INTERVAL_SECS)
        except Exception as exc:
            logger.error("Worker loop error: %s", exc, exc_info=True)
            _shutdown_event.wait(timeout=_POLL_INTERVAL_SECS)
    logger.info("AI task worker stopped.")


def start_worker():
    """Start the background worker thread and thread pool. Call once on app startup."""
    global _executor, _worker_thread
    try:
        reset_stale_running_tasks()
    except Exception as e:
        logger.warning("Could not reset stale tasks on startup: %s", e)

    _executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="ai_task")
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="ai_task_worker")
    _worker_thread.start()
    logger.info("AI task worker thread started (max_workers=%d).", _MAX_WORKERS)


def stop_worker():
    """Signal the worker to stop and wait for pending tasks to finish."""
    _shutdown_event.set()
    if _executor:
        _executor.shutdown(wait=True, cancel_futures=False)
    logger.info("AI task worker thread stopped.")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    return {
        "task_id": str(row[0]),
        "task_type": row[1],
        "status": row[2],
        "input_data": row[3] if isinstance(row[3], dict) else (json.loads(row[3]) if row[3] else {}),
        "result_data": row[4] if isinstance(row[4], dict) else (json.loads(row[4]) if row[4] else None),
        "error_message": row[5],
        "created_by": row[6],
        "org_id": str(row[7]) if row[7] else None,
        "created_at": row[8].isoformat() if row[8] else None,
        "updated_at": row[9].isoformat() if row[9] else None,
    }
