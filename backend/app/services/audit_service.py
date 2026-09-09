import uuid
import json
from typing import Optional, Dict, Any
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

SYSTEM_UUID = "00000000-0000-0000-0000-000000000000"

def log_audit(
    user_id: Optional[str],
    user_type: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Log an action to the audit_logs table safely.
    
    :param user_id: ID of the user performing the action (super_admin, admin, hr, or system)
    :param user_type: Type of user ('super_admin', 'admin', 'hr', 'auth', etc.)
    :param action: Action performed (HTTP method e.g. 'GET', 'POST', 'PUT', 'DELETE', 'PATCH' or action keyword)
    :param resource_type: Resource affected (e.g., 'PLAN', 'ADMIN', 'ORGANIZATION', 'BRANCH', 'HR_MEMBER', 'JOB', 'CANDIDATE')
    :param resource_id: ID or path of the resource affected (optional)
    :param details: Additional details dictionary (optional)
    """
    try:
        log_id = str(uuid.uuid4())
        
        # Ensure valid UUID string for PostgreSQL UUID column
        valid_user_uuid = SYSTEM_UUID
        if user_id:
            try:
                valid_user_uuid = str(uuid.UUID(str(user_id)))
            except (ValueError, AttributeError, TypeError):
                valid_user_uuid = SYSTEM_UUID

        details_str = json.dumps(details) if details else None
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (id, user_id, user_type, action, resource_type, resource_id, details)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (log_id, valid_user_uuid, user_type, action, resource_type, resource_id, details_str)
                )
                conn.commit()
    except Exception as e:
        logger.error("Failed to insert audit log: %s", e)
