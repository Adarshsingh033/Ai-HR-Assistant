-- Migration 018: Add department_id to job_vacancies
-- Links each job vacancy to a specific department, enabling department-based
-- interviewer matching in the interview assignment workflow.

ALTER TABLE job_vacancies
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_vacancies_department ON job_vacancies(department_id);
