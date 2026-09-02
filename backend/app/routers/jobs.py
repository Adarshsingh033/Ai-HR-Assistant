"""Router: Jobs — CRUD operations for Job Vacancies and AI-powered job description generation."""

import uuid
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Header

from app.models.schemas import CreateJobRequest, UpdateJobRequest, JobResponse, GenerateJDRequest
from app.database import get_db_connection
from app.services.ai_service import generate_job_description
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse)
def create_job(
    payload: CreateJobRequest,
    x_user_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new Job Vacancy record."""
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    org_id = payload.organization_id or payload.org_id
    hr_id = payload.created_by_hr_id or payload.hr_id or x_user_id

    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required.")

    skills_str = ",".join(payload.skills_required) if payload.skills_required else ""
    status_val = (payload.status or "draft").lower()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # If hr_id not directly supplied, fallback check in organization_members
            if not hr_id and x_user_id:
                hr_id = x_user_id

            if not hr_id:
                hr_id = "00000000-0000-0000-0000-000000000000"

            # Auto-lookup branch_id from HR user record if not explicitly passed
            branch_id_to_use = payload.branch_id if (payload.branch_id and payload.branch_id.strip()) else None
            if not branch_id_to_use and hr_id:
                cur.execute("SELECT branch_id FROM organization_members WHERE id = %s LIMIT 1", (hr_id,))
                brow = cur.fetchone()
                if brow and brow[0]:
                    branch_id_to_use = str(brow[0])

            cur.execute(
                """
                INSERT INTO job_vacancies 
                (id, organization_id, branch_id, created_by_hr_id, job_title, department, 
                 employment_type, work_mode, location, openings, experience_required, 
                 salary, skills_required, job_description, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                RETURNING created_at, updated_at
                """,
                (
                    job_id,
                    org_id,
                    branch_id_to_use,
                    hr_id,
                    payload.job_title.strip(),
                    payload.department.strip() if payload.department else "General",
                    payload.employment_type.strip() if payload.employment_type else "Full-time",
                    payload.work_mode.strip() if payload.work_mode else "On-site",
                    payload.location.strip() if payload.location else "",
                    payload.openings if payload.openings > 0 else 1,
                    payload.experience_required.strip() if payload.experience_required else "",
                    payload.salary.strip() if payload.salary else "",
                    skills_str,
                    payload.job_description,
                    status_val,
                ),
            )
            dates = cur.fetchone()
            conn.commit()

            # Get branch name if branch_id present
            branch_name = ""
            if payload.branch_id:
                cur.execute("SELECT branch_name FROM branches WHERE id = %s", (payload.branch_id,))
                brow = cur.fetchone()
                if brow:
                    branch_name = brow[0]

    logger.info("Job Vacancy created: %s (id=%s, org=%s)", payload.job_title, job_id, org_id)
    return JobResponse(
        job_id=job_id,
        organization_id=org_id,
        branch_id=payload.branch_id or "",
        branch_name=branch_name,
        created_by_hr_id=hr_id,
        job_title=payload.job_title,
        department=payload.department or "General",
        employment_type=payload.employment_type or "Full-time",
        work_mode=payload.work_mode or "On-site",
        location=payload.location or "",
        openings=payload.openings,
        experience_required=payload.experience_required or "",
        salary=payload.salary or "",
        skills_required=payload.skills_required or [],
        job_description=payload.job_description,
        status=status_val,
        created_at=str(dates[0]),
        updated_at=str(dates[1]),
    )


@router.get("")
def list_jobs(
    org_id: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """List job vacancies with filtering by org_id, branch_id, status, and search."""
    target_org = organization_id or org_id
    where_clauses = []
    params = []

    if target_org and target_org.strip():
        where_clauses.append("v.organization_id = %s")
        params.append(target_org.strip())

    if branch_id and branch_id.strip():
        where_clauses.append("v.branch_id = %s")
        params.append(branch_id.strip())

    if status and status.strip():
        where_clauses.append("v.status = %s")
        params.append(status.strip().lower())

    if search and search.strip():
        s = f"%{search.strip()}%"
        where_clauses.append("(v.job_title ILIKE %s OR v.department ILIKE %s OR v.location ILIKE %s OR v.skills_required ILIKE %s)")
        params.extend([s, s, s, s])

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            sql = f"""
                SELECT v.id, v.organization_id, v.branch_id, COALESCE(b.branch_name, ''), v.created_by_hr_id,
                       v.job_title, COALESCE(v.department, ''), v.employment_type, v.work_mode,
                       COALESCE(v.location, ''), v.openings, COALESCE(v.experience_required, ''),
                       COALESCE(v.salary, ''), COALESCE(v.skills_required, ''), v.job_description,
                       v.status, v.closed_at, v.created_at, v.updated_at
                FROM job_vacancies v
                LEFT JOIN branches b ON v.branch_id = b.id
                {where_sql}
                ORDER BY v.created_at DESC
            """
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            jobs = []
            for r in rows:
                jobs.append({
                    "job_id": str(r[0]),
                    "organization_id": str(r[1]),
                    "branch_id": str(r[2]) if r[2] else "",
                    "branch_name": r[3] or "",
                    "created_by_hr_id": str(r[4]) if r[4] else "",
                    "job_title": r[5],
                    "title": r[5], # Legacy alias
                    "department": r[6],
                    "employment_type": r[7],
                    "work_mode": r[8],
                    "location": r[9],
                    "openings": r[10],
                    "experience_required": r[11],
                    "salary": r[12],
                    "skills_required": r[13].split(",") if r[13] else [],
                    "job_description": r[14],
                    "description": r[14], # Legacy alias
                    "status": r[15],
                    "closed_at": str(r[16]) if r[16] else None,
                    "created_at": str(r[17]),
                    "updated_at": str(r[18]),
                })
    return {"jobs": jobs}


@router.get("/{job_id}")
def get_job(job_id: str):
    """Get details of a single Job Vacancy."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.id, v.organization_id, v.branch_id, COALESCE(b.branch_name, ''), v.created_by_hr_id,
                       v.job_title, COALESCE(v.department, ''), v.employment_type, v.work_mode,
                       COALESCE(v.location, ''), v.openings, COALESCE(v.experience_required, ''),
                       COALESCE(v.salary, ''), COALESCE(v.skills_required, ''), v.job_description,
                       v.status, v.closed_at, v.created_at, v.updated_at
                FROM job_vacancies v
                LEFT JOIN branches b ON v.branch_id = b.id
                WHERE v.id = %s
                """,
                (job_id,),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Job Vacancy not found")

    return {
        "job_id": str(r[0]),
        "organization_id": str(r[1]),
        "branch_id": str(r[2]) if r[2] else "",
        "branch_name": r[3] or "",
        "created_by_hr_id": str(r[4]) if r[4] else "",
        "job_title": r[5],
        "title": r[5],
        "department": r[6],
        "employment_type": r[7],
        "work_mode": r[8],
        "location": r[9],
        "openings": r[10],
        "experience_required": r[11],
        "salary": r[12],
        "skills_required": r[13].split(",") if r[13] else [],
        "job_description": r[14],
        "description": r[14],
        "status": r[15],
        "closed_at": str(r[16]) if r[16] else None,
        "created_at": str(r[17]),
        "updated_at": str(r[18]),
    }


@router.put("/{job_id}", response_model=JobResponse)
def update_job(job_id: str, payload: UpdateJobRequest):
    """Update a Job Vacancy record."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, organization_id, branch_id, created_by_hr_id, job_title, department,
                       employment_type, work_mode, location, openings, experience_required,
                       salary, skills_required, job_description, status, closed_at, created_at
                FROM job_vacancies
                WHERE id = %s
                LIMIT 1
                """,
                (job_id,),
            )
            curr = cur.fetchone()
            if not curr:
                raise HTTPException(status_code=404, detail="Job Vacancy not found")

            new_branch_id = payload.branch_id if payload.branch_id is not None else curr[2]
            new_title = payload.job_title.strip() if payload.job_title is not None else curr[4]
            new_dept = payload.department.strip() if payload.department is not None else curr[5]
            new_emp_type = payload.employment_type.strip() if payload.employment_type is not None else curr[6]
            new_work_mode = payload.work_mode.strip() if payload.work_mode is not None else curr[7]
            new_location = payload.location.strip() if payload.location is not None else curr[8]
            new_openings = payload.openings if payload.openings is not None else curr[9]
            new_exp = payload.experience_required.strip() if payload.experience_required is not None else curr[10]
            new_salary = payload.salary.strip() if payload.salary is not None else curr[11]

            if payload.skills_required is not None:
                new_skills = ",".join(payload.skills_required)
            else:
                new_skills = curr[12] or ""

            new_desc = payload.job_description if payload.job_description is not None else curr[13]
            new_status = payload.status.lower().strip() if payload.status is not None else curr[14]

            new_closed_at = curr[15]
            if new_status == "closed" and curr[14] != "closed":
                new_closed_at = datetime.now(timezone.utc)
            elif new_status != "closed":
                new_closed_at = None

            cur.execute(
                """
                UPDATE job_vacancies
                SET branch_id = %s, job_title = %s, department = %s, employment_type = %s, 
                    work_mode = %s, location = %s, openings = %s, experience_required = %s, 
                    salary = %s, skills_required = %s, job_description = %s, status = %s, 
                    closed_at = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING created_at, updated_at
                """,
                (
                    new_branch_id, new_title, new_dept, new_emp_type, new_work_mode,
                    new_location, new_openings, new_exp, new_salary, new_skills,
                    new_desc, new_status, new_closed_at, job_id,
                ),
            )
            dates = cur.fetchone()
            conn.commit()

            branch_name = ""
            if new_branch_id:
                cur.execute("SELECT branch_name FROM branches WHERE id = %s", (new_branch_id,))
                brow = cur.fetchone()
                if brow:
                    branch_name = brow[0]

    logger.info("Job Vacancy updated: %s (id=%s)", new_title, job_id)
    return JobResponse(
        job_id=job_id,
        organization_id=str(curr[1]),
        branch_id=str(new_branch_id) if new_branch_id else "",
        branch_name=branch_name,
        created_by_hr_id=str(curr[3]) if curr[3] else "",
        job_title=new_title,
        department=new_dept,
        employment_type=new_emp_type,
        work_mode=new_work_mode,
        location=new_location,
        openings=new_openings,
        experience_required=new_exp,
        salary=new_salary,
        skills_required=new_skills.split(",") if new_skills else [],
        job_description=new_desc,
        status=new_status,
        closed_at=str(new_closed_at) if new_closed_at else None,
        created_at=str(dates[0]),
        updated_at=str(dates[1]),
    )


@router.delete("/{job_id}")
def delete_job(job_id: str):
    """Delete a Job Vacancy record."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM job_vacancies WHERE id = %s RETURNING id", (job_id,))
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(status_code=404, detail="Job Vacancy not found")
            conn.commit()

    logger.info("Job Vacancy deleted: %s", job_id)
    return {"message": "Job Vacancy deleted successfully", "job_id": job_id}


@router.post("/generate-jd")
def generate_jd(payload: GenerateJDRequest):
    """Generate a professional job description using AI."""
    title_to_use = payload.job_title
    jd = generate_job_description(
        title=title_to_use,
        department=payload.department or "General",
        location=payload.location or "Office",
        job_type=payload.employment_type or "Full-time",
        experience_required=payload.experience_required or "Entry-level",
        skills_required=payload.skills_required or [],
    )
    return {"description": jd}
