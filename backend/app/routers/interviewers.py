"""
Router: Interviewers
  HR endpoints — CRUD for interviewers within their branch/department
  Interviewer self endpoints — profile, dashboard, My Interviewees, interview flow
"""

import uuid
import math
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import FileResponse, Response
from typing import Optional
import os

from app.models.schemas import (
    CreateInterviewerRequest, UpdateInterviewerRequest, InterviewerResponse,
    InterviewerProfileResponse, SubmitInterviewResultRequest, ChangePasswordRequest,
)
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["interviewers"])


# ── Helper: resolve HR context ────────────────────────────────────────────────

def _get_hr_context(cur, hr_id: str) -> tuple:
    """Return (org_id, branch_id) for an HR member or raise 401."""
    cur.execute(
        "SELECT organization_id, branch_id FROM organization_members WHERE id = %s LIMIT 1",
        (hr_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="HR user not found or access denied")
    return str(row[0]), str(row[1])


def _get_interviewer_context(cur, interviewer_id: str) -> tuple:
    """Return (org_id, branch_id, department_id) for an interviewer or raise 401."""
    cur.execute(
        "SELECT organization_id, branch_id, department_id FROM interviewers WHERE id = %s LIMIT 1",
        (interviewer_id,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Interviewer not found or access denied")
    return str(row[0]), str(row[1]), str(row[2])


# ── HR Endpoints: Interviewers CRUD ──────────────────────────────────────────

@router.post("/api/hr/interviewers", response_model=InterviewerResponse)
def create_interviewer(
    payload: CreateInterviewerRequest,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create an interviewer account for a specific department within HR's branch."""
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    interviewer_id = str(uuid.uuid4())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)

            # Verify department belongs to HR's branch and org
            cur.execute(
                """
                SELECT d.id, d.department_name, b.branch_name,
                       COALESCE(o.organization_name, o.company_name, '')
                FROM departments d
                JOIN branches b ON d.branch_id = b.id
                JOIN organization o ON d.organization_id = o.id
                WHERE d.id = %s AND d.branch_id = %s AND d.organization_id = %s
                LIMIT 1
                """,
                (payload.department_id, branch_id, org_id),
            )
            dept_row = cur.fetchone()
            if not dept_row:
                raise HTTPException(
                    status_code=403,
                    detail="Department not found or does not belong to your branch"
                )
            dept_name = dept_row[1]
            branch_name = dept_row[2]
            org_name = dept_row[3]

            # Check username uniqueness within org
            cur.execute(
                "SELECT id FROM interviewers WHERE organization_id = %s AND LOWER(username) = LOWER(%s) LIMIT 1",
                (org_id, payload.username),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username is already in use in this organization")

            # Check email uniqueness within org
            cur.execute(
                "SELECT id FROM interviewers WHERE organization_id = %s AND LOWER(email) = LOWER(%s) LIMIT 1",
                (org_id, str(payload.email)),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email is already in use in this organization")

            cur.execute(
                """
                INSERT INTO interviewers
                    (id, organization_id, branch_id, department_id, created_by_hr_id,
                     full_name, username, email, password, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                RETURNING created_at, updated_at
                """,
                (interviewer_id, org_id, branch_id, payload.department_id, x_hr_id,
                 payload.full_name.strip(), payload.username,
                 str(payload.email).lower().strip(), payload.password),
            )
            dates = cur.fetchone()
            conn.commit()

    logger.info("Interviewer created: '%s' (id=%s)", payload.username, interviewer_id)
    return InterviewerResponse(
        interviewer_id=interviewer_id,
        organization_id=org_id,
        organization_name=org_name,
        branch_id=branch_id,
        branch_name=branch_name,
        department_id=payload.department_id,
        department_name=dept_name,
        created_by_hr_id=x_hr_id,
        full_name=payload.full_name.strip(),
        username=payload.username,
        email=str(payload.email).lower().strip(),
        status="active",
        created_at=str(dates[0]),
        updated_at=str(dates[1]),
    )


@router.get("/api/hr/interviewers")
def list_interviewers(
    search: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=1000),
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List interviewers for HR's branch with search (name/email), dept filter, pagination."""
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)

            where_clause = " WHERE iv.organization_id = %s AND iv.branch_id = %s"
            params = [org_id, branch_id]

            if department_id and department_id.strip():
                where_clause += " AND iv.department_id = %s"
                params.append(department_id.strip())

            if search and search.strip():
                where_clause += " AND (iv.full_name ILIKE %s OR iv.email ILIKE %s OR iv.username ILIKE %s)"
                s = f"%{search.strip()}%"
                params.extend([s, s, s])

            count_sql = "SELECT COUNT(*) FROM interviewers iv" + where_clause
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            data_sql = """
                SELECT iv.id, iv.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       iv.branch_id, b.branch_name, iv.department_id, d.department_name,
                       iv.created_by_hr_id, iv.full_name, iv.username, iv.email, iv.status,
                       iv.created_at, iv.updated_at
                FROM interviewers iv
                JOIN organization o ON iv.organization_id = o.id
                JOIN branches b ON iv.branch_id = b.id
                JOIN departments d ON iv.department_id = d.id
            """ + where_clause + " ORDER BY iv.created_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            interviewers = [
                {
                    "interviewer_id": str(r[0]),
                    "organization_id": str(r[1]),
                    "organization_name": r[2],
                    "branch_id": str(r[3]),
                    "branch_name": r[4],
                    "department_id": str(r[5]),
                    "department_name": r[6],
                    "created_by_hr_id": str(r[7]) if r[7] else None,
                    "full_name": r[8],
                    "username": r[9],
                    "email": r[10],
                    "status": r[11],
                    "created_at": str(r[12]),
                    "updated_at": str(r[13]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "interviewers": interviewers,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.put("/api/hr/interviewers/{interviewer_id}", response_model=InterviewerResponse)
def update_interviewer(
    interviewer_id: str,
    payload: UpdateInterviewerRequest,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update interviewer details. HR can only edit interviewers within their branch."""
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)

            # Fetch current interviewer — must belong to HR's org+branch
            cur.execute(
                """
                SELECT iv.id, iv.organization_id, iv.branch_id, iv.department_id,
                       iv.full_name, iv.username, iv.email, iv.password, iv.status,
                       iv.created_at, iv.updated_at
                FROM interviewers iv
                WHERE iv.id = %s AND iv.organization_id = %s AND iv.branch_id = %s
                LIMIT 1
                """,
                (interviewer_id, org_id, branch_id),
            )
            curr = cur.fetchone()
            if not curr:
                raise HTTPException(status_code=404, detail="Interviewer not found or access denied")

            new_dept_id = payload.department_id if payload.department_id else str(curr[3])
            new_full_name = payload.full_name.strip() if payload.full_name else curr[4]
            new_username = payload.username.lower().strip() if payload.username else curr[5]
            new_email = str(payload.email).lower().strip() if payload.email else curr[6]
            new_password = payload.password if payload.password and len(payload.password) >= 6 else curr[7]

            # Validate new department belongs to same branch
            if new_dept_id != str(curr[3]):
                cur.execute(
                    "SELECT id FROM departments WHERE id = %s AND branch_id = %s AND organization_id = %s",
                    (new_dept_id, branch_id, org_id),
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=400, detail="Department does not belong to your branch")

            # Check username uniqueness (excluding self)
            cur.execute(
                "SELECT id FROM interviewers WHERE organization_id = %s AND LOWER(username) = LOWER(%s) AND id != %s LIMIT 1",
                (org_id, new_username, interviewer_id),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username is already in use")

            # Check email uniqueness (excluding self)
            cur.execute(
                "SELECT id FROM interviewers WHERE organization_id = %s AND LOWER(email) = LOWER(%s) AND id != %s LIMIT 1",
                (org_id, new_email, interviewer_id),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email is already in use")

            cur.execute(
                """
                UPDATE interviewers
                SET department_id = %s, full_name = %s, username = %s, email = %s,
                    password = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING updated_at
                """,
                (new_dept_id, new_full_name, new_username, new_email, new_password, interviewer_id),
            )
            updated_at = cur.fetchone()[0]

            # Fetch dept/branch/org names for response
            cur.execute(
                """
                SELECT d.department_name, b.branch_name, COALESCE(o.organization_name, o.company_name, '')
                FROM departments d
                JOIN branches b ON d.branch_id = b.id
                JOIN organization o ON d.organization_id = o.id
                WHERE d.id = %s
                """,
                (new_dept_id,),
            )
            meta = cur.fetchone()
            conn.commit()

    return InterviewerResponse(
        interviewer_id=interviewer_id,
        organization_id=org_id,
        organization_name=meta[2] if meta else "",
        branch_id=branch_id,
        branch_name=meta[1] if meta else "",
        department_id=new_dept_id,
        department_name=meta[0] if meta else "",
        created_by_hr_id=x_hr_id,
        full_name=new_full_name,
        username=new_username,
        email=new_email,
        status=curr[8],
        created_at=str(curr[9]),
        updated_at=str(updated_at),
    )


@router.delete("/api/hr/interviewers/{interviewer_id}")
def delete_interviewer(
    interviewer_id: str,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete an interviewer. HR can only delete interviewers in their branch."""
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)
            cur.execute(
                "DELETE FROM interviewers WHERE id = %s AND organization_id = %s AND branch_id = %s RETURNING id",
                (interviewer_id, org_id, branch_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Interviewer not found or access denied")
            conn.commit()

    logger.info("Interviewer deleted: %s", interviewer_id)
    return {"message": "Interviewer deleted successfully"}


@router.get("/api/hr/interviewers/by-department/{dept_id}")
def list_interviewers_by_department(
    dept_id: str,
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Return interviewers for a specific department (for Assign dropdown)."""
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id = _get_hr_context(cur, x_hr_id)

            # Verify dept belongs to HR's branch
            cur.execute(
                "SELECT id FROM departments WHERE id = %s AND branch_id = %s AND organization_id = %s",
                (dept_id, branch_id, org_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Department not found in your branch")

            cur.execute(
                """
                SELECT id, full_name, username, email, status
                FROM interviewers
                WHERE department_id = %s AND organization_id = %s AND status = 'active'
                ORDER BY full_name ASC
                """,
                (dept_id, org_id),
            )
            rows = cur.fetchall()
            return {
                "interviewers": [
                    {
                        "interviewer_id": str(r[0]),
                        "full_name": r[1],
                        "username": r[2],
                        "email": r[3],
                        "status": r[4],
                    }
                    for r in rows
                ]
            }


# ── Interviewer Self Endpoints ────────────────────────────────────────────────

@router.get("/api/interviewer/me")
def get_interviewer_profile(
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Return the logged-in interviewer's profile."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT iv.id, iv.full_name, iv.username, iv.email, iv.status, iv.created_at,
                       iv.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       iv.branch_id, b.branch_name,
                       iv.department_id, d.department_name
                FROM interviewers iv
                JOIN organization o ON iv.organization_id = o.id
                JOIN branches b ON iv.branch_id = b.id
                JOIN departments d ON iv.department_id = d.id
                WHERE iv.id = %s
                LIMIT 1
                """,
                (x_interviewer_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Interviewer profile not found")

            return {
                "interviewer_id": str(row[0]),
                "full_name": row[1],
                "username": row[2],
                "email": row[3],
                "status": row[4],
                "created_at": str(row[5]),
                "organization_id": str(row[6]),
                "organization_name": row[7],
                "branch_id": str(row[8]),
                "branch_name": row[9],
                "department_id": str(row[10]),
                "department_name": row[11],
            }


@router.get("/api/interviewer/dashboard")
def get_interviewer_dashboard(
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Return dashboard statistics for the logged-in interviewer."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id, dept_id = _get_interviewer_context(cur, x_interviewer_id)

            # Overall stats
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status = 'Ongoing' AND completed_at IS NULL) AS active,
                    COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
                    COUNT(*) FILTER (WHERE status = 'Passed') AS passed,
                    COUNT(*) FILTER (WHERE status = 'Rejected') AS rejected,
                    COUNT(*) FILTER (WHERE status = 'Onhold') AS onhold,
                    ROUND(AVG(rating)::numeric, 1) AS avg_rating
                FROM interview_assignments
                WHERE interviewer_id = %s AND organization_id = %s
                """,
                (x_interviewer_id, org_id),
            )
            stats = cur.fetchone()

            # Status distribution for chart
            cur.execute(
                """
                SELECT status, COUNT(*)
                FROM interview_assignments
                WHERE interviewer_id = %s AND organization_id = %s
                GROUP BY status
                """,
                (x_interviewer_id, org_id),
            )
            status_dist = {r[0]: r[1] for r in cur.fetchall()}

            # Rating distribution for chart
            cur.execute(
                """
                SELECT rating, COUNT(*)
                FROM interview_assignments
                WHERE interviewer_id = %s AND rating IS NOT NULL AND organization_id = %s
                GROUP BY rating ORDER BY rating
                """,
                (x_interviewer_id, org_id),
            )
            rating_dist = [{"rating": r[0], "count": r[1]} for r in cur.fetchall()]

            # Recent 7 days activity
            cur.execute(
                """
                SELECT DATE(assigned_at), COUNT(*)
                FROM interview_assignments
                WHERE interviewer_id = %s AND organization_id = %s
                  AND assigned_at >= NOW() - INTERVAL '7 days'
                GROUP BY DATE(assigned_at)
                ORDER BY DATE(assigned_at) ASC
                """,
                (x_interviewer_id, org_id),
            )
            activity = [{"date": str(r[0]), "count": r[1]} for r in cur.fetchall()]

    return {
        "stats": {
            "total_assigned": stats[0] or 0,
            "active": stats[1] or 0,
            "completed": stats[2] or 0,
            "passed": stats[3] or 0,
            "rejected": stats[4] or 0,
            "onhold": stats[5] or 0,
            "average_rating": float(stats[6]) if stats[6] else None,
        },
        "status_distribution": status_dist,
        "rating_distribution": rating_dist,
        "weekly_activity": activity,
    }


@router.get("/api/interviewer/my-interviewees")
def get_my_interviewees(
    status_filter: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=1000),
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Return active assignment list for the logged-in interviewer.
    Active = assigned and not yet completed (completed_at IS NULL).
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            where = """
                WHERE ia.interviewer_id = %s
                  AND ia.organization_id = %s
                  AND ia.completed_at IS NULL
            """
            params = [x_interviewer_id, org_id]

            if status_filter and status_filter.strip():
                where += " AND ia.status = %s"
                params.append(status_filter.strip())

            count_sql = "SELECT COUNT(*) FROM interview_assignments ia" + where
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            data_sql = """
                SELECT ia.id, ia.candidate_id, c.name, c.email,
                       ia.round_id, sr.round_title, sr.round_order,
                       ia.job_id, jv.job_title,
                       ia.status, ia.rating,
                       c.match_percentage,
                       ia.assigned_at
                FROM interview_assignments ia
                JOIN candidates c ON ia.candidate_id = c.id
                JOIN screening_rounds sr ON ia.round_id = sr.id
                JOIN job_vacancies jv ON ia.job_id = jv.id
            """ + where + " ORDER BY ia.assigned_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            items = [
                {
                    "assignment_id": str(r[0]),
                    "candidate_id": str(r[1]),
                    "candidate_name": r[2] or "Unknown",
                    "candidate_email": r[3] or "",
                    "round_id": str(r[4]),
                    "round_title": r[5],
                    "round_order": r[6],
                    "round_step": f"Round {r[6]}: {r[5]}",
                    "job_id": str(r[7]),
                    "job_title": r[8],
                    "status": r[9],
                    "rating": r[10],
                    "ats_score": r[11] or 0,
                    "assigned_at": str(r[12]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "assignments": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/api/interviewer/pullable-candidates")
def get_pullable_candidates(
    search: Optional[str] = Query(None),
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Return ongoing candidates in the interviewer's organization/department/branch
    that are available to be pulled by the logged-in interviewer.
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id, dept_id = _get_interviewer_context(cur, x_interviewer_id)

            where_clauses = ["COALESCE(css.interview_status, 'Ongoing') = 'Ongoing'", "c.org_id = %s", "c.reached = TRUE"]
            params = [org_id]

            if search and search.strip():
                s = f"%{search.strip()}%"
                where_clauses.append("(c.name ILIKE %s OR c.email ILIKE %s OR jv.job_title ILIKE %s)")
                params.extend([s, s, s])

            where_sql = " WHERE " + " AND ".join(where_clauses)

            sql = f"""
                SELECT DISTINCT ON (c.id)
                       c.id, c.name, c.email, c.match_percentage,
                       c.job_id, jv.job_title,
                       sr.id AS round_id, sr.round_title, sr.round_order,
                       ia.interviewer_id AS current_interviewer_id,
                       iv_curr.full_name AS current_interviewer_name
                FROM candidates c
                LEFT JOIN candidate_screening_status css ON c.id = css.candidate_id
                LEFT JOIN job_vacancies jv ON c.job_id = jv.id
                LEFT JOIN screening_rounds sr ON sr.job_id = jv.id AND sr.round_order = COALESCE(css.current_round_order, 1)
                LEFT JOIN interview_assignments ia ON ia.candidate_id = c.id AND ia.round_id = sr.id
                LEFT JOIN interviewers iv_curr ON ia.interviewer_id = iv_curr.id
                {where_sql}
                ORDER BY c.id, sr.round_order ASC
            """
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            items = []
            for r in rows:
                curr_iv_id = str(r[9]) if r[9] else None
                # Skip candidates that are already assigned to ANY interviewer
                if curr_iv_id is not None:
                    continue

                items.append({
                    "candidate_id": str(r[0]),
                    "candidate_name": r[1] or "Unknown",
                    "candidate_email": r[2] or "",
                    "ats_score": r[3] or 0,
                    "job_id": str(r[4]),
                    "job_title": r[5] or "General Vacancy",
                    "round_id": str(r[6]) if r[6] else "",
                    "round_title": r[7] or f"Round {r[8] or 1}",
                    "round_order": r[8] or 1,
                    "current_interviewer_id": curr_iv_id,
                    "current_interviewer_name": r[10] or "Unassigned",
                })

    return {"candidates": items}


@router.post("/api/interviewer/pull-candidates")
def pull_candidates(
    payload: dict,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Pull/assign multiple ongoing candidates to the logged-in interviewer.
    payload: { items: [ { candidate_id, round_id, job_id }, ... ] }
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    items = payload.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="No candidates selected to pull.")

    now = datetime.now(timezone.utc)
    pulled_count = 0

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, branch_id, dept_id = _get_interviewer_context(cur, x_interviewer_id)

            for item in items:
                cand_id = item.get("candidate_id")
                round_id = item.get("round_id")
                job_id = item.get("job_id")

                if not cand_id:
                    continue

                if not round_id or not job_id:
                    cur.execute(
                        """
                        SELECT css.job_id, sr.id
                        FROM candidate_screening_status css
                        JOIN screening_rounds sr ON sr.job_id = css.job_id AND sr.round_order = css.current_round_order
                        WHERE css.candidate_id = %s AND css.org_id = %s
                        LIMIT 1
                        """,
                        (cand_id, org_id),
                    )
                    r_row = cur.fetchone()
                    if r_row:
                        job_id = job_id or str(r_row[0])
                        round_id = round_id or str(r_row[1])

                if not round_id or not job_id:
                    continue

                assignment_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO interview_assignments
                        (id, organization_id, branch_id, department_id, candidate_id,
                         job_id, round_id, interviewer_id, assigned_by_hr_id,
                         status, assigned_at, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'Ongoing', %s, %s, %s)
                    ON CONFLICT (candidate_id, round_id) DO UPDATE
                    SET interviewer_id = EXCLUDED.interviewer_id,
                        status = 'Ongoing',
                        rating = NULL,
                        feedback = NULL,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (assignment_id, org_id, branch_id, dept_id, cand_id,
                     job_id, round_id, x_interviewer_id, None,
                     now, now, now),
                )
                pulled_count += 1

            conn.commit()

    return {
        "message": f"Successfully pulled {pulled_count} candidate(s) to your interview list!",
        "pulled_count": pulled_count
    }


@router.get("/api/interviewer/my-interviewees/{assignment_id}")
def get_assignment_detail(
    assignment_id: str,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Return full candidate + assignment detail for the interview screen.
    Interviewer must be assigned to this assignment.
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                """
                SELECT ia.id, ia.candidate_id, ia.job_id, ia.round_id,
                       ia.status, ia.rating, ia.feedback, ia.questions,
                       ia.assigned_at, ia.started_at, ia.completed_at,
                       -- Candidate fields
                       c.name, c.email, c.phone, c.skills, c.total_experience,
                       c.education, c.qualification, c.gender, c.address,
                       c.linkedin_url, c.github_url, c.filename, c.match_percentage,
                       -- Job fields
                       jv.job_title, jv.department, jv.experience_required, jv.skills_required,
                       jv.job_description, jv.qualification AS job_qual,
                       -- Round fields
                       sr.round_title, sr.round_order
                FROM interview_assignments ia
                JOIN candidates c ON ia.candidate_id = c.id
                JOIN job_vacancies jv ON ia.job_id = jv.id
                JOIN screening_rounds sr ON ia.round_id = sr.id
                WHERE ia.id = %s AND ia.interviewer_id = %s AND ia.organization_id = %s
                LIMIT 1
                """,
                (assignment_id, x_interviewer_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Assignment not found or access denied")

            skills_list = [s.strip() for s in (row[14] or "").split(",") if s.strip()]
            questions = row[7] if row[7] else None

    return {
        "assignment_id": str(row[0]),
        "candidate_id": str(row[1]),
        "job_id": str(row[2]),
        "round_id": str(row[3]),
        "status": row[4],
        "rating": row[5],
        "feedback": row[6] or "",
        "questions": questions,
        "assigned_at": str(row[8]) if row[8] else None,
        "started_at": str(row[9]) if row[9] else None,
        "completed_at": str(row[10]) if row[10] else None,
        "candidate": {
            "name": row[11] or "",
            "email": row[12] or "",
            "phone": row[13] or "",
            "skills": skills_list,
            "total_experience": row[15] or "0",
            "education": row[16] or "",
            "qualification": row[17] or "",
            "gender": row[18] or "",
            "address": row[19] or "",
            "linkedin_url": row[20] or "",
            "github_url": row[21] or "",
            "filename": row[22] or "",
            "ats_score": row[23] or 0,
        },
        "job": {
            "job_title": row[24] or "",
            "department": row[25] or "",
            "experience_required": row[26] or "",
            "skills_required": [s.strip() for s in (row[27] or "").split(",") if s.strip()],
            "job_description": row[28] or "",
            "qualification": row[29] or "",
        },
        "round": {
            "round_title": row[30] or "",
            "round_order": row[31] or 1,
            "round_step": f"Round {row[31]}: {row[30]}",
        },
    }


@router.get("/api/interviewer/assignments/{assignment_id}/resume")
def download_candidate_resume(
    assignment_id: str,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Authorized resume download for the assigned interviewer.
    Only returns the file if the interviewer is assigned to this candidate's current round.
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                """
                SELECT c.filename, c.resume_file, c.resume_text, c.id FROM interview_assignments ia
                JOIN candidates c ON ia.candidate_id = c.id
                WHERE ia.id = %s AND ia.interviewer_id = %s AND ia.organization_id = %s
                LIMIT 1
                """,
                (assignment_id, x_interviewer_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=403, detail="Resume access denied or assignment not found")

            filename = row[0] or "resume.pdf"
            resume_file = row[1]
            resume_text = row[2] or ""
            candidate_id = str(row[3])

    if resume_file:
        return Response(
            content=bytes(resume_file),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    import tempfile
    upload_dir = os.path.join(tempfile.gettempdir(), "ai_hr_resumes")
    file_path = os.path.join(upload_dir, f"{candidate_id}_{filename}")
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")

    txt_filename = filename if filename.endswith('.txt') else f"{filename}.txt"
    return Response(
        content=resume_text.encode("utf-8"),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{txt_filename}"'}
    )


@router.post("/api/interviewer/assignments/{assignment_id}/generate-questions")
def generate_questions(
    assignment_id: str,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Generate (or regenerate) exactly 10 AI interview questions for this assignment.
    Questions are stored against the assignment. Calling again overwrites existing questions.
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    from app.services.ai_service import generate_interview_questions

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                """
                SELECT ia.candidate_id, ia.job_id,
                       c.name, c.skills, c.total_experience, c.education, c.qualification,
                       jv.job_title, jv.department, jv.skills_required,
                       jv.experience_required, jv.qualification AS job_qual, jv.job_description
                FROM interview_assignments ia
                JOIN candidates c ON ia.candidate_id = c.id
                JOIN job_vacancies jv ON ia.job_id = jv.id
                WHERE ia.id = %s AND ia.interviewer_id = %s AND ia.organization_id = %s
                LIMIT 1
                """,
                (assignment_id, x_interviewer_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=403, detail="Assignment not found or access denied")

            candidate_data = {
                "name": row[2],
                "skills": row[3],
                "total_experience": row[4] or 0,
                "education": row[5] or "",
                "qualification": row[6] or "",
            }
            job_data = {
                "job_title": row[7],
                "department": row[8],
                "skills_required": [s.strip() for s in (row[9] or "").split(",") if s.strip()],
                "experience_required": row[10] or "",
                "qualification": row[11] or "",
                "job_description": row[12] or "",
            }

            try:
                questions = generate_interview_questions(job_data, candidate_data)
            except Exception as e:
                logger.error("Failed to generate questions: %s", e)
                raise HTTPException(status_code=500, detail=f"AI question generation failed: {str(e)}")

            cur.execute(
                "UPDATE interview_assignments SET questions = %s, updated_at = NOW() WHERE id = %s",
                (json.dumps(questions), assignment_id),
            )
            conn.commit()

    logger.info("Generated %d questions for assignment %s", len(questions), assignment_id)
    return {"questions": questions, "count": len(questions)}


@router.get("/api/interviewer/assignments/{assignment_id}/questions")
def get_questions(
    assignment_id: str,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Fetch stored questions for an assignment. Returns empty if not yet generated."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            cur.execute(
                "SELECT questions FROM interview_assignments WHERE id = %s AND interviewer_id = %s AND organization_id = %s LIMIT 1",
                (assignment_id, x_interviewer_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=403, detail="Assignment not found or access denied")

            questions = row[0] if row[0] else []
            if isinstance(questions, str):
                questions = json.loads(questions)

    return {"questions": questions, "count": len(questions)}


@router.post("/api/interviewer/assignments/{assignment_id}/submit")
def submit_interview_result(
    assignment_id: str,
    payload: SubmitInterviewResultRequest,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Record interview result (rating, feedback, status).
    If is_done=True, marks the interview as completed and removes it from active list.
    Also syncs status back to candidate_screening_status so HR sees it.
    """
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    now = datetime.now(timezone.utc)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            org_id, _, _ = _get_interviewer_context(cur, x_interviewer_id)

            # Fetch current assignment
            cur.execute(
                """
                SELECT ia.id, ia.status, ia.candidate_id, ia.job_id, ia.round_id,
                       ia.started_at, ia.completed_at, ia.organization_id
                FROM interview_assignments ia
                WHERE ia.id = %s AND ia.interviewer_id = %s AND ia.organization_id = %s
                LIMIT 1
                """,
                (assignment_id, x_interviewer_id, org_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Assignment not found or access denied")

            if row[6] is not None:
                raise HTTPException(status_code=400, detail="This interview has already been completed")

            prev_status = row[1]
            candidate_id = str(row[2])
            job_id = str(row[3])
            round_id = str(row[4])
            started_at = row[5] or now

            completed_at = now if payload.is_done else None

            cur.execute(
                """
                UPDATE interview_assignments
                SET status = %s, rating = %s, feedback = %s,
                    started_at = COALESCE(started_at, %s),
                    completed_at = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (payload.status, payload.rating, payload.feedback, started_at, completed_at, assignment_id),
            )

            # Record status history
            history_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO interview_status_history
                    (id, assignment_id, organization_id, changed_by_interviewer_id,
                     previous_status, new_status, rating, feedback, changed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (history_id, assignment_id, org_id, x_interviewer_id,
                 prev_status, payload.status, payload.rating, payload.feedback, now),
            )

            # If done, sync status to candidate_screening_status so HR sees result
            if payload.is_done:
                # Get round order for progression logic
                cur.execute("SELECT round_order FROM screening_rounds WHERE id = %s", (round_id,))
                round_row = cur.fetchone()
                round_order = round_row[0] if round_row else 1

                cur.execute("SELECT COALESCE(MAX(round_order), 1) FROM screening_rounds WHERE job_id = %s", (job_id,))
                max_rounds = cur.fetchone()[0]

                # Map interviewer status to screening status for the round
                status_map = {
                    "Passed": "Passed",
                    "Rejected": "Rejected",
                    "Onhold": "On Hold",
                    "Ongoing": "Ongoing",
                }
                round_eval_status = status_map.get(payload.status, payload.status)
                
                # Determine overall candidate status
                screening_status = round_eval_status
                new_round_order = round_order
                
                if payload.status == "Passed" and round_order < max_rounds:
                    new_round_order = round_order + 1
                    screening_status = "Ongoing"
                elif payload.status == "Passed" and round_order >= max_rounds:
                    screening_status = "Passed"

                # Also upsert screening_comments for history (must use round_eval_status)
                sc_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO screening_comments (id, candidate_id, round_id, status, score, comment, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (candidate_id, round_id) DO UPDATE
                    SET status = EXCLUDED.status, score = EXCLUDED.score,
                        comment = EXCLUDED.comment, updated_at = EXCLUDED.updated_at
                    """,
                    (sc_id, candidate_id, round_id, round_eval_status,
                     payload.rating, payload.feedback or "", now, now),
                )

                # Update candidate_screening_status (overall candidate status)
                css_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO candidate_screening_status
                        (id, candidate_id, job_id, org_id, interview_status, current_round_order, contacted_status, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, 'Contacted', %s)
                    ON CONFLICT (candidate_id) DO UPDATE
                    SET interview_status = EXCLUDED.interview_status,
                        current_round_order = EXCLUDED.current_round_order
                    """,
                    (css_id, candidate_id, job_id, org_id, screening_status, new_round_order, now),
                )

            conn.commit()

    return {
        "message": "Interview result recorded successfully",
        "status": payload.status,
        "is_completed": payload.is_done,
        "rating": payload.rating,
    }


@router.put("/api/interviewer/change-password")
def change_interviewer_password(
    payload: ChangePasswordRequest,
    x_interviewer_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Change password for the logged-in interviewer."""
    if not x_interviewer_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    old_pass = payload.old_password.strip()
    new_pass = payload.new_password.strip()
    confirm = payload.confirm_password.strip()

    if new_pass != confirm:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match.")
    if old_pass == new_pass:
        raise HTTPException(status_code=400, detail="New password cannot be same as old password.")
    if len(new_pass) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, password FROM interviewers WHERE id = %s LIMIT 1", (x_interviewer_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Interviewer not found.")
            if row[1] != old_pass:
                raise HTTPException(status_code=400, detail="Incorrect old password.")
            cur.execute(
                "UPDATE interviewers SET password = %s, updated_at = NOW() WHERE id = %s",
                (new_pass, x_interviewer_id),
            )
            conn.commit()

    return {"message": "Password changed successfully."}
