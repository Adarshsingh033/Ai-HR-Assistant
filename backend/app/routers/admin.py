"""Router: Admin — organization and HR user management."""

import uuid
import math
from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.models.schemas import (
    CreateOrgRequest, UpdateOrgRequest, OrganizationResponse,
    CreateBranchRequest, UpdateBranchRequest, BranchResponse,
    CreateMemberRequest, UpdateMemberRequest, MemberResponse,
    CreateHRRequest, AssignHRRequest, HRResponse,
    AdminProfileResponse, UpdateAdminProfileRequest,
)
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard/stats")
def get_dashboard_stats(
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Fetch aggregated admin dashboard metrics and recent system items."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Organization Stats
            cur.execute(
                """
                SELECT 
                    COUNT(*),
                    COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL),
                    COUNT(*) FILTER (WHERE status = 'inactive')
                FROM organization 
                WHERE admin_id = %s
                """,
                (x_admin_id,),
            )
            org_stats = cur.fetchone()
            total_orgs = org_stats[0]
            active_orgs = org_stats[1]
            inactive_orgs = org_stats[2]

            # 2. Branch Stats
            cur.execute(
                "SELECT COUNT(*) FROM branches WHERE created_by_admin_id = %s",
                (x_admin_id,),
            )
            total_branches = cur.fetchone()[0]

            # 3. HR Members Stats
            cur.execute(
                """
                SELECT 
                    COUNT(*),
                    COUNT(*) FILTER (WHERE status = 'active'),
                    COUNT(*) FILTER (WHERE status = 'inactive')
                FROM organization_members 
                WHERE created_by_admin_id = %s
                """,
                (x_admin_id,),
            )
            hr_stats = cur.fetchone()
            total_hrs = hr_stats[0]
            active_hrs = hr_stats[1]
            inactive_hrs = hr_stats[2]

            # 4. Recent HR Managers (Top 5)
            cur.execute(
                """
                SELECT m.id, m.full_name, m.username, m.email, m.phone, m.image, m.status, 
                       COALESCE(o.organization_name, o.company_name, ''), b.branch_name, m.created_at
                FROM organization_members m
                JOIN organization o ON m.organization_id = o.id
                JOIN branches b ON m.branch_id = b.id
                WHERE m.created_by_admin_id = %s
                ORDER BY m.created_at DESC
                LIMIT 5
                """,
                (x_admin_id,),
            )
            recent_hrs_rows = cur.fetchall()
            recent_hrs = [
                {
                    "member_id": str(r[0]),
                    "full_name": r[1],
                    "username": r[2],
                    "email": r[3],
                    "phone": r[4] or "",
                    "image": r[5],
                    "status": r[6],
                    "organization_name": r[7],
                    "branch_name": r[8],
                    "created_at": str(r[9]),
                }
                for r in recent_hrs_rows
            ]

            # 5. Recent Organizations Overview with Branch & HR counts (Top 5)
            cur.execute(
                """
                SELECT o.id, COALESCE(o.organization_name, o.company_name, ''), o.industry, o.company_size, o.image, COALESCE(o.status, 'active'),
                       COUNT(DISTINCT b.id) as branch_count,
                       COUNT(DISTINCT m.id) as hr_count,
                       o.created_at
                FROM organization o
                LEFT JOIN branches b ON b.organization_id = o.id
                LEFT JOIN organization_members m ON m.organization_id = o.id
                WHERE o.admin_id = %s
                GROUP BY o.id
                ORDER BY o.created_at DESC
                LIMIT 5
                """,
                (x_admin_id,),
            )
            recent_orgs_rows = cur.fetchall()
            recent_orgs = [
                {
                    "org_id": str(r[0]),
                    "organization_name": r[1],
                    "industry": r[2] or "N/A",
                    "company_size": r[3] or "N/A",
                    "image": r[4],
                    "status": r[5],
                    "branch_count": r[6],
                    "hr_count": r[7],
                    "created_at": str(r[8]),
                }
                for r in recent_orgs_rows
            ]

            # 6. Graph 1: Branches per Organization
            cur.execute(
                """
                SELECT COALESCE(o.organization_name, o.company_name, 'Unnamed Org'), COUNT(b.id) as branch_count
                FROM organization o
                LEFT JOIN branches b ON b.organization_id = o.id
                WHERE o.admin_id = %s
                GROUP BY o.id
                ORDER BY branch_count DESC, o.organization_name ASC
                """,
                (x_admin_id,),
            )
            branches_per_org = [
                {"organization": r[0], "count": r[1]}
                for r in cur.fetchall()
            ]

            # 7. Graph 2: HR Managers per Branch
            cur.execute(
                """
                SELECT COALESCE(o.organization_name, o.company_name, 'Org') || ' - ' || b.branch_name as label,
                       COUNT(m.id) as hr_count
                FROM branches b
                JOIN organization o ON b.organization_id = o.id
                LEFT JOIN organization_members m ON m.branch_id = b.id
                WHERE b.created_by_admin_id = %s
                GROUP BY b.id, o.id
                ORDER BY hr_count DESC, b.branch_name ASC
                """,
                (x_admin_id,),
            )
            hrs_per_branch = [
                {"branch": r[0], "count": r[1]}
                for r in cur.fetchall()
            ]

    return {
        "metrics": {
            "total_organizations": total_orgs,
            "active_organizations": active_orgs,
            "inactive_organizations": inactive_orgs,
            "total_branches": total_branches,
            "total_hr_managers": total_hrs,
            "active_hr_managers": active_hrs,
            "inactive_hr_managers": inactive_hrs,
        },
        "recent_hr_managers": recent_hrs,
        "recent_organizations": recent_orgs,
        "branches_per_org": branches_per_org,
        "hrs_per_branch": hrs_per_branch,
    }


@router.get("/profile", response_model=AdminProfileResponse)
def get_admin_profile(x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    """Fetch current admin's profile data dynamically from the database."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, full_name, phone, profile_image, created_at FROM admin WHERE id = %s LIMIT 1",
                (x_admin_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Admin profile not found.")

            return AdminProfileResponse(
                user_id=str(row[0]),
                username=row[1],
                email=row[2],
                full_name=row[3],
                phone=row[4] or "",
                profile_image=row[5] or "",
                role="admin",
                created_at=str(row[6]) if row[6] else "",
            )


@router.put("/profile", response_model=AdminProfileResponse)
def update_admin_profile(
    payload: UpdateAdminProfileRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update current admin's profile data in the database."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, full_name, phone, profile_image, created_at FROM admin WHERE id = %s LIMIT 1",
                (x_admin_id,),
            )
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Admin user not found.")

            new_full_name = payload.full_name.strip() if payload.full_name is not None else current[3]
            new_username = payload.username.strip().lower() if payload.username is not None else current[1]
            new_email = str(payload.email).strip().lower() if payload.email is not None else current[2]
            new_phone = payload.phone.strip() if payload.phone is not None else current[4]
            new_profile_image = payload.profile_image if payload.profile_image is not None else current[5]

            # Check unique username if changing
            if new_username != current[1]:
                cur.execute("SELECT id FROM admin WHERE username = %s AND id != %s LIMIT 1", (new_username, x_admin_id))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Username is already taken by another admin.")

            # Check unique email if changing
            if new_email != current[2]:
                cur.execute("SELECT id FROM admin WHERE email = %s AND id != %s LIMIT 1", (new_email, x_admin_id))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Email is already taken by another admin.")

            cur.execute(
                """
                UPDATE admin
                SET full_name = %s, username = %s, email = %s, phone = %s, profile_image = %s
                WHERE id = %s
                """,
                (new_full_name, new_username, new_email, new_phone, new_profile_image, x_admin_id),
            )
            conn.commit()

            logger.info("Admin profile updated for: %s", new_username)
            return AdminProfileResponse(
                user_id=str(current[0]),
                username=new_username,
                email=new_email,
                full_name=new_full_name,
                phone=new_phone or "",
                profile_image=new_profile_image or "",
                role="admin",
                created_at=str(current[6]) if current[6] else "",
            )


@router.post("/organizations", response_model=OrganizationResponse)
def create_organization(
    payload: CreateOrgRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new organization under the current admin."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    org_id = str(uuid.uuid4())
    status_val = payload.status.value if payload.status else "active"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO organization (id, company_name, organization_name, industry, company_size, status, image, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING created_at
                """,
                (
                    org_id,
                    payload.organization_name,
                    payload.organization_name,
                    payload.industry.value,
                    payload.company_size.value,
                    status_val,
                    payload.image,
                    x_admin_id,
                ),
            )
            created_at = cur.fetchone()[0]
            conn.commit()

    logger.info("Organization created: %s (id=%s, status=%s)", payload.organization_name, org_id, status_val)
    return OrganizationResponse(
        org_id=org_id,
        organization_name=payload.organization_name,
        industry=payload.industry.value,
        company_size=payload.company_size.value,
        status=status_val,
        image=payload.image or "",
        created_at=str(created_at),
    )


@router.get("/organizations")
def list_organizations(
    search: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    company_size: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List all organizations belonging to the current admin with search, filter, and pagination support."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    where_clause = " WHERE admin_id = %s"
    params = [x_admin_id]

    if search and search.strip():
        where_clause += " AND (organization_name ILIKE %s OR company_name ILIKE %s)"
        s = f"%{search.strip()}%"
        params.extend([s, s])

    if industry and industry.strip():
        where_clause += " AND industry = %s"
        params.append(industry.strip())

    if company_size and company_size.strip():
        where_clause += " AND company_size = %s"
        params.append(company_size.strip())

    if status and status.strip():
        where_clause += " AND status = %s"
        params.append(status.strip().lower())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Count Total Rows
            count_sql = "SELECT COUNT(*) FROM organization" + where_clause
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            # 2. Paginated Data Query
            offset = (page - 1) * limit
            data_sql = """
                SELECT id, COALESCE(organization_name, company_name, ''), COALESCE(industry, 'information_technology'), COALESCE(company_size, '1-10'), COALESCE(status, 'active'), image, created_at
                FROM organization
            """ + where_clause + " ORDER BY created_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            orgs = [
                {
                    "org_id": str(r[0]),
                    "organization_name": r[1],
                    "industry": r[2],
                    "company_size": r[3],
                    "status": r[4],
                    "image": r[5] or "",
                    "created_at": str(r[6]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "organizations": orgs,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/organizations/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Get single organization details."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, COALESCE(organization_name, company_name, ''), COALESCE(industry, 'information_technology'), COALESCE(company_size, '1-10'), COALESCE(status, 'active'), image, created_at
                FROM organization
                WHERE id = %s AND admin_id = %s
                """,
                (org_id, x_admin_id),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Organization not found")
            return OrganizationResponse(
                org_id=str(r[0]),
                organization_name=r[1],
                industry=r[2],
                company_size=r[3],
                status=r[4],
                image=r[5] or "",
                created_at=str(r[6]),
            )


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: str,
    payload: UpdateOrgRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update organization details."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, organization_name, industry, company_size, status, image, created_at FROM organization WHERE id = %s AND admin_id = %s LIMIT 1",
                (org_id, x_admin_id),
            )
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")

            new_name = payload.organization_name if payload.organization_name is not None else current[1]
            new_ind = payload.industry.value if payload.industry is not None else current[2]
            new_size = payload.company_size.value if payload.company_size is not None else current[3]
            new_status = payload.status.value if payload.status is not None else current[4]
            new_img = payload.image if payload.image is not None else current[5]

            cur.execute(
                """
                UPDATE organization
                SET organization_name = %s, company_name = %s, industry = %s, company_size = %s, status = %s, image = %s
                WHERE id = %s AND admin_id = %s
                """,
                (new_name, new_name, new_ind, new_size, new_status, new_img, org_id, x_admin_id),
            )
            conn.commit()

            return OrganizationResponse(
                org_id=org_id,
                organization_name=new_name,
                industry=new_ind,
                company_size=new_size,
                status=new_status,
                image=new_img or "",
                created_at=str(current[6]),
            )


@router.post("/hrs", response_model=HRResponse)
def create_hr(
    payload: CreateHRRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new HR user under the current admin."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    hr_id = str(uuid.uuid4())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Unique username check
            cur.execute("SELECT id FROM hr WHERE username = %s LIMIT 1", (payload.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="HR username already exists")

            # Unique email check
            cur.execute("SELECT id FROM hr WHERE email = %s LIMIT 1", (payload.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="HR email already exists")

            cur.execute(
                """
                INSERT INTO hr (id, username, email, password, full_name, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING created_at
                """,
                (hr_id, payload.username, payload.email, payload.password, payload.full_name, x_admin_id),
            )
            created_at = cur.fetchone()[0]
            conn.commit()

    logger.info("HR user created: %s (id=%s)", payload.username, hr_id)
    return HRResponse(
        hr_id=hr_id,
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        org_id="",
        created_at=str(created_at),
    )


@router.get("/hrs")
def list_hrs(x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    """List all HR users belonging to the current admin."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, email, full_name, org_id, created_at FROM hr WHERE admin_id = %s ORDER BY created_at DESC",
                (x_admin_id,),
            )
            rows = cur.fetchall()
            hrs = [
                {
                    "hr_id": str(r[0]),
                    "username": r[1],
                    "email": r[2],
                    "full_name": r[3],
                    "org_id": str(r[4]) if r[4] else "",
                    "created_at": str(r[5]),
                }
                for r in rows
            ]
    return {"hrs": hrs}


@router.post("/assign-hr")
def assign_hr(
    payload: AssignHRRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Assign an HR user to an organization."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Verify HR exists and belongs to this admin
            cur.execute("SELECT username FROM hr WHERE id = %s AND admin_id = %s", (payload.hr_id, x_admin_id))
            hr_record = cur.fetchone()
            if not hr_record:
                raise HTTPException(status_code=404, detail="HR user not found or access denied")

            # Verify Org exists and belongs to this admin
            cur.execute("SELECT company_name FROM organization WHERE id = %s AND admin_id = %s", (payload.org_id, x_admin_id))
            org_record = cur.fetchone()
            if not org_record:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")

            cur.execute("UPDATE hr SET org_id = %s WHERE id = %s", (payload.org_id, payload.hr_id))
            conn.commit()

            logger.info("HR '%s' assigned to organization '%s'.", hr_record[0], org_record[0])
            return {"message": f"HR '{hr_record[0]}' assigned to '{org_record[0]}' successfully"}


@router.delete("/organizations/{org_id}")
def delete_organization(
    org_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete an organization and unassign linked HR users."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM organization WHERE id = %s AND admin_id = %s", (org_id, x_admin_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Organization not found or access denied")

            cur.execute("DELETE FROM organization WHERE id = %s", (org_id,))
            conn.commit()

    logger.info("Organization deleted: %s", org_id)
    return {"message": "Organization deleted successfully and linked HRs unassigned"}


# ── Branch Management Endpoints ──────────────────────────────────────────────

@router.post("/branches", response_model=BranchResponse)
def create_branch(
    payload: CreateBranchRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new branch for an organization."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    branch_id = str(uuid.uuid4())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Verify Organization belongs to current admin
            cur.execute("SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s AND admin_id = %s", (payload.organization_id, x_admin_id))
            org_row = cur.fetchone()
            if not org_row:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")
            org_name = org_row[0]

            # Check unique branch_code per organization if provided
            if payload.branch_code and payload.branch_code.strip():
                cur.execute(
                    "SELECT id FROM branches WHERE organization_id = %s AND branch_code = %s LIMIT 1",
                    (payload.organization_id, payload.branch_code.strip()),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Branch code already exists for this organization")

            cur.execute(
                """
                INSERT INTO branches (id, organization_id, created_by_admin_id, branch_name, branch_code, city, state, country)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING created_at, updated_at
                """,
                (
                    branch_id,
                    payload.organization_id,
                    x_admin_id,
                    payload.branch_name.strip(),
                    payload.branch_code.strip() if payload.branch_code else None,
                    payload.city.strip() if payload.city else None,
                    payload.state.strip() if payload.state else None,
                    payload.country.strip() if payload.country else None,
                ),
            )
            dates = cur.fetchone()
            conn.commit()

    logger.info("Branch created: %s (id=%s)", payload.branch_name, branch_id)
    return BranchResponse(
        branch_id=branch_id,
        organization_id=payload.organization_id,
        organization_name=org_name,
        branch_name=payload.branch_name,
        branch_code=payload.branch_code or "",
        city=payload.city or "",
        state=payload.state or "",
        country=payload.country or "",
        created_at=str(dates[0]),
        updated_at=str(dates[1]),
    )


@router.get("/branches")
def list_branches(
    search: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List all branches with search, filter by organization, and pagination."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    where_clause = " WHERE b.created_by_admin_id = %s"
    params = [x_admin_id]

    if organization_id and organization_id.strip():
        where_clause += " AND b.organization_id = %s"
        params.append(organization_id.strip())

    if search and search.strip():
        where_clause += " AND (b.branch_name ILIKE %s OR b.branch_code ILIKE %s OR b.city ILIKE %s OR b.state ILIKE %s OR b.country ILIKE %s OR o.organization_name ILIKE %s)"
        s = f"%{search.strip()}%"
        params.extend([s, s, s, s, s, s])

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            count_sql = """
                SELECT COUNT(*)
                FROM branches b
                LEFT JOIN organization o ON b.organization_id = o.id
            """ + where_clause
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            data_sql = """
                SELECT b.id, b.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       b.branch_name, COALESCE(b.branch_code, ''), COALESCE(b.city, ''),
                       COALESCE(b.state, ''), COALESCE(b.country, ''), b.created_at, b.updated_at
                FROM branches b
                LEFT JOIN organization o ON b.organization_id = o.id
            """ + where_clause + " ORDER BY b.created_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            branches = [
                {
                    "branch_id": str(r[0]),
                    "organization_id": str(r[1]),
                    "organization_name": r[2],
                    "branch_name": r[3],
                    "branch_code": r[4],
                    "city": r[5],
                    "state": r[6],
                    "country": r[7],
                    "created_at": str(r[8]),
                    "updated_at": str(r[9]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "branches": branches,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/branches/{branch_id}", response_model=BranchResponse)
def get_branch(
    branch_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Get details of a single branch."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT b.id, b.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       b.branch_name, COALESCE(b.branch_code, ''), COALESCE(b.city, ''),
                       COALESCE(b.state, ''), COALESCE(b.country, ''), b.created_at, b.updated_at
                FROM branches b
                LEFT JOIN organization o ON b.organization_id = o.id
                WHERE b.id = %s AND b.created_by_admin_id = %s
                LIMIT 1
                """,
                (branch_id, x_admin_id),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Branch not found or access denied")

            return BranchResponse(
                branch_id=str(r[0]),
                organization_id=str(r[1]),
                organization_name=r[2],
                branch_name=r[3],
                branch_code=r[4],
                city=r[5],
                state=r[6],
                country=r[7],
                created_at=str(r[8]),
                updated_at=str(r[9]),
            )


@router.put("/branches/{branch_id}", response_model=BranchResponse)
def update_branch(
    branch_id: str,
    payload: UpdateBranchRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update a branch."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, organization_id, branch_name, branch_code, city, state, country FROM branches WHERE id = %s AND created_by_admin_id = %s LIMIT 1",
                (branch_id, x_admin_id),
            )
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Branch not found or access denied")

            new_org_id = payload.organization_id or str(current[1])
            new_name = payload.branch_name.strip() if payload.branch_name is not None else current[2]
            new_code = payload.branch_code.strip() if payload.branch_code is not None else current[3]
            new_city = payload.city.strip() if payload.city is not None else current[4]
            new_state = payload.state.strip() if payload.state is not None else current[5]
            new_country = payload.country.strip() if payload.country is not None else current[6]

            # Check unique branch code per organization if changing
            if new_code and new_code != current[3]:
                cur.execute(
                    "SELECT id FROM branches WHERE organization_id = %s AND branch_code = %s AND id != %s LIMIT 1",
                    (new_org_id, new_code, branch_id),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Branch code already exists for this organization")

            cur.execute(
                """
                UPDATE branches
                SET organization_id = %s, branch_name = %s, branch_code = %s, city = %s, state = %s, country = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING created_at, updated_at
                """,
                (new_org_id, new_name, new_code, new_city, new_state, new_country, branch_id),
            )
            dates = cur.fetchone()
            conn.commit()

            cur.execute("SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s", (new_org_id,))
            org_name = cur.fetchone()[0]

            logger.info("Branch updated: %s (id=%s)", new_name, branch_id)
            return BranchResponse(
                branch_id=branch_id,
                organization_id=new_org_id,
                organization_name=org_name,
                branch_name=new_name,
                branch_code=new_code or "",
                city=new_city or "",
                state=new_state or "",
                country=new_country or "",
                created_at=str(dates[0]),
                updated_at=str(dates[1]),
            )


@router.delete("/branches/{branch_id}")
def delete_branch(
    branch_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete a branch."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM branches WHERE id = %s AND created_by_admin_id = %s", (branch_id, x_admin_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Branch not found or access denied")

            cur.execute("DELETE FROM branches WHERE id = %s", (branch_id,))
            conn.commit()

    logger.info("Branch deleted: %s", branch_id)
    return {"message": "Branch deleted successfully"}


# ── Organization Members (HR) Endpoints ─────────────────────────────────────

@router.post("/members", response_model=MemberResponse)
def create_member(
    payload: CreateMemberRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a new organization HR member."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    member_id = str(uuid.uuid4())
    status_val = payload.status or "active"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Check unique email/username
            cur.execute(
                "SELECT id FROM organization_members WHERE (email = %s OR username = %s) LIMIT 1",
                (payload.email.lower().strip(), payload.username.strip()),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="An HR member with this email or username already exists.")

            # 2. Verify organization
            cur.execute(
                "SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s AND admin_id = %s LIMIT 1",
                (payload.organization_id, x_admin_id),
            )
            org_row = cur.fetchone()
            if not org_row:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")
            org_name = org_row[0]

            # 3. Verify branch
            cur.execute(
                "SELECT branch_name FROM branches WHERE id = %s AND organization_id = %s LIMIT 1",
                (payload.branch_id, payload.organization_id),
            )
            branch_row = cur.fetchone()
            if not branch_row:
                raise HTTPException(status_code=404, detail="Branch not found under selected organization")
            branch_name = branch_row[0]

            # 4. Insert member
            cur.execute(
                """
                INSERT INTO organization_members 
                (id, organization_id, branch_id, created_by_admin_id, full_name, username, email, password, phone, image, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING created_at, updated_at
                """,
                (
                    member_id,
                    payload.organization_id,
                    payload.branch_id,
                    x_admin_id,
                    payload.full_name.strip(),
                    payload.username.strip(),
                    payload.email.lower().strip(),
                    payload.password,
                    payload.phone.strip() if payload.phone else "",
                    payload.image,
                    status_val,
                ),
            )
            row = cur.fetchone()
            created_at, updated_at = row[0], row[1]
            conn.commit()

    logger.info("HR Member created: %s (%s)", payload.full_name, member_id)
    return MemberResponse(
        member_id=member_id,
        organization_id=payload.organization_id,
        organization_name=org_name,
        branch_id=payload.branch_id,
        branch_name=branch_name,
        full_name=payload.full_name.strip(),
        username=payload.username.strip(),
        email=payload.email.lower().strip(),
        phone=payload.phone or "",
        image=payload.image,
        status=status_val,
        created_at=str(created_at),
        updated_at=str(updated_at),
    )


@router.get("/members")
def list_members(
    search: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List HR members with search, filters, and pagination."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    where_clause = " WHERE m.created_by_admin_id = %s"
    params = [x_admin_id]

    if search and search.strip():
        where_clause += " AND (m.full_name ILIKE %s OR m.username ILIKE %s OR m.email ILIKE %s OR o.organization_name ILIKE %s OR b.branch_name ILIKE %s)"
        s = f"%{search.strip()}%"
        params.extend([s, s, s, s, s])

    if organization_id and organization_id.strip():
        where_clause += " AND m.organization_id = %s"
        params.append(organization_id.strip())

    if branch_id and branch_id.strip():
        where_clause += " AND m.branch_id = %s"
        params.append(branch_id.strip())

    if status and status.strip():
        where_clause += " AND m.status = %s"
        params.append(status.strip().lower())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            count_sql = """
                SELECT COUNT(*)
                FROM organization_members m
                JOIN organization o ON m.organization_id = o.id
                JOIN branches b ON m.branch_id = b.id
            """ + where_clause
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            data_sql = """
                SELECT m.id, m.organization_id, COALESCE(o.organization_name, o.company_name, ''), m.branch_id, b.branch_name, 
                       m.full_name, m.username, m.email, m.phone, m.image, m.status, m.created_at, m.updated_at
                FROM organization_members m
                JOIN organization o ON m.organization_id = o.id
                JOIN branches b ON m.branch_id = b.id
            """ + where_clause + " ORDER BY m.created_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            members = [
                {
                    "member_id": str(r[0]),
                    "organization_id": str(r[1]),
                    "organization_name": r[2],
                    "branch_id": str(r[3]),
                    "branch_name": r[4],
                    "full_name": r[5],
                    "username": r[6],
                    "email": r[7],
                    "phone": r[8] or "",
                    "image": r[9],
                    "status": r[10],
                    "created_at": str(r[11]),
                    "updated_at": str(r[12]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "members": members,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/members/{member_id}", response_model=MemberResponse)
def get_member(
    member_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Get details of a single HR member."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.id, m.organization_id, COALESCE(o.organization_name, o.company_name, ''), m.branch_id, b.branch_name,
                       m.full_name, m.username, m.email, m.phone, m.image, m.status, m.created_at, m.updated_at
                FROM organization_members m
                JOIN organization o ON m.organization_id = o.id
                JOIN branches b ON m.branch_id = b.id
                WHERE m.id = %s AND m.created_by_admin_id = %s
                LIMIT 1
                """,
                (member_id, x_admin_id),
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Member not found")

            return MemberResponse(
                member_id=str(r[0]),
                organization_id=str(r[1]),
                organization_name=r[2],
                branch_id=str(r[3]),
                branch_name=r[4],
                full_name=r[5],
                username=r[6],
                email=r[7],
                phone=r[8] or "",
                image=r[9],
                status=r[10],
                created_at=str(r[11]),
                updated_at=str(r[12]),
            )


@router.put("/members/{member_id}", response_model=MemberResponse)
def update_member(
    member_id: str,
    payload: UpdateMemberRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update an HR member's profile or assignment."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, organization_id, branch_id, full_name, username, email, password, phone, image, status 
                FROM organization_members 
                WHERE id = %s AND created_by_admin_id = %s 
                LIMIT 1
                """,
                (member_id, x_admin_id),
            )
            curr = cur.fetchone()
            if not curr:
                raise HTTPException(status_code=404, detail="Member not found or access denied")

            new_org_id = payload.organization_id if payload.organization_id is not None else str(curr[1])
            new_branch_id = payload.branch_id if payload.branch_id is not None else str(curr[2])
            new_full_name = payload.full_name.strip() if payload.full_name is not None else curr[3]
            new_username = payload.username.strip() if payload.username is not None else curr[4]
            new_email = payload.email.lower().strip() if payload.email is not None else curr[5]
            new_password = payload.password if payload.password else curr[6]
            new_phone = payload.phone.strip() if payload.phone is not None else (curr[7] or "")
            new_image = payload.image if payload.image is not None else curr[8]
            new_status = payload.status if payload.status is not None else curr[9]

            # Uniqueness check for email/username if changed
            if new_email != curr[5] or new_username != curr[4]:
                cur.execute(
                    "SELECT id FROM organization_members WHERE (email = %s OR username = %s) AND id != %s LIMIT 1",
                    (new_email, new_username, member_id),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Another HR member already uses this email or username.")

            # Get names
            cur.execute("SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s LIMIT 1", (new_org_id,))
            o_row = cur.fetchone()
            if not o_row:
                raise HTTPException(status_code=404, detail="Organization not found")
            org_name = o_row[0]

            cur.execute("SELECT branch_name FROM branches WHERE id = %s AND organization_id = %s LIMIT 1", (new_branch_id, new_org_id))
            b_row = cur.fetchone()
            if not b_row:
                raise HTTPException(status_code=404, detail="Branch not found under selected organization")
            branch_name = b_row[0]

            cur.execute(
                """
                UPDATE organization_members
                SET organization_id = %s, branch_id = %s, full_name = %s, username = %s, email = %s, password = %s, phone = %s, image = %s, status = %s, updated_at = NOW()
                WHERE id = %s AND created_by_admin_id = %s
                RETURNING created_at, updated_at
                """,
                (new_org_id, new_branch_id, new_full_name, new_username, new_email, new_password, new_phone, new_image, new_status, member_id, x_admin_id),
            )
            ret = cur.fetchone()
            conn.commit()

            return MemberResponse(
                member_id=member_id,
                organization_id=new_org_id,
                organization_name=org_name,
                branch_id=new_branch_id,
                branch_name=branch_name,
                full_name=new_full_name,
                username=new_username,
                email=new_email,
                phone=new_phone,
                image=new_image,
                status=new_status,
                created_at=str(ret[0]),
                updated_at=str(ret[1]),
            )


@router.delete("/members/{member_id}")
def delete_member(
    member_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete an HR member."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM organization_members WHERE id = %s AND created_by_admin_id = %s RETURNING id",
                (member_id, x_admin_id),
            )
            deleted = cur.fetchone()
            if not deleted:
                raise HTTPException(status_code=404, detail="Member not found or access denied")
            conn.commit()

    return {"message": "HR Member deleted successfully", "member_id": member_id}

