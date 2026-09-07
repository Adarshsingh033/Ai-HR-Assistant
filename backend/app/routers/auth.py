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



