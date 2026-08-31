"""Router: Jobs — CRUD operations and AI-powered job description generation."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.schemas import CreateJobRequest, JobResponse, GenerateJDRequest
from app.database import get_db_connection
from app.services.ai_service import generate_job_description
from app.services.embedding_service import get_embedding
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse)
def create_job(payload: CreateJobRequest):
    """Create a new job posting with auto-generated embedding."""
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    skills_str = ",".join(payload.skills_required)

    embedding = get_embedding(payload.description)

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jd_description (id, title, description, embedding, org_id, hr_id, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (job_id, payload.title, payload.description, embedding, payload.org_id, payload.hr_id, now),
            )

            detail_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO jd_details (id, description_id, title, department, location, job_type, experience, skills, hr_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (detail_id, job_id, payload.title, payload.department, payload.location, payload.job_type, payload.experience_required, skills_str, payload.hr_id),
            )
            conn.commit()

    logger.info("Job created: %s (id=%s, hr=%s)", payload.title, job_id, payload.hr_id)
    return JobResponse(
        job_id=job_id,
        title=payload.title,
        department=payload.department,
        location=payload.location,
        job_type=payload.job_type,
        experience_required=payload.experience_required,
        skills_required=payload.skills_required,
        description=payload.description,
        org_id=payload.org_id,
        hr_id=payload.hr_id,
        created_at=now,
    )


@router.get("")
def list_jobs(org_id: str):
    """List all job postings for an organization."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT jd.id, jd.title, jd.description, jd.org_id, jd.created_at,
                       det.department, det.location, det.job_type, det.experience, det.skills, jd.hr_id
                FROM jd_description jd
                JOIN jd_details det ON jd.id = det.description_id
                WHERE jd.org_id = %s
                ORDER BY jd.created_at DESC
                """,
                (org_id,),
            )
            rows = cur.fetchall()

            jobs = []
            for r in rows:
                jobs.append({
                    "job_id": str(r[0]),
                    "title": r[1],
                    "description": r[2],
                    "org_id": str(r[3]),
                    "created_at": str(r[4]),
                    "department": r[5],
                    "location": r[6],
                    "job_type": r[7],
                    "experience_required": r[8],
                    "skills_required": r[9].split(",") if r[9] else [],
                    "hr_id": str(r[10]) if r[10] else None,
                })
    return {"jobs": jobs}


@router.get("/{job_id}")
def get_job(job_id: str):
    """Get a single job posting by ID."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT jd.id, jd.title, jd.description, jd.org_id, jd.created_at,
                       det.department, det.location, det.job_type, det.experience, det.skills, jd.hr_id
                FROM jd_description jd
                JOIN jd_details det ON jd.id = det.description_id
                WHERE jd.id = %s
                """,
                (job_id,),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": str(r[0]),
        "title": r[1],
        "description": r[2],
        "org_id": str(r[3]),
        "created_at": str(r[4]),
        "department": r[5],
        "location": r[6],
        "job_type": r[7],
        "experience_required": r[8],
        "skills_required": r[9].split(",") if r[9] else [],
        "hr_id": str(r[10]) if r[10] else None,
    }


@router.delete("/{job_id}")
def delete_job(job_id: str):
    """Delete a job posting."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM jd_description WHERE id = %s", (job_id,))
            conn.commit()
    logger.info("Job deleted: %s", job_id)
    return {"message": "Job deleted successfully"}


@router.post("/generate-jd")
def generate_jd(payload: GenerateJDRequest):
    """Generate a professional job description using AI."""
    jd = generate_job_description(
        title=payload.title,
        department=payload.department,
        location=payload.location,
        job_type=payload.job_type,
        experience_required=payload.experience_required,
        skills_required=payload.skills_required,
    )
    return {"description": jd}
