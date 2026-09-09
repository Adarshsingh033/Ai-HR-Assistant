"""
Authentication service — validates user credentials against the database.
"""

import re
from fastapi import HTTPException
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

def validate_hr_admin_phone(phone: str = None):
    """
    Validates that Admin and HR phone numbers contain EXACTLY 10 digits (0-9).
    No alphabets, spaces, plus (+), or special characters allowed.
    Candidates are explicitly exempt.
    """
    if phone and str(phone).strip():
        p = str(phone).strip()
        if not re.match(r'^\d{10}$', p):
            raise HTTPException(
                status_code=400,
                detail="Phone number must be exactly 10 digits."
            )

def check_hr_admin_uniqueness(cur, username: str = None, email: str = None, phone: str = None, exclude_id: str = None):
    """
    Ensures username, email, and phone number (if provided) are unique across Admin and HR accounts.
    Candidates and Super Admin accounts are explicitly exempt from these unique constraints.
    Also validates that Admin and HR phone numbers contain ONLY digits (0-9).
    """
    ex_id = str(exclude_id) if exclude_id else '00000000-0000-0000-0000-000000000000'

    # 1. Username Uniqueness Check
    if username and str(username).strip():
        u = str(username).strip().lower()
        cur.execute("SELECT id FROM admin WHERE LOWER(username) = %s AND id != %s LIMIT 1", (u, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username is already in use by an Admin or HR user.")

        cur.execute("SELECT id FROM organization_members WHERE LOWER(username) = %s AND id != %s LIMIT 1", (u, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username is already in use by an Admin or HR user.")

        cur.execute("SELECT id FROM hr WHERE LOWER(username) = %s AND id != %s LIMIT 1", (u, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username is already in use by an Admin or HR user.")

    # 2. Email Uniqueness Check
    if email and str(email).strip():
        e = str(email).strip().lower()
        cur.execute("SELECT id FROM admin WHERE LOWER(email) = %s AND id != %s LIMIT 1", (e, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email address is already in use by an Admin or HR user.")

        cur.execute("SELECT id FROM organization_members WHERE LOWER(email) = %s AND id != %s LIMIT 1", (e, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email address is already in use by an Admin or HR user.")

        cur.execute("SELECT id FROM hr WHERE LOWER(email) = %s AND id != %s LIMIT 1", (e, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email address is already in use by an Admin or HR user.")

    # 3. Phone Digits Only & Uniqueness Check
    if phone and str(phone).strip():
        p = str(phone).strip()
        validate_hr_admin_phone(p)
        cur.execute("SELECT id FROM admin WHERE phone = %s AND id != %s LIMIT 1", (p, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Phone number is already in use by an Admin or HR user.")

        cur.execute("SELECT id FROM organization_members WHERE phone = %s AND id != %s LIMIT 1", (p, ex_id))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Phone number is already in use by an Admin or HR user.")


def authenticate_user(username: str, password: str) -> dict | None:
    """
    Authenticate a user by username and password.

    Checks the admin table first, then the HR table.

    Returns:
        User metadata dict on success, or None on failure.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check Super Admin table first
            cur.execute(
                "SELECT id, username, password, email, full_name FROM super_admin WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s) LIMIT 1",
                (username, username),
            )
            super_admin = cur.fetchone()
            if super_admin:
                if super_admin[2] == password:
                    logger.info("Super Admin '%s' authenticated successfully.", username)
                    return {
                        "user_id": str(super_admin[0]),
                        "username": super_admin[1],
                        "role": "super_admin",
                        "org_id": "",
                        "email": super_admin[3],
                        "phone": "",
                        "profile_image": "",
                    }
                logger.warning("Failed login attempt for Super Admin '%s'.", username)
                return None

            # Check Admin table
            cur.execute(
                "SELECT id, username, password, email, phone, profile_image FROM admin WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s) LIMIT 1",
                (username, username),
            )
            admin = cur.fetchone()

            if admin:
                if admin[2] == password:
                    logger.info("Admin '%s' authenticated successfully.", username)
                    return {
                        "user_id": str(admin[0]),
                        "username": admin[1],
                        "role": "admin",
                        "org_id": "",
                        "email": admin[3],
                        "phone": admin[4] or "",
                        "profile_image": admin[5] or "",
                    }
                logger.warning("Failed login attempt for admin '%s'.", username)
                return None

            cur.execute(
                "SELECT id, username, password, email, organization_id, branch_id, status, full_name, image, phone FROM organization_members WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s) LIMIT 1",
                (username, username),
            )
            member = cur.fetchone()

            if member:
                if member[6] == 'inactive':
                    logger.warning("Inactive HR member '%s' attempted login.", username)
                    return None
                if member[2] == password:
                    logger.info("HR member '%s' authenticated successfully.", username)
                    return {
                        "user_id": str(member[0]),
                        "username": member[1],
                        "role": "hr",
                        "org_id": str(member[4]),
                        "branch_id": str(member[5]),
                        "email": member[3],
                        "full_name": member[7],
                        "profile_image": member[8] or "",
                        "phone": member[9] or "",
                    }
                logger.warning("Failed login attempt for HR member '%s'.", username)
                return None

            # Check legacy HR table fallback
            cur.execute(
                "SELECT id, username, password, email, org_id FROM hr WHERE username = %s OR email = %s LIMIT 1",
                (username, username.lower()),
            )
            hr = cur.fetchone()

            if hr:
                if hr[2] == password:
                    logger.info("HR user '%s' authenticated successfully.", username)
                    return {
                        "user_id": str(hr[0]),
                        "username": hr[1],
                        "role": "hr",
                        "org_id": str(hr[4]) if hr[4] else "",
                        "email": hr[3],
                    }
                logger.warning("Failed login attempt for HR user '%s'.", username)
                return None

    logger.warning("Login attempt for unknown user '%s'.", username)
    return None
