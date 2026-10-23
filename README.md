# AI HR Assistant (AI Recruitment System)

> A modern, multi-tenant AI-powered HR & Recruitment Management System built with **FastAPI**, **PostgreSQL (`pgvector`)**, and **Vanilla JavaScript** frontend portals. It automates candidate resume parsing, AI-based candidate screening, side-by-side evaluations, interview scheduling, automated email workflows, and interviewer question bank management.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [System Architecture & Portals](#-system-architecture--portals)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Database Setup & Migrations](#-database-setup--migrations)
- [Seeding the Database](#-seeding-the-database)
- [Running the Project](#-running-the-project)
- [Default Seeded Credentials](#-default-seeded-credentials)
- [API Documentation & Health Check](#-api-documentation--health-check)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

- 🏢 **Multi-Tenant Architecture**: Supports Super Admin, Admins, Organizations, Branches, HR Users, and Interviewers.
- 📦 **Subscription Plan Limits**: Multi-tier plans (Basic, Standard, Premium) controlling quotas for max organizations, branches, and HR members.
- 📄 **Resume Ingestion & AI Screening**: Automatic extraction and parsing of candidate resumes (`.pdf`, `.docx`) paired with Google Gemini LLM scoring.
- 🔍 **Vector Search & Candidate Matching**: Fast search and candidate retrieval powered by PostgreSQL `pgvector`.
- 📊 **Candidate Comparison**: Side-by-side evaluation of candidates against job specifications.
- 📅 **Interview & Panel Management**: Assign candidates to interviewers, schedule panels, track interview status histories, and manage feedback.
- ❓ **Question Bank**: Manage difficulty-rated questions (Easy, Medium, Hard) categorized by department and role.
- 📧 **Automated Communication**: Generate AI-tailored candidate emails and dispatch notifications via SMTP.
- 🛡️ **Audit Logging & Background Queue**: Request audit middleware and non-blocking worker threads for AI operations.

---

## 🛠 Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **ASGI Server**: Uvicorn
- **Database Connection**: `psycopg2` pool with `pgvector` support
- **AI / LLM Integration**: Google Gemini API (`google-generativeai`), LangChain
- **Document Processing**: PyMuPDF (`fitz`), `python-docx`

### Frontend
- **Interface**: HTML5, Vanilla JavaScript (ES6+), CSS3 (Modern Responsive Dashboard Design)
- **Static Hosting**: Served directly via FastAPI StaticFiles middleware

### Database
- **Database Engine**: PostgreSQL 14+ with `vector` extension enabled

---

## 🏛 System Architecture & Portals

The application provides isolated web portals tailored for each operational role:

| Portal | Route | Description |
| :--- | :--- | :--- |
| **Super Admin Portal** | `/super_admin/index.html` | System-wide management, subscription plans, system admin accounts. |
| **Admin Portal** | `/admin/index.html` | Organization management, branch setup, subscription usage, HR user accounts. |
| **HR Portal** | `/hr/index.html` | Job postings, candidate resume uploads, AI candidate screening, emails, interview panel setup. |
| **Interviewer Portal** | `/interviewer/index.html` | Assigned candidates, interview feedback forms, question bank management. |
| **Landing Page** | `/index.html` | Main portal navigation and role-based login entry points. |

---

## 📂 Project Directory Structure

```
Ai-HR-Assistant/
├── backend/
│   ├── app/
│   │   ├── middleware/       # Audit logging and request middleware
│   │   ├── migrations/       # Versioned SQL migration scripts (001 to 024)
│   │   ├── models/           # Pydantic data schemas
│   │   ├── routers/          # FastAPI API endpoints (Auth, Admin, HR, Jobs, Screening, etc.)
│   │   ├── services/         # Business logic & AI background task services
│   │   ├── config.py         # Application & env configuration loader
│   │   ├── database.py       # PostgreSQL pool & pgvector initialization
│   │   ├── logger.py         # Centralized application logging
│   │   ├── main.py           # FastAPI entry point & StaticFiles router
│   │   └── migration_runner.py # Automated SQL migration execution engine
│   ├── scripts/
│   │   └── seeder.py         # Database seeding script (Super Admin, Plans, Admins, Orgs, HRs)
│   ├── uploads/              # Uploaded candidate resumes directory
│   ├── .env                  # Backend environment configuration (git ignored)
│   ├── .env.example          # Environment variables template
│   ├── migrate.py            # Standalone Migration CLI runner
│   ├── migrate_question_bank.py # Standalone Question Bank migration runner
│   └── requirements.txt      # Python backend dependencies
├── frontend/
│   ├── admin/                # Admin Portal UI
│   ├── css/                  # Application stylesheets
│   ├── hr/                   # HR Portal UI
│   ├── interviewer/          # Interviewer Portal UI
│   ├── js/                   # Shared JavaScript modules & API client scripts
│   ├── super_admin/          # Super Admin Portal UI
│   ├── .env                  # Frontend static environment configuration
│   ├── .env.example          # Frontend configuration template
│   └── index.html            # Main entry landing page
└── README.md                 # Project Documentation
```

---

## ⚙️ Prerequisites

Ensure you have the following installed on your machine:
1. **Python 3.10+** (Python 3.11 or 3.12 recommended)
2. **PostgreSQL 14+** (running locally or accessible remotely)
3. **`pgvector` Extension** installed in your PostgreSQL instance:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. **Google Gemini API Key** (Required for AI screening & candidate evaluation)

---

## 🔐 Environment Configuration

### 1. Backend Environment Setup

Navigate to the `backend/` directory and create your `.env` file from `.env.example`:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your settings:

```ini
# ── Database (PostgreSQL) ────────────────────────────────────────────────────
DB_NAME=hrms
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432

# ── Application ──────────────────────────────────────────────────────────────
APP_HOST=0.0.0.0
APP_PORT=8000
LOG_LEVEL=INFO
AUTO_MIGRATE=false  # Set to true to auto-run migrations on app startup

# ── Super Admin Account Config ───────────────────────────────────────────────
SUPER_ADMIN_USERNAME=superadmin
SUPER_ADMIN_EMAIL=superadmin@example.com
SUPER_ADMIN_PASSWORD=superadmin123
SUPER_ADMIN_FULL_NAME="Super Administrator"

# ── AI / LLM Integration ─────────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite

# ── SMTP Email (Optional - leave blank for local mock mode) ─────────────────
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
```

### 2. Frontend Environment Setup

Navigate to `frontend/` and configure `.env`:

```bash
cd ../frontend
cp .env.example .env
```

```ini
API_BASE_URL=http://localhost:8000
BACKEND_HOST=localhost
BACKEND_PORT=8000
APP_NAME=AI HR Assistant
APP_VERSION=1.0.0
```

---

## 🗄️ Database Setup & Migrations

The database migrations are versioned `.sql` files located in `backend/app/migrations/`. 

### Running Migrations via CLI (Recommended)

1. Open your terminal in the `backend/` directory.
2. Run the migration CLI tool:

```bash
# Check current migration status
python migrate.py status

# Apply all pending migrations to the database
python migrate.py
```

### Automatic Migrations on App Startup

Alternatively, set `AUTO_MIGRATE=true` in `backend/.env`. The application will automatically execute any unapplied migration scripts upon starting the server.

---

## 🌱 Seeding the Database

To populate the database with essential default records (Super Admin account, Subscription Plans, test Admins, Organizations, Branches, and HR users), run the seeder script:

```bash
cd backend
python scripts/seeder.py
```

### What `seeder.py` Creates:
1. **Super Admin Account**: `superadmin` / `superadmin123`
2. **Subscription Plans**: Basic, Standard, and Premium plans.
3. **4 Test Admins**:
   - `Admin1` (`admin1@gmail.com` / `Admin@123`)
   - `Admin2` (`admin2@gmail.com` / `Admin@123`)
   - `Admin3` (`admin3@gmail.com` / `Admin@123`)
   - `Admin4` (`admin4@gmail.com` / `Admin@123`)
4. **Organizations & Branches**: Sample enterprise structure.
5. **HR Users**: 8 test HR user accounts (`hr1@gmail.com` through `hr8@gmail.com` with password pattern `hr<N>@123`).

---

## 🚀 Running the Project

### Step-by-Step Setup Guide

#### 1. Clone & Setup Virtual Environment

```bash
# Clone the repository
git clone <repository_url>
cd Ai-HR-Assistant

# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv .venv

# Activate Virtual Environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (CMD):
.venv\Scripts\activate.bat
# Linux/macOS:
source .venv/bin/activate
```

#### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### 3. Initialize Database & Run Migrations

Ensure PostgreSQL is running and the database `hrms` exists (or create it in psql: `CREATE DATABASE hrms;`).

```bash
python migrate.py
```

#### 4. Seed Default Data

```bash
python scripts/seeder.py
```

#### 5. Start the Application Server

```bash
uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

#### 6. Access the Application

Open your browser and navigate to:
- **Web App Interface**: [http://localhost:8000/](http://localhost:8000/)
- **Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc API Docs**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🔑 Default Seeded Credentials

| Role | Username / Email | Password | Access Portal URL |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin` / `superadmin@example.com` | `superadmin123` | `http://localhost:8000/super_admin/` |
| **Admin 1** | `Admin1` / `admin1@gmail.com` | `Admin@123` | `http://localhost:8000/admin/` |
| **Admin 2** | `Admin2` / `admin2@gmail.com` | `Admin@123` | `http://localhost:8000/admin/` |
| **HR User 1** | `hr1` / `hr1@gmail.com` | `hr1@123` | `http://localhost:8000/hr/` |
| **HR User 2** | `hr2` / `hr2@gmail.com` | `hr2@123` | `http://localhost:8000/hr/` |

---

## 📡 API Documentation & Health Check

### Health Check Endpoint
- **URL**: `GET /api/health`
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "AI Recruitment System"
  }
  ```

### Key API Endpoint Modules

- **`/api/auth`**: Authentication, login, session validation.
- **`/api/super-admin`**: Subscription plans management, Admin creation.
- **`/api/admin`**: Organization settings, branch management, HR user provisioning.
- **`/api/hr`**: Dashboard metrics, organization member management.
- **`/api/jobs`**: Job posting creation, description generation, department filters.
- **`/api/candidates`**: Resume upload, parsing, profile status updates.
- **`/api/screening`**: Automated Gemini AI candidate screening & matching.
- **`/api/comparison`**: Candidate side-by-side comparison analytics.
- **`/api/interviewers`**: Interview panel user accounts & availability.
- **`/api/assignments`**: Candidate-to-Interviewer scheduling & feedback collection.
- **`/api/question-bank`**: Question bank CRUD categorized by department & difficulty.
- **`/api/emails`**: Candidate email drafting & delivery services.
- **`/api/ai-tasks`**: Async task status tracking.

---

## ❓ Troubleshooting

### 1. Database Connection Failed (`psycopg2.OperationalError`)
- Ensure PostgreSQL server service is running.
- Verify `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` in `backend/.env`.

### 2. Missing `vector` Extension Error
- If PostgreSQL raises an error regarding `vector`, run this command in your PostgreSQL console:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

### 3. Gemini API Errors
- Ensure `GEMINI_API_KEY` in `backend/.env` is set to a valid API key obtained from Google AI Studio.

### 4. Port 8000 Already in Use
- Change `APP_PORT` in `backend/.env` and launch Uvicorn with your custom port:
  ```bash
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
  ```

---

*AI HR Assistant © 2026. Built with FastAPI & Gemini AI.*

