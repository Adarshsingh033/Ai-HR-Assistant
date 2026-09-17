"""Router: Departments — Admin CRUD + HR read-only access for branch departments."""

import uuid
import math
from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.models.schemas import (
    CreateDepartmentRequest, UpdateDepartmentRequest, DepartmentResponse,
)
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["departments"])


# ── Helper: verify department belongs to admin ────────────────────────────────

def _verify_dept_admin(cur, dept_id: str, admin_id: str):
    """Return department row or raise 404 if not owned by admin."""
    cur.execute(
        """
        SELECT d.id, d.organization_id, d.branch_id, d.department_name, d.description,
               COALESCE(o.organization_name, o.company_name, ''),
               b.branch_name, d.created_at, d.updated_at
        FROM departments d
        JOIN organization o ON d.organization_id = o.id
        JOIN branches b ON d.branch_id = b.id
        WHERE d.id = %s AND o.admin_id = %s
        LIMIT 1
        """,
        (dept_id, admin_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Department not found or access denied")
    return row


# ── Admin Endpoints ───────────────────────────────────────────────────────────

@router.post("/api/admin/departments", response_model=DepartmentResponse)
def create_department(
    payload: CreateDepartmentRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Create a department under a specific branch. Admin must own the organization."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    dept_id = str(uuid.uuid4())

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Verify org belongs to admin
            cur.execute(
                "SELECT COALESCE(organization_name, company_name, '') FROM organization WHERE id = %s AND admin_id = %s",
                (payload.organization_id, x_admin_id),
            )
            org_row = cur.fetchone()
            if not org_row:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")
            org_name = org_row[0]

            # Verify branch belongs to the organization and admin
            cur.execute(
                "SELECT branch_name FROM branches WHERE id = %s AND organization_id = %s AND created_by_admin_id = %s",
                (payload.branch_id, payload.organization_id, x_admin_id),
            )
            branch_row = cur.fetchone()
            if not branch_row:
                raise HTTPException(status_code=404, detail="Branch not found or does not belong to this organization")
            branch_name = branch_row[0]

            # Check unique department name per branch
            cur.execute(
                "SELECT id FROM departments WHERE branch_id = %s AND LOWER(department_name) = LOWER(%s) LIMIT 1",
                (payload.branch_id, payload.department_name.strip()),
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="A department with this name already exists in this branch")

            cur.execute(
                """
                INSERT INTO departments (id, organization_id, branch_id, created_by_admin_id, department_name, description)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING created_at, updated_at
                """,
                (dept_id, payload.organization_id, payload.branch_id, x_admin_id,
                 payload.department_name.strip(), payload.description),
            )
            dates = cur.fetchone()
            conn.commit()

    logger.info("Department created: '%s' (id=%s)", payload.department_name, dept_id)
    return DepartmentResponse(
        department_id=dept_id,
        organization_id=payload.organization_id,
        organization_name=org_name,
        branch_id=payload.branch_id,
        branch_name=branch_name,
        department_name=payload.department_name.strip(),
        description=payload.description,
        created_at=str(dates[0]),
        updated_at=str(dates[1]),
    )


@router.get("/api/admin/departments")
def list_departments(
    search: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List all departments belonging to the current admin with search, filter, and pagination."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    where_clause = " WHERE o.admin_id = %s"
    params = [x_admin_id]

    if organization_id and organization_id.strip():
        where_clause += " AND d.organization_id = %s"
        params.append(organization_id.strip())

    if branch_id and branch_id.strip():
        where_clause += " AND d.branch_id = %s"
        params.append(branch_id.strip())

    if search and search.strip():
        where_clause += " AND (d.department_name ILIKE %s OR d.description ILIKE %s)"
        s = f"%{search.strip()}%"
        params.extend([s, s])

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            count_sql = """
                SELECT COUNT(*)
                FROM departments d
                JOIN organization o ON d.organization_id = o.id
            """ + where_clause
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            data_sql = """
                SELECT d.id, d.organization_id, COALESCE(o.organization_name, o.company_name, ''),
                       d.branch_id, b.branch_name, d.department_name, d.description,
                       d.created_at, d.updated_at
                FROM departments d
                JOIN organization o ON d.organization_id = o.id
                JOIN branches b ON d.branch_id = b.id
            """ + where_clause + " ORDER BY d.created_at DESC LIMIT %s OFFSET %s"

            data_params = list(params) + [limit, offset]
            cur.execute(data_sql, tuple(data_params))
            rows = cur.fetchall()

            departments = [
                {
                    "department_id": str(r[0]),
                    "organization_id": str(r[1]),
                    "organization_name": r[2],
                    "branch_id": str(r[3]),
                    "branch_name": r[4],
                    "department_name": r[5],
                    "description": r[6] or "",
                    "created_at": str(r[7]),
                    "updated_at": str(r[8]),
                }
                for r in rows
            ]

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "departments": departments,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.get("/api/admin/departments/{dept_id}", response_model=DepartmentResponse)
def get_department(
    dept_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Get details of a single department."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            r = _verify_dept_admin(cur, dept_id, x_admin_id)
            return DepartmentResponse(
                department_id=str(r[0]),
                organization_id=str(r[1]),
                branch_id=str(r[2]),
                department_name=r[3],
                description=r[4],
                organization_name=r[5],
                branch_name=r[6],
                created_at=str(r[7]),
                updated_at=str(r[8]),
            )


@router.put("/api/admin/departments/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: str,
    payload: UpdateDepartmentRequest,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Update a department's name or description."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            r = _verify_dept_admin(cur, dept_id, x_admin_id)

            new_name = payload.department_name.strip() if payload.department_name is not None else r[3]
            new_desc = payload.description if payload.description is not None else r[4]

            # Check uniqueness if name changed
            if new_name.lower() != r[3].lower():
                cur.execute(
                    "SELECT id FROM departments WHERE branch_id = %s AND LOWER(department_name) = LOWER(%s) AND id != %s LIMIT 1",
                    (str(r[2]), new_name, dept_id),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="A department with this name already exists in this branch")

            cur.execute(
                "UPDATE departments SET department_name = %s, description = %s, updated_at = NOW() WHERE id = %s RETURNING updated_at",
                (new_name, new_desc, dept_id),
            )
            updated_at = cur.fetchone()[0]
            conn.commit()

    return DepartmentResponse(
        department_id=dept_id,
        organization_id=str(r[1]),
        organization_name=r[5],
        branch_id=str(r[2]),
        branch_name=r[6],
        department_name=new_name,
        description=new_desc,
        created_at=str(r[7]),
        updated_at=str(updated_at),
    )


@router.delete("/api/admin/departments/{dept_id}")
def delete_department(
    dept_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """Delete a department. Fails if interviewers or jobs still reference it."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            _verify_dept_admin(cur, dept_id, x_admin_id)

            # Check for linked interviewers
            cur.execute("SELECT COUNT(*) FROM interviewers WHERE department_id = %s", (dept_id,))
            if cur.fetchone()[0] > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete department: interviewers are still assigned to it. Remove them first."
                )

            cur.execute("DELETE FROM departments WHERE id = %s", (dept_id,))
            conn.commit()

    logger.info("Department deleted: %s", dept_id)
    return {"message": "Department deleted successfully"}


@router.get("/api/admin/branches/{branch_id}/departments")
def list_branch_departments(
    branch_id: str,
    x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """List departments for a specific branch (used to populate dropdowns)."""
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Verify branch belongs to admin
            cur.execute(
                "SELECT id FROM branches WHERE id = %s AND created_by_admin_id = %s",
                (branch_id, x_admin_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Branch not found or access denied")

            cur.execute(
                "SELECT id, department_name, description FROM departments WHERE branch_id = %s ORDER BY department_name ASC",
                (branch_id,),
            )
            rows = cur.fetchall()
            return {
                "departments": [
                    {"department_id": str(r[0]), "department_name": r[1], "description": r[2] or ""}
                    for r in rows
                ]
            }


# ── HR-accessible Endpoint ────────────────────────────────────────────────────

@router.get("/api/hr/departments")
def list_hr_departments(
    x_hr_id: Optional[str] = Header(None, alias="X-Admin-ID"),
):
    """
    Return departments accessible to the current HR user (filtered to their branch).
    Used by HR to populate the Department dropdown in Job Vacancy creation.
    """
    if not x_hr_id:
        raise HTTPException(status_code=401, detail="Authentication header missing.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Look up HR's branch from organization_members
            cur.execute(
                "SELECT branch_id, organization_id FROM organization_members WHERE id = %s LIMIT 1",
                (x_hr_id,),
            )
            hr_row = cur.fetchone()
            if not hr_row:
                raise HTTPException(status_code=404, detail="HR user not found")

            branch_id, org_id = hr_row

            cur.execute(
                """
                SELECT id, department_name, description, branch_id
                FROM departments
                WHERE branch_id = %s AND organization_id = %s
                ORDER BY department_name ASC
                """,
                (branch_id, org_id),
            )
            rows = cur.fetchall()
            return {
                "departments": [
                    {
                        "department_id": str(r[0]),
                        "department_name": r[1],
                        "description": r[2] or "",
                        "branch_id": str(r[3]),
                    }
                    for r in rows
                ]
            }
