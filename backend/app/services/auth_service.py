"""
Authentication service — validates user credentials against the database.
"""

from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)


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
                "SELECT id, username, password, email, full_name FROM super_admin WHERE username = %s OR email = %s LIMIT 1",
                (username, username.lower()),
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
                "SELECT id, username, password, email, phone, profile_image FROM admin WHERE username = %s OR email = %s LIMIT 1",
                (username, username.lower()),
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

            # Check Organization Members (HR) table
            cur.execute(
                "SELECT id, username, password, email, organization_id, branch_id, status, full_name, image, phone FROM organization_members WHERE username = %s OR email = %s LIMIT 1",
                (username, username.lower()),
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
