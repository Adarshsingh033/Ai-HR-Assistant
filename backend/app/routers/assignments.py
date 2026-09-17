"""
Router: Interview Assignments
  HR endpoints to assign interviewers to candidate rounds and view assignment history.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.models.schemas import AssignInterviewerRequest
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/screening", tags=["assignments"])


def _get_hr_context(cur, hr_id: str) -> tuple:
    """Return (org_id, branch_id) for an HR member or raise 403."""
    cur.execute(
        "SELECT organization_id, branch_id FROM organization_members WHERE id = %s LIMIT 1",
        (hr_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="HR user not found or access denied")
    return str(row[0]), str(row[1])


@router.post("/assign")
def assign_interviewer(
    payload: AssignInterviewerRequest,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Assign exactly one interviewer to a candidate's specific interview round.

    Validates:
    - HR's org/branch ownership of the candidate and round
    - Interviewer belongs to the same department as the job vacancy
    - Interviewer belongs to HR's org and branch
    - Only one interviewer per candidate per round (UPSERT)
    """
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    assignment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)

            # 1. Verify candidate belongs to HR's org
            cur.execute(
                "SELECT job_id FROM candidates WHERE id = %s AND org_id = %s LIMIT 1",
                (payload.candidate_id, org_id),
            )
            cand_row = cur.fetchone()
            if not cand_row:
                raise HTTPException(status_code=404, detail="Candidate not found in your organization")
            job_id = str(cand_row[0])

            # 2. Verify round belongs to this job and org
            cur.execute(
                "SELECT id, round_order FROM screening_rounds WHERE id = %s AND job_id = %s AND org_id = %s LIMIT 1",
                (payload.round_id, job_id, org_id),
            )
            round_row = cur.fetchone()
            if not round_row:
                raise HTTPException(status_code=404, detail="Interview round not found for this job/organization")

            # 3. Get job's department_id
            cur.execute(
                "SELECT department_id FROM job_vacancies WHERE id = %s AND organization_id = %s LIMIT 1",
                (job_id, org_id),
            )
            job_row = cur.fetchone()
            if not job_row or not job_row[0]:
                raise HTTPException(
                    status_code=400,
                    detail="Job vacancy has no department assigned. Please update the job vacancy to select a department first."
                )
            job_dept_id = str(job_row[0])

            # 4. Verify interviewer belongs to HR's org, branch, AND same department as the job
            cur.execute(
                """
                SELECT iv.id, iv.department_id, d.department_name, iv.full_name
                FROM interviewers iv
                JOIN departments d ON iv.department_id = d.id
                WHERE iv.id = %s
                  AND iv.organization_id = %s
                  AND iv.branch_id = %s
                  AND iv.status = 'active'
                LIMIT 1
                """,
                (payload.interviewer_id, org_id, branch_id),
            )
            iv_row = cur.fetchone()
            if not iv_row:
                raise HTTPException(
                    status_code=403,
                    detail="Interviewer not found in your organization/branch or is inactive"
                )

            if str(iv_row[1]) != job_dept_id:
                raise HTTPException(
                    status_code=403,
                    detail=f"Interviewer's department does not match the job vacancy's department. "
                           f"Only interviewers from the '{iv_row[2]}' department can be assigned to this vacancy."
                )

            interviewer_name = iv_row[3]

            # 5. Get department_id for the assignment record
            dept_id = job_dept_id

            # 6. Upsert assignment (one interviewer per candidate per round)
            cur.execute(
                """
                INSERT INTO interview_assignments
                    (id, organization_id, branch_id, department_id, candidate_id,
                     job_id, round_id, interviewer_id, assigned_by_hr_id,
                     status, assigned_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'Ongoing', %s, %s, %s)
                ON CONFLICT (candidate_id, round_id) DO UPDATE
                SET interviewer_id = EXCLUDED.interviewer_id,
                    assigned_by_hr_id = EXCLUDED.assigned_by_hr_id,
                    status = 'Ongoing',
                    rating = NULL,
                    feedback = NULL,
                    questions = NULL,
                    started_at = NULL,
                    completed_at = NULL,
                    updated_at = EXCLUDED.updated_at
                RETURNING id
                """,
                (assignment_id, org_id, branch_id, dept_id, payload.candidate_id,
                 job_id, payload.round_id, payload.interviewer_id, x_hr_id,
                 now, now, now),
            )
            result_id = cur.fetchone()[0]

            # 7. Ensure candidate_screening_status is set to Contacted/Ongoing
            css_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO candidate_screening_status
                    (id, candidate_id, job_id, org_id, interview_status, current_round_order, contacted_status, created_at)
                VALUES (%s, %s, %s, %s, 'Ongoing', 1, 'Contacted', %s)
                ON CONFLICT (candidate_id) DO NOTHING
                """,
                (css_id, payload.candidate_id, job_id, org_id, now),
            )

            conn.commit()

    logger.info(
        "Interviewer '%s' assigned to candidate %s, round %s by HR %s",
        interviewer_name, payload.candidate_id, payload.round_id, x_hr_id
    )
    return {
        "message": f"Interviewer '{interviewer_name}' assigned successfully",
        "assignment_id": str(result_id),
        "candidate_id": payload.candidate_id,
        "round_id": payload.round_id,
        "interviewer_id": payload.interviewer_id,
        "interviewer_name": interviewer_name,
    }


@router.get("/assignments/{candidate_id}")
def get_candidate_assignments(
    candidate_id: str,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Get all interview assignments (per round) for a candidate.
    Used by HR to see the full round-by-round interviewer history.
    """
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _ = _get_hr_context(cur, x_hr_id)

            # Verify candidate belongs to HR's org
            cur.execute(
                "SELECT id FROM candidates WHERE id = %s AND org_id = %s LIMIT 1",
                (candidate_id, org_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Candidate not found in your organization")

            cur.execute(
                """
                SELECT ia.id, ia.round_id, sr.round_title, sr.round_order,
                       ia.interviewer_id, iv.full_name AS interviewer_name,
                       ia.status, ia.rating, ia.feedback,
                       ia.assigned_at, ia.started_at, ia.completed_at
                FROM interview_assignments ia
                JOIN screening_rounds sr ON ia.round_id = sr.id
                LEFT JOIN interviewers iv ON ia.interviewer_id = iv.id
                WHERE ia.candidate_id = %s AND ia.organization_id = %s
                ORDER BY sr.round_order ASC
                """,
                (candidate_id, org_id),
            )
            rows = cur.fetchall()

            return {
                "assignments": [
                    {
                        "assignment_id": str(r[0]),
                        "round_id": str(r[1]),
                        "round_title": r[2],
                        "round_order": r[3],
                        "interviewer_id": str(r[4]) if r[4] else None,
                        "interviewer_name": r[5] or "Not assigned",
                        "status": r[6],
                        "rating": r[7],
                        "feedback": r[8] or "",
                        "assigned_at": str(r[9]) if r[9] else None,
                        "started_at": str(r[10]) if r[10] else None,
                        "completed_at": str(r[11]) if r[11] else None,
                    }
                    for r in rows
                ]
            }
