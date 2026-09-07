"""
Centralized application configuration.

All settings are loaded from environment variables (via .env file).
See backend/.env.example for the full list of supported variables.
"""

import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Ensure .env is loaded from backend/.env regardless of current working directory
_BACKEND_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
_ENV_FILE = os.path.join(_BACKEND_DIR, ".env")
if os.path.exists(_ENV_FILE):
    load_dotenv(_ENV_FILE, override=True)
else:
    load_dotenv(override=True)

# ── Database ─────────────────────────────────────────────────────────────────
DB_NAME = os.getenv("DB_NAME", "hrms")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

# SQLAlchemy-compatible DATABASE_URL (password is URL-encoded)
_ENCODED_DB_PASSWORD = quote_plus(DB_PASSWORD)
DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{_ENCODED_DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# ── Application ──────────────────────────────────────────────────────────────
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# ── Default Admin (seeded on first startup) ──────────────────────────────────
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")

# ── Super Admin (seeded on first startup) ────────────────────────────────────
SUPER_ADMIN_USERNAME = os.getenv("SUPER_ADMIN_USERNAME", "superadmin")
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "superadmin@example.com")
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "superadmin123")
SUPER_ADMIN_FULL_NAME = os.getenv("SUPER_ADMIN_FULL_NAME", "Super Administrator")


# ── AI / LLM ────────────────────────────────────────────────────────────────
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:9b")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "groq/compound-mini")

# ── SMTP Email (Optional) ───────────────────────────────────────────────────
SMTP_SERVER = os.getenv("SMTP_SERVER", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
