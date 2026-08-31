import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.models.schemas import CreateOrgRequest, OrganizationResponse, CreateHRRequest, AssignHRRequest, HRResponse
from app.database import get_db_connection

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/organizations", response_model=OrganizationResponse)
def create_organization(payload: CreateOrgRequest, x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    
    org_id = str(uuid.uuid4())
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO organization (id, company_name, admin_id)
                VALUES (%s, %s, %s)
                RETURNING created_at
                """,
                (org_id, payload.company_name, x_admin_id)
            )
            created_at = cur.fetchone()[0]
            conn.commit()
            
    return OrganizationResponse(
        org_id=org_id,
        company_name=payload.company_name,
        created_at=str(created_at),
    )


@router.get("/organizations")
def list_organizations(x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, company_name, created_at FROM organization WHERE admin_id = %s ORDER BY created_at DESC", (x_admin_id,))
            rows = cur.fetchall()
            orgs = [
                {
                    "org_id": str(r[0]),
                    "company_name": r[1],
                    "created_at": str(r[2])
                }
                for r in rows
            ]
    return {"organizations": orgs}


@router.post("/hrs", response_model=HRResponse)
def create_hr(payload: CreateHRRequest, x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    hr_id = str(uuid.uuid4())
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # unique username check
            cur.execute("SELECT id FROM hr WHERE username = %s LIMIT 1", (payload.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="HR username already exists")
                
            # unique email check
            cur.execute("SELECT id FROM hr WHERE email = %s LIMIT 1", (payload.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="HR email already exists")

            cur.execute(
                """
                INSERT INTO hr (id, username, email, password, full_name, admin_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING created_at
                """,
                (hr_id, payload.username, payload.email, payload.password, payload.full_name, x_admin_id)
            )
            created_at = cur.fetchone()[0]
            conn.commit()

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
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, email, full_name, org_id, created_at FROM hr WHERE admin_id = %s ORDER BY created_at DESC", (x_admin_id,))
            rows = cur.fetchall()
            hrs = [
                {
                    "hr_id": str(r[0]),
                    "username": r[1],
                    "email": r[2],
                    "full_name": r[3],
                    "org_id": str(r[4]) if r[4] else "",
                    "created_at": str(r[5])
                }
                for r in rows
            ]
    return {"hrs": hrs}


@router.post("/assign-hr")
def assign_hr(payload: AssignHRRequest, x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # verify HR exists and belongs to this admin
            cur.execute("SELECT username FROM hr WHERE id = %s AND admin_id = %s", (payload.hr_id, x_admin_id))
            hr_record = cur.fetchone()
            if not hr_record:
                raise HTTPException(status_code=404, detail="HR user not found or access denied")
                
            # verify Org exists and belongs to this admin
            cur.execute("SELECT company_name FROM organization WHERE id = %s AND admin_id = %s", (payload.org_id, x_admin_id))
            org_record = cur.fetchone()
            if not org_record:
                raise HTTPException(status_code=404, detail="Organization not found or access denied")
                
            # assign
            cur.execute("UPDATE hr SET org_id = %s WHERE id = %s", (payload.org_id, payload.hr_id))
            conn.commit()
            
            return {"message": f"HR '{hr_record[0]}' assigned to '{org_record[0]}' successfully"}


@router.delete("/organizations/{org_id}")
def delete_organization(org_id: str, x_admin_id: Optional[str] = Header(None, alias="X-Admin-ID")):
    if not x_admin_id:
        raise HTTPException(status_code=401, detail="Header X-Admin-ID is missing. Please re-login.")
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check ownership
            cur.execute("SELECT id FROM organization WHERE id = %s AND admin_id = %s", (org_id, x_admin_id))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Organization not found or access denied")

            cur.execute("DELETE FROM organization WHERE id = %s", (org_id,))
            conn.commit()
    return {"message": "Organization deleted successfully and linked HRs unassigned"}
