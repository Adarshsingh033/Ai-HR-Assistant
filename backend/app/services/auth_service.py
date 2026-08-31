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
            # Check Admin table
            cur.execute(
                "SELECT id, username, password, email FROM admin WHERE username = %s LIMIT 1",
                (username,),
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
                    }
                logger.warning("Failed login attempt for admin '%s'.", username)
                return None

            # Check HR table
            cur.execute(
                "SELECT id, username, password, email, org_id FROM hr WHERE username = %s LIMIT 1",
                (username,),
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
