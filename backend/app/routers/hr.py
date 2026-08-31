from fastapi import APIRouter
from app.database import get_db_connection

router = APIRouter(prefix="/api/hr", tags=["hr"])


@router.get("/dashboard")
def hr_dashboard(org_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Get total jobs
            cur.execute("SELECT COUNT(*) FROM jd_description WHERE org_id = %s", (org_id,))
            total_jobs = cur.fetchone()[0]
            
            # Get total candidates
            cur.execute("SELECT COUNT(*) FROM candidates WHERE org_id = %s", (org_id,))
            total_candidates = cur.fetchone()[0]
            
            # Get company name
            cur.execute("SELECT company_name FROM organization WHERE id = %s", (org_id,))
            org = cur.fetchone()
            company_name = org[0] if org else "Your Company"

    return {
        "company_name": company_name,
        "total_jobs": total_jobs,
        "total_candidates": total_candidates,
    }
