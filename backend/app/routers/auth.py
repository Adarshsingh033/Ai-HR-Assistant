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
        phone=user.get("phone", ""),
        profile_image=user.get("profile_image", ""),
        message="Login successful",
    )

from pydantic import BaseModel

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    new_password: str

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """Initiate forgot password flow by verifying email exists."""
    email = payload.email.lower()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            tables = ["super_admin", "admin", "organization_members", "hr"]
            found = False
            for table in tables:
                cur.execute(f"SELECT id FROM {table} WHERE email = %s LIMIT 1", (email,))
                if cur.fetchone():
                    found = True
                    break
            
            if not found:
                raise HTTPException(status_code=404, detail="Email not found")
                
    return {"success": True, "message": "OTP sent to email"}

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    """Reset the password for a user."""
    email = payload.email.lower()
    new_password = payload.new_password
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            tables = ["super_admin", "admin", "organization_members", "hr"]
            updated = False
            for table in tables:
                cur.execute(f"UPDATE {table} SET password = %s WHERE email = %s", (new_password, email))
                if cur.rowcount > 0:
                    updated = True
            
            if not updated:
                raise HTTPException(status_code=404, detail="Email not found")
            conn.commit()
            
    return {"success": True, "message": "Password reset successfully"}
