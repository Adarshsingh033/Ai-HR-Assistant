-- Migration 007: Create job_vacancies table and consolidate legacy job tables

CREATE TABLE IF NOT EXISTS job_vacancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    branch_id UUID,
    created_by_hr_id UUID NOT NULL,

    job_title VARCHAR(255) NOT NULL,
    department VARCHAR(150),
    employment_type VARCHAR(50) NOT NULL DEFAULT 'Full-time',
    work_mode VARCHAR(50) NOT NULL DEFAULT 'On-site',

    location VARCHAR(255),
    openings INTEGER NOT NULL DEFAULT 1,

    experience_required VARCHAR(100),
    salary VARCHAR(100),

    skills_required TEXT,
    job_description TEXT NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'draft',

    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_vacancy_org FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
    CONSTRAINT fk_vacancy_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- Migrate existing records from jd_description / jd_details if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jd_description') THEN
        INSERT INTO job_vacancies (
            id, organization_id, created_by_hr_id, job_title, department, 
            employment_type, work_mode, location, experience_required, skills_required, 
            job_description, status, created_at
        )
        SELECT 
            jd.id,
            jd.org_id,
            COALESCE(jd.hr_id, '00000000-0000-0000-0000-000000000000'::uuid),
            COALESCE(jd.title, det.title, 'Job Vacancy'),
            COALESCE(det.department, 'General'),
            COALESCE(det.job_type, 'Full-time'),
            'On-site',
            COALESCE(det.location, ''),
            COALESCE(det.experience, ''),
            COALESCE(det.skills, ''),
            COALESCE(jd.description, 'Job Description'),
            'active',
            COALESCE(jd.created_at, NOW())
        FROM jd_description jd
        LEFT JOIN jd_details det ON jd.id = det.description_id
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Update foreign key constraint in candidates table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'candidates_job_id_fkey') THEN
        ALTER TABLE candidates DROP CONSTRAINT candidates_job_id_fkey;
    END IF;
END $$;

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS fk_candidates_job_vacancy;
ALTER TABLE candidates ADD CONSTRAINT fk_candidates_job_vacancy FOREIGN KEY (job_id) REFERENCES job_vacancies(id) ON DELETE CASCADE;

-- Drop legacy tables safely
DROP TABLE IF EXISTS jd_details CASCADE;
DROP TABLE IF EXISTS jd_description CASCADE;
