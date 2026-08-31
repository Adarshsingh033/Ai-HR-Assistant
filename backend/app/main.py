"""
AI HR Assistant — FastAPI application entry point.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import auth, admin, hr, jobs, candidates, chatbot, emails
from app.seeders import seed_admin
from app.database import init_db, close_pool
from app.logger import get_logger

logger = get_logger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle manager."""
    try:
        init_db()
        seed_admin()
        logger.info("Application startup complete — server ready.")
    except Exception as e:
        logger.error("Error during application startup: %s", e, exc_info=True)
    yield
    # Shutdown
    close_pool()
    logger.info("Application shutdown complete.")


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Recruitment System",
    description="Role-based recruitment platform powered by FastAPI",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(hr.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(chatbot.router)
app.include_router(emails.router)


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "AI Recruitment System"}


# ── Static Frontend ──────────────────────────────────────────────────────────
FRONTEND_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
