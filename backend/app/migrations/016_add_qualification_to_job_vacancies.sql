-- Migration 016: Add qualification column to job_vacancies table
-- Fixes missing column error in list_jobs / get_job / create_job

ALTER TABLE job_vacancies ADD COLUMN IF NOT EXISTS qualification VARCHAR(255) DEFAULT '';

-- Backfill NULL values with empty string
UPDATE job_vacancies SET qualification = '' WHERE qualification IS NULL;
