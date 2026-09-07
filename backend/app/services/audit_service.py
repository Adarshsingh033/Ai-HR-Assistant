import uuid
import json
from typing import Optional, Dict, Any
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

def log_audit(
    user_id: str,
    user_type: str,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Log an action to the audit_logs table.
    
    :param user_id: ID of the user performing the action (super_admin or admin ID)
    :param user_type: Type of user ('super_admin', 'admin', etc.)
    :param action: Action performed (e.g., 'CREATED', 'UPDATED', 'DELETED', 'LIMIT_REACHED')
    :param resource_type: Resource affected (e.g., 'ADMIN', 'PLAN', 'ORGANIZATION', 'BRANCH', 'HR_USER')
    :param resource_id: ID of the resource affected (optional)
    :param details: Additional details as a dictionary (optional)
    """
    try:
        log_id = str(uuid.uuid4())
        details_str = json.dumps(details) if details else None
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (id, user_id, user_type, action, resource_type, resource_id, details)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (log_id, user_id, user_type, action, resource_type, resource_id, details_str)
                )
                conn.commit()
    except Exception as e:
        logger.error("Failed to insert audit log: %s", e)
