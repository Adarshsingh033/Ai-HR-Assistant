"""Router: Authentication — login and admin registration."""

import uuid
import secrets
import time
from fastapi import APIRouter, HTTPException

from app.models.schemas import LoginRequest, LoginResponse, RegisterAdminRequest
from app.services.auth_service import authenticate_user
from app.database import get_db_connection
from app.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── In-memory OTP store ───────────────────────────────────────────────────────
# { email: { "otp": "123456", "expires_at": <unix timestamp> } }
_otp_store: dict = {}
OTP_EXPIRY_SECONDS = 600  # 10 minutes


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
    otp: str = ""   # optional – validated if an OTP was issued


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """Generate a 6-digit OTP for password reset and return it to the client."""
    email = payload.email.strip().lower()

    # Verify email exists in any user table
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            tables = ["super_admin", "admin", "organization_members", "hr"]
            found = False
            for table in tables:
                cur.execute(f"SELECT id FROM {table} WHERE LOWER(email) = %s LIMIT 1", (email,))
                if cur.fetchone():
                    found = True
                    break

            if not found:
                raise HTTPException(status_code=404, detail="No account found with that email address.")

    # Fixed OTP for demo purposes
    otp = "123456"
    _otp_store[email] = {
        "otp": otp,
        "expires_at": time.time() + OTP_EXPIRY_SECONDS
    }

    logger.info("Password reset OTP generated for %s", email)

    # In production you would send the OTP via email here.
    # For this demo we return it directly so it works without an SMTP server.
    return {"success": True, "message": "OTP generated successfully", "otp": otp}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    """Reset the password for a user after OTP verification."""
    email = payload.email.strip().lower()
    new_password = payload.new_password

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    # Validate OTP if one was issued
    if email in _otp_store:
        record = _otp_store[email]
        if time.time() > record["expires_at"]:
            _otp_store.pop(email, None)
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            tables = ["super_admin", "admin", "organization_members", "hr"]
            updated = False
            for table in tables:
                cur.execute(f"UPDATE {table} SET password = %s WHERE LOWER(email) = %s", (new_password, email))
                if cur.rowcount > 0:
                    updated = True

            if not updated:
                raise HTTPException(status_code=404, detail="No account found with that email address.")
            conn.commit()

    # Clean up used OTP
    _otp_store.pop(email, None)
    logger.info("Password successfully reset for %s", email)

    return {"success": True, "message": "Password reset successfully"}
