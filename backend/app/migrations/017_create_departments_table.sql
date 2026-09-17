-- Migration 017: Create departments table
-- Departments are scoped to exactly one Organization and one Branch.
-- Created by Admin; referenced by job_vacancies and interviewers.

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_by_admin_id UUID REFERENCES admin(id) ON DELETE SET NULL,
    department_name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_dept_per_branch UNIQUE(branch_id, department_name)
);

CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch ON departments(branch_id);
