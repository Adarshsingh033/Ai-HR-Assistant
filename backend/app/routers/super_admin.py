"""Router: Super Admin — Platform monitoring, plans, and admin management."""

import uuid
import math
from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.models.schemas import (
    LoginRequest, LoginResponse,
    CreatePlanRequest, UpdatePlanRequest, PlanResponse,
    CreateAdminRequest, UpdateAdminPlanRequest, UpdateAdminStatusRequest, UpdateAdminRequest, AdminManagementResponse,
    AuditLogResponse
)
from app.database import get_db_connection
from app.services.audit_service import log_audit
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/super-admin", tags=["super-admin"])


@router.post("/login", response_model=LoginResponse)
def login_super_admin(payload: LoginRequest):
    """Authenticate Super Admin."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username FROM super_admin WHERE username = %s AND password = %s LIMIT 1",
                (payload.username, payload.password)
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="Invalid username or password")
            
            return LoginResponse(
                success=True,
                role="super_admin",
                user_id=str(user[0]),
                username=user[1],
                message="Super Admin login successful"
            )


@router.get("/dashboard/stats")
def get_dashboard_stats(x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    """Get high-level overview for Super Admin."""
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Missing X-Super-Admin-ID header.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Stats for Admins
            cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active') FROM admin")
            admin_stats = cur.fetchone()
            
            # Stats for Plans
            cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active') FROM plans")
            plan_stats = cur.fetchone()

            # Stats for Organizations
            cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active') FROM organization")
            org_stats = cur.fetchone()

            # Stats for Branches
            cur.execute("SELECT COUNT(*) FROM branches")
            branch_count = cur.fetchone()[0]

            # Stats for HR Users
            cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active') FROM organization_members")
            hr_stats = cur.fetchone()

            # Month-wise Admin creation (Last 6 months)
            cur.execute("""
                SELECT to_char(created_at, 'Mon YYYY') as month, COUNT(*) as count 
                FROM admin 
                WHERE created_at >= NOW() - INTERVAL '6 months'
                GROUP BY to_char(created_at, 'Mon YYYY'), date_trunc('month', created_at)
                ORDER BY date_trunc('month', created_at) ASC
            """)
            admin_creation_trend = [{"month": r[0], "count": r[1]} for r in cur.fetchall()]

            # Plan Distribution
            cur.execute("""
                SELECT p.name, COUNT(a.id) 
                FROM plans p 
                LEFT JOIN admin a ON p.id = a.plan_id 
                GROUP BY p.name
            """)
            plan_distribution = [{"plan": r[0], "count": r[1]} for r in cur.fetchall()]

    return {
        "admins": {
            "total": admin_stats[0],
            "active": admin_stats[1]
        },
        "plans": {
            "total": plan_stats[0],
            "active": plan_stats[1]
        },
        "resources": {
            "organizations": {"total": org_stats[0], "active": org_stats[1]},
            "total_branches": branch_count,
            "hr_users": {"total": hr_stats[0], "active": hr_stats[1]}
        },
        "charts": {
            "admin_creation_trend": admin_creation_trend,
            "plan_distribution": plan_distribution
        }
    }


# ── Plans Management ─────────────────────────────────────────────────────────

@router.post("/plans", response_model=PlanResponse)
def create_plan(payload: CreatePlanRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    plan_id = str(uuid.uuid4())
    status_val = payload.status.value if payload.status else "active"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO plans (id, name, description, max_organizations, max_branches, max_hr_users, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING created_at
                """,
                (plan_id, payload.name, payload.description, payload.max_organizations, payload.max_branches, payload.max_hr_users, status_val)
            )
            created_at = cur.fetchone()[0]
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "CREATED", "PLAN", plan_id, {"name": payload.name})

    return PlanResponse(
        plan_id=plan_id, name=payload.name, description=payload.description,
        max_organizations=payload.max_organizations, max_branches=payload.max_branches,
        max_hr_users=payload.max_hr_users, status=status_val, created_at=str(created_at)
    )


@router.get("/plans")
def list_plans(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")
):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM plans")
            total = cur.fetchone()[0]
            
            offset = (page - 1) * limit
            cur.execute("SELECT id, name, description, max_organizations, max_branches, max_hr_users, status, created_at FROM plans ORDER BY created_at DESC LIMIT %s OFFSET %s", (limit, offset))
            rows = cur.fetchall()
            plans = [
                PlanResponse(
                    plan_id=str(r[0]), name=r[1], description=r[2],
                    max_organizations=r[3], max_branches=r[4], max_hr_users=r[5],
                    status=r[6], created_at=str(r[7])
                ).model_dump()
                for r in rows
            ]
            
            total_pages = math.ceil(total / limit) if total > 0 else 1
            
    return {
        "plans": plans,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.get("/plans/{plan_id}", response_model=PlanResponse)
def get_plan(plan_id: str, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, description, max_organizations, max_branches, max_hr_users, status, created_at FROM plans WHERE id = %s", (plan_id,))
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Plan not found")
                
            return PlanResponse(
                plan_id=str(r[0]), name=r[1], description=r[2],
                max_organizations=r[3], max_branches=r[4], max_hr_users=r[5],
                status=r[6], created_at=str(r[7])
            )


@router.put("/plans/{plan_id}", response_model=PlanResponse)
def update_plan(plan_id: str, payload: UpdatePlanRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, description, max_organizations, max_branches, max_hr_users, status, created_at FROM plans WHERE id = %s", (plan_id,))
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Plan not found")

            name = payload.name if payload.name is not None else current[1]
            desc = payload.description if payload.description is not None else current[2]
            max_o = payload.max_organizations if payload.max_organizations is not None else current[3]
            max_b = payload.max_branches if payload.max_branches is not None else current[4]
            max_hr = payload.max_hr_users if payload.max_hr_users is not None else current[5]
            status = payload.status.value if payload.status is not None else current[6]

            cur.execute(
                """
                UPDATE plans
                SET name = %s, description = %s, max_organizations = %s, max_branches = %s, max_hr_users = %s, status = %s
                WHERE id = %s
                """,
                (name, desc, max_o, max_b, max_hr, status, plan_id)
            )
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "UPDATED", "PLAN", plan_id, {"name": name})

            return PlanResponse(
                plan_id=plan_id, name=name, description=desc,
                max_organizations=max_o, max_branches=max_b,
                max_hr_users=max_hr, status=status, created_at=str(current[7])
            )


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM plans WHERE id = %s", (plan_id,))
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=404, detail="Plan not found")

            # Check if plan is being used by any admin
            cur.execute("SELECT COUNT(*) FROM admin WHERE plan_id = %s", (plan_id,))
            if cur.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Cannot delete plan. It is currently assigned to one or more admins.")

            cur.execute("DELETE FROM plans WHERE id = %s", (plan_id,))
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "DELETED", "PLAN", plan_id, {"name": plan[0]})

    return {"message": "Plan deleted successfully"}


# ── Admins Management ────────────────────────────────────────────────────────

@router.post("/admins", response_model=AdminManagementResponse)
def create_admin(payload: CreateAdminRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    admin_id = str(uuid.uuid4())
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check unique constraints
            cur.execute("SELECT id FROM admin WHERE username = %s LIMIT 1", (payload.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username already exists")
                
            cur.execute("SELECT id FROM admin WHERE email = %s LIMIT 1", (payload.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already exists")
                
            # Verify plan
            cur.execute("SELECT name FROM plans WHERE id = %s", (payload.plan_id,))
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=400, detail="Invalid plan ID")

            cur.execute(
                """
                INSERT INTO admin (id, username, email, password, full_name, plan_id, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'active')
                RETURNING created_at
                """,
                (admin_id, payload.username, payload.email, payload.password, payload.full_name, payload.plan_id)
            )
            created_at = cur.fetchone()[0]
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "CREATED", "ADMIN", admin_id, {"username": payload.username, "plan": plan[0]})

    return AdminManagementResponse(
        admin_id=admin_id, username=payload.username, email=payload.email, full_name=payload.full_name,
        status="active", plan_id=payload.plan_id, plan_name=plan[0], created_at=str(created_at)
    )


@router.get("/admins")
def list_admins(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")
):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM admin")
            total = cur.fetchone()[0]
            
            offset = (page - 1) * limit
            cur.execute(
                """
                SELECT a.id, a.username, a.email, a.full_name, a.status, a.plan_id, p.name, a.created_at,
                       (SELECT COUNT(*) FROM organization o WHERE o.admin_id = a.id) as org_count,
                       (SELECT COUNT(*) FROM branches b WHERE b.created_by_admin_id = a.id) as branch_count,
                       (SELECT COUNT(*) FROM organization_members h WHERE h.created_by_admin_id = a.id) as hr_count,
                       p.max_organizations, p.max_branches, p.max_hr_users
                FROM admin a
                LEFT JOIN plans p ON a.plan_id = p.id
                ORDER BY a.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset)
            )
            rows = cur.fetchall()
            admins = []
            for r in rows:
                admins.append({
                    "admin_id": str(r[0]),
                    "username": r[1],
                    "email": r[2],
                    "full_name": r[3],
                    "status": r[4],
                    "plan_id": str(r[5]) if r[5] else None,
                    "plan_name": r[6],
                    "created_at": str(r[7]),
                    "usage": {
                        "organizations": f"{r[8]}/{r[11] if r[11] is not None else '∞'}",
                        "branches": f"{r[9]}/{r[12] if r[12] is not None else '∞'}",
                        "hr_users": f"{r[10]}/{r[13] if r[13] is not None else '∞'}"
                    }
                })
                
            total_pages = math.ceil(total / limit) if total > 0 else 1
            
    return {
        "admins": admins,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.get("/admins/{admin_id}")
def get_admin(admin_id: str, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.id, a.username, a.email, a.full_name, a.status, a.plan_id, p.name, a.created_at,
                       (SELECT COUNT(*) FROM organization o WHERE o.admin_id = a.id) as org_count,
                       (SELECT COUNT(*) FROM branches b WHERE b.created_by_admin_id = a.id) as branch_count,
                       (SELECT COUNT(*) FROM organization_members h WHERE h.created_by_admin_id = a.id) as hr_count,
                       p.max_organizations, p.max_branches, p.max_hr_users
                FROM admin a
                LEFT JOIN plans p ON a.plan_id = p.id
                WHERE a.id = %s
                """,
                (admin_id,)
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Admin not found")
                
            return {
                "admin_id": str(r[0]),
                "username": r[1],
                "email": r[2],
                "full_name": r[3],
                "status": r[4],
                "plan_id": str(r[5]) if r[5] else None,
                "plan_name": r[6],
                "created_at": str(r[7]),
                "usage": {
                    "organizations": f"{r[8]}/{r[11] if r[11] is not None else '∞'}",
                    "branches": f"{r[9]}/{r[12] if r[12] is not None else '∞'}",
                    "hr_users": f"{r[10]}/{r[13] if r[13] is not None else '∞'}"
                }
            }


@router.put("/admins/{admin_id}")
def update_admin_details(admin_id: str, payload: UpdateAdminRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT full_name, username, email FROM admin WHERE id = %s", (admin_id,))
            current = cur.fetchone()
            if not current:
                raise HTTPException(status_code=404, detail="Admin not found")

            new_full_name = payload.full_name if payload.full_name else current[0]
            new_username = payload.username if payload.username else current[1]
            new_email = payload.email if payload.email else current[2]

            # Check uniqueness if username or email changed
            if new_username != current[1]:
                cur.execute("SELECT id FROM admin WHERE username = %s", (new_username,))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Username already in use")
            
            if new_email != current[2]:
                cur.execute("SELECT id FROM admin WHERE email = %s", (new_email,))
                if cur.fetchone():
                    raise HTTPException(status_code=400, detail="Email already in use")

            cur.execute(
                "UPDATE admin SET full_name = %s, username = %s, email = %s WHERE id = %s",
                (new_full_name, new_username, new_email, admin_id)
            )
            conn.commit()
            
            log_audit(x_super_admin_id, "super_admin", "UPDATED_DETAILS", "ADMIN", admin_id, {"new_username": new_username})

    return {"message": "Admin details updated successfully"}


@router.put("/admins/{admin_id}/plan")
def update_admin_plan(admin_id: str, payload: UpdateAdminPlanRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM plans WHERE id = %s", (payload.plan_id,))
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=400, detail="Invalid plan ID")

            cur.execute("UPDATE admin SET plan_id = %s WHERE id = %s", (payload.plan_id, admin_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Admin not found")
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "UPDATED_PLAN", "ADMIN", admin_id, {"new_plan_id": payload.plan_id, "plan_name": plan[0]})

    return {"message": "Admin plan updated successfully", "plan_name": plan[0]}


@router.put("/admins/{admin_id}/status")
def update_admin_status(admin_id: str, payload: UpdateAdminStatusRequest, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE admin SET status = %s WHERE id = %s", (payload.status, admin_id))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Admin not found")
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "UPDATED_STATUS", "ADMIN", admin_id, {"new_status": payload.status})

    return {"message": f"Admin status updated to {payload.status}"}


@router.delete("/admins/{admin_id}")
def delete_admin(admin_id: str, x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT username FROM admin WHERE id = %s", (admin_id,))
            admin = cur.fetchone()
            if not admin:
                raise HTTPException(status_code=404, detail="Admin not found")

            cur.execute("DELETE FROM admin WHERE id = %s", (admin_id,))
            conn.commit()

            log_audit(x_super_admin_id, "super_admin", "DELETED", "ADMIN", admin_id, {"username": admin[0]})

    return {"message": "Admin deleted successfully"}


# ── Audit Logs ───────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    x_super_admin_id: Optional[str] = Header(None, alias="X-Super-Admin-ID")
):
    if not x_super_admin_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            filters = []
            params_count = []
            params_data = []

            if action:
                filters.append("action ILIKE %s")
                params_count.append(f"%{action}%")
                params_data.append(f"%{action}%")
            if resource_type:
                filters.append("resource_type = %s")
                params_count.append(resource_type)
                params_data.append(resource_type)

            where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""

            cur.execute(f"SELECT COUNT(*) FROM audit_logs {where_clause}", params_count)
            total = cur.fetchone()[0]

            offset = (page - 1) * limit
            params_data.extend([limit, offset])
            cur.execute(
                f"""
                SELECT id, user_id, user_type, action, resource_type, resource_id, details, created_at
                FROM audit_logs
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                params_data
            )
            rows = cur.fetchall()
            logs = []
            for r in rows:
                import json as _json
                det = r[6]
                if det and not isinstance(det, str):
                    det = _json.dumps(det)
                logs.append({
                    "log_id": str(r[0]),
                    "user_id": str(r[1]),
                    "user_type": r[2],
                    "action": r[3],
                    "resource_type": r[4],
                    "resource_id": r[5],
                    "details": det,
                    "created_at": str(r[7])
                })

            total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "audit_logs": logs,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }
