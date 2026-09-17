-- Migration 019: Create interviewers table
-- Interviewers belong to exactly one Tenant/Organization, Branch, and Department.
-- Created by HR; authenticate via the same /api/auth/login endpoint with role=interviewer.

CREATE TABLE IF NOT EXISTS interviewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_by_hr_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    full_name VARCHAR(200) NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Usernames and emails are unique within the same organization
    CONSTRAINT unique_interviewer_username_per_org UNIQUE(organization_id, username),
    CONSTRAINT unique_interviewer_email_per_org UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_interviewers_org ON interviewers(organization_id);
CREATE INDEX IF NOT EXISTS idx_interviewers_branch ON interviewers(branch_id);
CREATE INDEX IF NOT EXISTS idx_interviewers_dept ON interviewers(department_id);
