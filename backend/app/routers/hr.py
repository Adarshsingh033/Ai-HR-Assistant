"""Router: HR — dashboard statistics."""

from fastapi import APIRouter

from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/hr", tags=["hr"])


@router.get("/dashboard")
def hr_dashboard(org_id: str):
    """Return dashboard statistics for an organization."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM jd_description WHERE org_id = %s", (org_id,))
            total_jobs = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM candidates WHERE org_id = %s", (org_id,))
            total_candidates = cur.fetchone()[0]

            cur.execute("SELECT company_name FROM organization WHERE id = %s", (org_id,))
            org = cur.fetchone()
            company_name = org[0] if org else "Your Company"

    logger.info("Dashboard loaded for org '%s': %d jobs, %d candidates.", org_id, total_jobs, total_candidates)
    return {
        "company_name": company_name,
        "total_jobs": total_jobs,
        "total_candidates": total_candidates,
    }
