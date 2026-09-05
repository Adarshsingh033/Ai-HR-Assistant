-- =============================================================================
-- Migration 001: Initial Schema
-- Creates all core tables and enables vector embeddings.
-- =============================================================================

-- Attempt to enable vector extension if available on the PostgreSQL server
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if C-extension is not installed on Windows PostgreSQL
END $$;

-- Admin users
CREATE TABLE IF NOT EXISTS admin (
    id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Organizations
CREATE TABLE IF NOT EXISTS organization (
    id UUID PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    admin_id UUID REFERENCES admin(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HR users
CREATE TABLE IF NOT EXISTS hr (
    id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    admin_id UUID REFERENCES admin(id) ON DELETE SET NULL,
    org_id UUID REFERENCES organization(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Job descriptions (with vector embedding for similarity search)
CREATE TABLE IF NOT EXISTS jd_description (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    hr_id UUID REFERENCES hr(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Job detail metadata
CREATE TABLE IF NOT EXISTS jd_details (
    id UUID PRIMARY KEY,
    description_id UUID REFERENCES jd_description(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    location VARCHAR(255),
    job_type VARCHAR(100),
    experience VARCHAR(255),
    skills TEXT,
    hr_id UUID REFERENCES hr(id) ON DELETE SET NULL
);

-- Candidates (with vector embedding for matching)
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255),
    gender VARCHAR(50),
    total_experience VARCHAR(100),
    skills TEXT,
    education TEXT,
    job_id UUID REFERENCES jd_description(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    hr_id UUID REFERENCES hr(id) ON DELETE SET NULL,
    filename VARCHAR(500),
    match_percentage INTEGER,
    match_explanation TEXT,
    reached BOOLEAN DEFAULT FALSE,
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sent emails log
CREATE TABLE IF NOT EXISTS sent_emails (
    id UUID PRIMARY KEY,
    hr_id UUID REFERENCES hr(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
    to_email VARCHAR(255) NOT NULL,
    cc_emails TEXT,
    bcc_emails TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Column migrations (safe to re-run due to IF NOT EXISTS)
ALTER TABLE organization ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin(id) ON DELETE CASCADE;
ALTER TABLE hr ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin(id) ON DELETE SET NULL;
ALTER TABLE jd_description ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;
ALTER TABLE jd_details ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;
