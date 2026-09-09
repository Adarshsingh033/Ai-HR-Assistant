import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.services.audit_service import log_audit
from app.logger import get_logger

logger = get_logger(__name__)

class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to automatically record API requests for Super Admin, Admin, and HR users into audit_logs.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        path = request.url.path
        
        # Only log API calls; skip static files, health check, and audit logs listing itself to prevent recursion
        if not path.startswith("/api/") or path == "/api/health" or path.startswith("/api/super-admin/audit-logs"):
            return response
            
        try:
            method = request.method
            headers = request.headers
            
            # Extract user_id and user_type
            user_id = None
            user_type = "system"

            if "X-Super-Admin-ID" in headers or "x-super-admin-id" in headers:
                user_id = headers.get("X-Super-Admin-ID") or headers.get("x-super-admin-id")
                user_type = "super_admin"
            elif "X-Admin-ID" in headers or "x-admin-id" in headers:
                user_id = headers.get("X-Admin-ID") or headers.get("x-admin-id")
                user_type = "admin"
            elif "X-HR-ID" in headers or "x-hr-id" in headers:
                user_id = headers.get("X-HR-ID") or headers.get("x-hr-id")
                user_type = "hr"
            else:
                # Infer user_type from endpoint route if header not explicitly set
                if path.startswith("/api/super-admin"):
                    user_type = "super_admin"
                elif path.startswith("/api/admin"):
                    user_type = "admin"
                elif any(path.startswith(prefix) for prefix in ["/api/hr", "/api/jobs", "/api/candidates", "/api/screening", "/api/comparison", "/api/emails"]):
                    user_type = "hr"
                elif path.startswith("/api/auth"):
                    user_type = "auth"

            # Determine resource_type from path
            parts = [p for p in path.split('/') if p and p != 'api']
            resource_type = "SYSTEM"
            if len(parts) >= 2 and parts[0] in ['super-admin', 'admin', 'hr']:
                resource_type = parts[1].upper().rstrip('S')
            elif len(parts) >= 1:
                resource_type = parts[0].upper().rstrip('S')

            # Map singular names for standard resources
            resource_map = {
                "PLAN": "PLAN",
                "ADMIN": "ADMIN",
                "ORGANIZATION": "ORGANIZATION",
                "BRANCH": "BRANCH",
                "MEMBER": "HR_MEMBER",
                "JOB": "JOB",
                "CANDIDATE": "CANDIDATE",
                "SCREENING": "SCREENING",
                "EMAIL": "EMAIL",
                "COMPARISON": "COMPARISON",
                "AUTH": "AUTH"
            }
            resource_type = resource_map.get(resource_type, resource_type)

            details = {
                "method": method,
                "path": path,
                "status": response.status_code
            }
            if request.query_params:
                details["query"] = str(request.query_params)

            # Log audit record
            log_audit(
                user_id=user_id,
                user_type=user_type,
                action=method,
                resource_type=resource_type,
                resource_id=path,
                details=details
            )
        except Exception as e:
            logger.error("Audit middleware logging error: %s", e)

        return response
