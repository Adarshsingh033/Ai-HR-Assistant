"""Router: HR — dashboard statistics & profile management."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import HRProfileResponse, UpdateHRProfileRequest, ChangePasswordRequest
from app.database import get_db_connection
from app.services.auth_service import check_hr_admin_uniqueness
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/hr", tags=["hr"])


@router.get("/dashboard")
def hr_dashboard(org_id: str):
    """Return dashboard statistics for an organization."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM job_vacancies WHERE organization_id = %s", (org_id,))
            total_jobs = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM job_vacancies WHERE organization_id = %s AND status = 'active'", (org_id,))
            active_jobs = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM candidates WHERE org_id = %s", (org_id,))
            total_candidates = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM candidates WHERE org_id = %s AND reached = true", (org_id,))
            shortlisted_candidates = cur.fetchone()[0]

            cur.execute("SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s", (org_id,))
            org = cur.fetchone()
            company_name = org[0] if org else "Your Company"

            # Status distribution (mapped from 'reached' boolean)
            cur.execute("SELECT reached, COUNT(*) FROM candidates WHERE org_id = %s GROUP BY reached", (org_id,))
            status_dist_rows = cur.fetchall()
            status_distribution = {}
            for row in status_dist_rows:
                status_label = "Contacted" if row[0] else "Pending"
                status_distribution[status_label] = row[1]

            # Recent Jobs with Candidate Count
            cur.execute("""
                SELECT j.id, j.job_title, j.status, 
                       (SELECT COUNT(*) FROM candidates c WHERE c.job_id = j.id) as candidate_count
                FROM job_vacancies j
                WHERE j.organization_id = %s
                ORDER BY j.created_at DESC
                LIMIT 5
            """, (org_id,))
            recent_jobs_rows = cur.fetchall()
            recent_jobs = [
                {
                    "id": str(r[0]),
                    "title": r[1],
                    "status": r[2],
                    "candidate_count": r[3]
                } for r in recent_jobs_rows
            ] if recent_jobs_rows else []

    logger.info("Dashboard loaded for org '%s': %d jobs, %d candidates.", org_id, total_jobs, total_candidates)
    return {
        "company_name": company_name,
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "total_candidates": total_candidates,
        "shortlisted_candidates": shortlisted_candidates,
        "status_distribution": status_distribution,
        "recent_jobs": recent_jobs,
    }



@router.get("/profile", response_model=HRProfileResponse)
def get_hr_profile(x_user_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    """Fetch profile data for the current HR user."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User identification header missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Try organization_members table
            cur.execute(
                """
                SELECT m.id, m.username, m.email, m.full_name, m.phone, m.image,
                       m.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       m.branch_id, COALESCE(b.branch_name, ''), m.created_at
                FROM organization_members m
                LEFT JOIN organization o ON m.organization_id = o.id
                LEFT JOIN branches b ON m.branch_id = b.id
                WHERE m.id = %s
                LIMIT 1
                """,
                (x_user_id,),
            )
            row = cur.fetchone()
            if row:
                return HRProfileResponse(
                    user_id=str(row[0]),
                    username=row[1],
                    email=row[2],
                    full_name=row[3],
                    phone=row[4] or "",
                    profile_image=row[5] or "",
                    role="hr",
                    org_id=str(row[6]) if row[6] else "",
                    organization_name=row[7] or "",
                    branch_id=str(row[8]) if row[8] else "",
                    branch_name=row[9] or "",
                    created_at=str(row[10]),
                )

            # 2. Legacy hr table fallback
            cur.execute(
                """
                SELECT h.id, h.username, h.email, h.full_name, h.org_id,
                       COALESCE(o.organization_name, o.company_name, ''), h.created_at
                FROM hr h
                LEFT JOIN organization o ON h.org_id = o.id
                WHERE h.id = %s
                LIMIT 1
                """,
                (x_user_id,),
            )
            row = cur.fetchone()
            if row:
                return HRProfileResponse(
                    user_id=str(row[0]),
                    username=row[1],
                    email=row[2],
                    full_name=row[3],
                    phone="",
                    profile_image="",
                    role="hr",
                    org_id=str(row[4]) if row[4] else "",
                    organization_name=row[5] or "",
                    branch_id="",
                    branch_name="",
                    created_at=str(row[6]),
                )

            # 3. Admin table fallback (if admin accesses HR panel)
            cur.execute(
                "SELECT id, username, email, full_name, phone, profile_image, created_at FROM admin WHERE id = %s LIMIT 1",
                (x_user_id,),
            )
            row = cur.fetchone()
            if row:
                return HRProfileResponse(
                    user_id=str(row[0]),
                    username=row[1],
                    email=row[2],
                    full_name=row[3],
                    phone=row[4] or "",
                    profile_image=row[5] or "",
                    role="admin",
                    org_id="",
                    organization_name="System Administration",
                    branch_id="",
                    branch_name="Main Headquarters",
                    created_at=str(row[6]),
                )

    raise HTTPException(status_code=404, detail="HR Profile not found")


@router.put("/profile", response_model=HRProfileResponse)
def update_hr_profile(
    payload: UpdateHRProfileRequest,
    x_user_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update profile data for the current HR user."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User identification header missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check organization_members
            cur.execute(
                """
                SELECT m.id, m.username, m.email, m.full_name, m.phone, m.image,
                       m.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       m.branch_id, COALESCE(b.branch_name, ''), m.created_at
                FROM organization_members m
                LEFT JOIN organization o ON m.organization_id = o.id
                LEFT JOIN branches b ON m.branch_id = b.id
                WHERE m.id = %s
                LIMIT 1
                """,
                (x_user_id,),
            )
            curr = cur.fetchone()

            if curr:
                new_full_name = payload.full_name.strip() if payload.full_name is not None else curr[3]
                new_username = payload.username.strip() if payload.username is not None else curr[1]
                new_email = payload.email.lower().strip() if payload.email is not None else curr[2]
                new_phone = payload.phone.strip() if payload.phone is not None else (curr[4] or "")
                new_image = payload.profile_image if payload.profile_image is not None else curr[5]

                # Check unique username, email, phone across Admin & HR users
                check_hr_admin_uniqueness(cur, username=new_username, email=new_email, phone=new_phone, exclude_id=x_user_id)

                cur.execute(
                    """
                    UPDATE organization_members
                    SET full_name = %s, username = %s, email = %s, phone = %s, image = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (new_full_name, new_username, new_email, new_phone, new_image, x_user_id),
                )
                conn.commit()

                return HRProfileResponse(
                    user_id=x_user_id,
                    username=new_username,
                    email=new_email,
                    full_name=new_full_name,
                    phone=new_phone,
                    profile_image=new_image or "",
                    role="hr",
                    org_id=str(curr[6]) if curr[6] else "",
                    organization_name=curr[7] or "",
                    branch_id=str(curr[8]) if curr[8] else "",
                    branch_name=curr[9] or "",
                    created_at=str(curr[10]),
                )

            # Fallback legacy hr table
            cur.execute("SELECT id, username, email, full_name, org_id FROM hr WHERE id = %s LIMIT 1", (x_user_id,))
            curr_hr = cur.fetchone()
            if curr_hr:
                new_full_name = payload.full_name.strip() if payload.full_name is not None else curr_hr[3]
                new_username = payload.username.strip() if payload.username is not None else curr_hr[1]
                new_email = payload.email.lower().strip() if payload.email is not None else curr_hr[2]

                cur.execute(
                    "UPDATE hr SET full_name = %s, username = %s, email = %s WHERE id = %s",
                    (new_full_name, new_username, new_email, x_user_id),
                )
                conn.commit()

                cur.execute("SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s", (curr_hr[4],))
                o_row = cur.fetchone()
                org_name = o_row[0] if o_row else ""

                return HRProfileResponse(
                    user_id=x_user_id,
                    username=new_username,
                    email=new_email,
                    full_name=new_full_name,
                    phone="",
                    profile_image="",
                    role="hr",
                    org_id=str(curr_hr[4]) if curr_hr[4] else "",
                    organization_name=org_name,
                    branch_id="",
                    branch_name="",
                    created_at="",
                )

    raise HTTPException(status_code=404, detail="HR Profile not found for update")


@router.put("/change-password")
def change_hr_password(
    payload: ChangePasswordRequest,
    x_user_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Change password for current HR user with validation."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User identification header missing. Please re-login.")

    old_pass = payload.old_password.strip()
    new_pass = payload.new_password.strip()
    confirm_pass = payload.confirm_password.strip()

    if not old_pass or not new_pass or not confirm_pass:
        raise HTTPException(status_code=400, detail="All password fields (Old Password, New Password, and Confirm Password) are required.")

    if new_pass != confirm_pass:
        raise HTTPException(status_code=400, detail="New password and confirm password do not match.")

    if old_pass == new_pass:
        raise HTTPException(status_code=400, detail="New password cannot be the same as your old password.")

    if len(new_pass) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Try organization_members
            cur.execute("SELECT id, password FROM organization_members WHERE id = %s LIMIT 1", (x_user_id,))
            member = cur.fetchone()
            if member:
                if member[1] != old_pass:
                    raise HTTPException(status_code=400, detail="Incorrect old password. Please try again.")
                cur.execute("UPDATE organization_members SET password = %s, updated_at = NOW() WHERE id = %s", (new_pass, x_user_id))
                conn.commit()
                logger.info("Password successfully updated for organization_member user_id '%s'", x_user_id)
                return {"message": "Password changed successfully."}

            # 2. Try legacy hr table
            cur.execute("SELECT id, password FROM hr WHERE id = %s LIMIT 1", (x_user_id,))
            hr_user = cur.fetchone()
            if hr_user:
                if hr_user[1] != old_pass:
                    raise HTTPException(status_code=400, detail="Incorrect old password. Please try again.")
                cur.execute("UPDATE hr SET password = %s WHERE id = %s", (new_pass, x_user_id))
                conn.commit()
                logger.info("Password successfully updated for hr user_id '%s'", x_user_id)
                return {"message": "Password changed successfully."}

            # 3. Try admin table
            cur.execute("SELECT id, password FROM admin WHERE id = %s LIMIT 1", (x_user_id,))
            admin_user = cur.fetchone()
            if admin_user:
                if admin_user[1] != old_pass:
                    raise HTTPException(status_code=400, detail="Incorrect old password. Please try again.")
                cur.execute("UPDATE admin SET password = %s WHERE id = %s", (new_pass, x_user_id))
                conn.commit()
                logger.info("Password successfully updated for admin user_id '%s'", x_user_id)
                return {"message": "Password changed successfully."}

    raise HTTPException(status_code=404, detail="User profile not found for password update.")


