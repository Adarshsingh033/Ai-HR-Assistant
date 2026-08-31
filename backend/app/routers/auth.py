"""Router: Authentication — login and admin registration."""

import uuid
from fastapi import APIRouter, HTTPException

from app.models.schemas import LoginRequest, LoginResponse, RegisterAdminRequest
from app.services.auth_service import authenticate_user
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """Authenticate a user and return session metadata."""
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(
        success=True,
        role=user["role"],
        user_id=user["user_id"],
        username=user["username"],
        org_id=user["org_id"],
        message="Login successful",
    )


@router.post("/register", status_code=201)
def register_admin(payload: RegisterAdminRequest):
    """Register a new admin user."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check unique username
            cur.execute("SELECT id FROM admin WHERE username = %s LIMIT 1", (payload.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username already taken")

            # Check unique email
            cur.execute("SELECT id FROM admin WHERE email = %s LIMIT 1", (payload.email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email address already registered")

            admin_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO admin (id, username, email, password, full_name)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING created_at
                """,
                (admin_id, payload.username, payload.email, payload.password, payload.full_name),
            )
            created_at = cur.fetchone()[0]
            conn.commit()

            logger.info("New admin registered: %s", payload.username)
            return {
                "success": True,
                "message": f"Admin '{payload.username}' registered successfully!",
                "admin": {
                    "id": admin_id,
                    "username": payload.username,
                    "email": payload.email,
                    "full_name": payload.full_name,
                    "created_at": str(created_at),
                },
            }
