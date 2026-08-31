from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.routers import auth, admin, hr, jobs, candidates, chatbot, emails
from app.services.chroma_service import seed_admin
from app.database import init_db

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Recruitment System",
    description="Role-based recruitment platform powered by FastAPI",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(hr.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(chatbot.router)
app.include_router(emails.router)

# ── Static Frontend ───────────────────────────────────────────────────────────
FRONTEND_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.isdir(FRONTEND_DIR):
    # Mount frontend at root. IMPORTANT: Place after all API routes.
    # html=True serves index.html at directories.
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    init_db()
    seed_admin()
    print("PostgreSQL DB initialized. Admin user seeded. Server ready.")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AI Recruitment System"}
