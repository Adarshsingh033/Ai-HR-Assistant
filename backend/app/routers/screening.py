"""
Router: Screening
  - GET  /api/screening/rounds              — List screening rounds for a job
  - POST /api/screening/rounds              — Create screening round
  - PUT  /api/screening/rounds/{round_id}   — Edit screening round
  - DELETE /api/screening/rounds/{round_id}— Delete screening round
  - GET  /api/screening/candidates          — List contacted candidates for screening
  - PUT  /api/screening/candidates/{id}/schedule — Toggle interview schedule status (Pending/Active)
  - PUT  /api/screening/candidates/{id}/move-interview — Advance candidate to Interview stage
  - DELETE /api/screening/candidates/{id}   — Remove candidate from screening
  - GET  /api/screening/candidates/{id}/progress — View candidate progress & rounds
  - POST /api/screening/candidates/{id}/comments — Save HR comment/evaluation per round
"""

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from app.database import get_db_connection
from app.models.schemas import (
    CreateScreeningRoundRequest,
    UpdateScreeningRoundRequest,
    UpdateInterviewScheduleRequest,
    AddScreeningCommentRequest,
)
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/screening", tags=["screening"])


# ── 1. Screening Rounds Endpoints ─────────────────────────────────────────────

@router.get("/rounds")
def list_screening_rounds(job_id: Optional[str] = None, org_id: Optional[str] = None):
    """List all screening rounds for a specific job vacancy or organization."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = (
                "SELECT r.id, r.job_id, j.job_title, r.org_id, r.round_title, "
                "r.round_description, r.round_order, r.created_at "
                "FROM screening_rounds r "
                "LEFT JOIN job_vacancies j ON r.job_id = j.id"
            )
            params = []
            where = []
            if job_id:
                where.append("r.job_id = %s")
                params.append(job_id)
            if org_id:
                where.append("r.org_id = %s")
                params.append(org_id)
            if where:
                query += " WHERE " + " AND ".join(where)
            query += " ORDER BY r.round_order ASC, r.created_at ASC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return {
                "rounds": [
                    {
                        "round_id": str(r[0]),
                        "job_id": str(r[1]),
                        "job_title": r[2] or "Job Vacancy",
                        "org_id": str(r[3]),
                        "round_title": r[4],
                        "round_description": r[5] or "",
                        "round_order": r[6] or 1,
                        "created_at": str(r[7]),
                    }
                    for r in rows
                ]
            }


@router.post("/rounds")
def create_screening_round(req: CreateScreeningRoundRequest):
    """Create a new screening round for a job vacancy."""
    round_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Determine next order for job
            cur.execute(
                "SELECT COALESCE(MAX(round_order), 0) + 1 FROM screening_rounds WHERE job_id = %s",
                (req.job_id,),
            )
            next_order = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO screening_rounds (id, job_id, org_id, round_title, round_description, round_order, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (round_id, req.job_id, req.org_id, req.round_title.strip(), req.round_description, next_order, now),
            )
            conn.commit()

    logger.info("Screening round created: '%s' for job %s", req.round_title, req.job_id)
    return {
        "round_id": round_id,
        "job_id": req.job_id,
        "org_id": req.org_id,
        "round_title": req.round_title,
        "round_description": req.round_description,
        "round_order": next_order,
        "created_at": now,
    }


@router.put("/rounds/{round_id}")
def update_screening_round(round_id: str, req: UpdateScreeningRoundRequest):
    """Edit a screening round's title and description."""
    fields = []
    params = []
    if req.round_title is not None:
        fields.append("round_title = %s")
        params.append(req.round_title.strip())
    if req.round_description is not None:
        fields.append("round_description = %s")
        params.append(req.round_description.strip())

    if not fields:
        return {"message": "No updates provided"}

    params.append(round_id)
    sql = f"UPDATE screening_rounds SET {', '.join(fields)} WHERE id = %s"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            conn.commit()

    logger.info("Screening round updated: %s", round_id)
    return {"message": "Screening round updated successfully"}


@router.delete("/rounds/{round_id}")
def delete_screening_round(round_id: str):
    """Delete a screening round."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM screening_rounds WHERE id = %s", (round_id,))
            conn.commit()
    logger.info("Screening round deleted: %s", round_id)
    return {"message": "Screening round deleted successfully"}


# ── 2. Candidates Screening List Endpoints ────────────────────────────────────

@router.get("/candidates")
def list_screening_candidates(
    org_id: str,
    job_id: Optional[str] = None,
    interview_schedule: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    List all contacted candidates (reached = True) for the organization,
    enriched with screening status (interview_schedule, screening_stage).
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = (
                "SELECT c.id, c.name, c.email, c.phone, c.gender, c.address, c.total_experience, "
                "c.skills, c.job_id, j.job_title, c.org_id, c.match_percentage, c.match_explanation, "
                "c.filename, c.created_at, "
                "COALESCE(css.interview_schedule, 'Pending') AS interview_schedule, "
                "COALESCE(css.screening_stage, 'Screening') AS screening_stage "
                "FROM candidates c "
                "LEFT JOIN job_vacancies j ON c.job_id = j.id "
                "LEFT JOIN candidate_screening_status css ON c.id = css.candidate_id "
                "WHERE c.org_id = %s AND c.reached = TRUE"
            )
            params = [org_id]

            if job_id:
                query += " AND c.job_id = %s"
                params.append(job_id)

            if interview_schedule:
                query += " AND COALESCE(css.interview_schedule, 'Pending') = %s"
                params.append(interview_schedule)

            if search:
                query += " AND (LOWER(c.name) LIKE LOWER(%s) OR LOWER(c.email) LIKE LOWER(%s))"
                params.extend([f"%{search}%", f"%{search}%"])

            query += " ORDER BY c.match_percentage DESC, c.created_at ASC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return {
                "candidates": [
                    {
                        "candidate_id": str(r[0]),
                        "name": r[1] or "Unknown",
                        "email": r[2] or "",
                        "phone": r[3] or "",
                        "gender": r[4] or "",
                        "address": r[5] or "",
                        "total_experience": r[6] or "",
                        "skills": [s.strip() for s in (r[7] or "").split(",") if s.strip()],
                        "job_id": str(r[8]) if r[8] else None,
                        "job_title": r[9] or "General Vacancy",
                        "org_id": str(r[10]) if r[10] else None,
                        "match_percentage": r[11] or 0,
                        "match_explanation": r[12] or "",
                        "filename": r[13] or "",
                        "created_at": str(r[14]) if r[14] else "",
                        "interview_schedule": r[15],
                        "screening_stage": r[16],
                    }
                    for r in rows
                ]
            }


@router.put("/candidates/{candidate_id}/schedule")
def update_interview_schedule(candidate_id: str, req: UpdateInterviewScheduleRequest):
    """Toggle interview schedule status (Pending / Active)."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check candidate details
            cur.execute("SELECT job_id, org_id FROM candidates WHERE id = %s", (candidate_id,))
            cand_row = cur.fetchone()
            if not cand_row:
                raise HTTPException(status_code=404, detail="Candidate not found")

            job_id, org_id = cand_row

            # Upsert screening status
            status_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()

            cur.execute(
                """
                INSERT INTO candidate_screening_status (id, candidate_id, job_id, org_id, interview_schedule, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (candidate_id) DO UPDATE
                SET interview_schedule = EXCLUDED.interview_schedule
                """,
                (status_id, candidate_id, job_id, org_id, req.interview_schedule, now),
            )
            conn.commit()

    logger.info("Interview schedule updated for candidate %s -> %s", candidate_id, req.interview_schedule)
    return {"message": "Interview schedule status updated successfully", "interview_schedule": req.interview_schedule}


@router.put("/candidates/{candidate_id}/move-interview")
def move_candidate_to_interview(candidate_id: str):
    """Advance candidate to Interview stage."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT job_id, org_id FROM candidates WHERE id = %s", (candidate_id,))
            cand_row = cur.fetchone()
            if not cand_row:
                raise HTTPException(status_code=404, detail="Candidate not found")

            job_id, org_id = cand_row
            status_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()

            cur.execute(
                """
                INSERT INTO candidate_screening_status (id, candidate_id, job_id, org_id, screening_stage, created_at)
                VALUES (%s, %s, %s, %s, 'Interview', %s)
                ON CONFLICT (candidate_id) DO UPDATE
                SET screening_stage = 'Interview'
                """,
                (status_id, candidate_id, job_id, org_id, now),
            )
            conn.commit()

    logger.info("Candidate %s moved to Interview stage", candidate_id)
    return {"message": "Candidate successfully moved to Interview stage", "screening_stage": "Interview"}


@router.delete("/candidates/{candidate_id}")
def remove_candidate_from_screening(candidate_id: str):
    """Remove candidate from screening list by setting reached = False."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE candidates SET reached = FALSE WHERE id = %s", (candidate_id,))
            cur.execute("DELETE FROM candidate_screening_status WHERE candidate_id = %s", (candidate_id,))
            conn.commit()

    logger.info("Candidate %s removed from screening list", candidate_id)
    return {"message": "Candidate removed from screening list"}


# ── 3. Candidate Progress & Comments Endpoints ───────────────────────────────

@router.get("/candidates/{candidate_id}/progress")
def get_candidate_screening_progress(candidate_id: str):
    """
    Get candidate info, job vacancy title, and list of screening rounds
    with candidate's saved status & comments for each round.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Candidate details
            cur.execute(
                "SELECT c.id, c.name, c.email, c.phone, c.job_id, j.job_title, "
                "c.match_percentage, COALESCE(css.interview_schedule, 'Pending'), "
                "COALESCE(css.screening_stage, 'Screening') "
                "FROM candidates c "
                "LEFT JOIN job_vacancies j ON c.job_id = j.id "
                "LEFT JOIN candidate_screening_status css ON c.id = css.candidate_id "
                "WHERE c.id = %s",
                (candidate_id,),
            )
            cand_row = cur.fetchone()
            if not cand_row:
                raise HTTPException(status_code=404, detail="Candidate not found")

            cid, name, email, phone, job_id, job_title, match_pct, schedule_stat, stage = cand_row

            # 2. Fetch rounds for this candidate's job_id
            cur.execute(
                "SELECT r.id, r.round_title, r.round_description, r.round_order, "
                "COALESCE(sc.status, 'Pending') AS status, "
                "COALESCE(sc.comment, '') AS comment, "
                "sc.updated_at "
                "FROM screening_rounds r "
                "LEFT JOIN screening_comments sc ON r.id = sc.round_id AND sc.candidate_id = %s "
                "WHERE r.job_id = %s "
                "ORDER BY r.round_order ASC, r.created_at ASC",
                (candidate_id, job_id),
            )
            round_rows = cur.fetchall()

            return {
                "candidate": {
                    "candidate_id": str(cid),
                    "name": name or "Unknown",
                    "email": email or "",
                    "phone": phone or "",
                    "job_id": str(job_id) if job_id else None,
                    "job_title": job_title or "General Vacancy",
                    "match_percentage": match_pct or 0,
                    "interview_schedule": schedule_stat,
                    "screening_stage": stage,
                },
                "rounds": [
                    {
                        "round_id": str(r[0]),
                        "round_title": r[1],
                        "round_description": r[2] or "",
                        "round_order": r[3] or 1,
                        "status": r[4],
                        "comment": r[5],
                        "updated_at": str(r[6]) if r[6] else None,
                    }
                    for r in round_rows
                ],
            }


@router.post("/candidates/{candidate_id}/comments")
def save_screening_comment(candidate_id: str, req: AddScreeningCommentRequest):
    """Save or update HR performance evaluation status and comment for a candidate in a round."""
    comment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO screening_comments (id, candidate_id, round_id, status, comment, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (candidate_id, round_id) DO UPDATE
                SET status = EXCLUDED.status,
                    comment = EXCLUDED.comment,
                    updated_at = EXCLUDED.updated_at
                """,
                (comment_id, candidate_id, req.round_id, req.status or "Pending", req.comment.strip() if req.comment else "", now, now),
            )
            conn.commit()

    logger.info("Saved screening comment for candidate %s in round %s", candidate_id, req.round_id)
    return {"message": "Screening comment and progress updated successfully"}
