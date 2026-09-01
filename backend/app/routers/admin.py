"""Router: Admin — organization and HR user management."""

import uuid
import math
from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.models.schemas import (
    CreateOrgRequest, UpdateOrgRequest, OrganizationResponse,
    CreateBranchRequest, UpdateBranchRequest, BranchResponse,
    CreateHRRequest, AssignHRRequest, HRResponse,
    AdminProfileResponse, UpdateAdminProfileRequest,
)
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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

