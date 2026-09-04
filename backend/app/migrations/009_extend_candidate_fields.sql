-- Migration 009: Extend candidates table with additional profile fields
-- Adds: address, linkedin_url, github_url, qualification
-- These are extracted by the AI resume parser and stored per candidate

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS address       TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS linkedin_url  VARCHAR(500);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS github_url    VARCHAR(500);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS qualification TEXT;

-- Backfill NULLs to empty string for safe NOT NULL upgrades later
UPDATE candidates SET address       = '' WHERE address IS NULL;
UPDATE candidates SET linkedin_url  = '' WHERE linkedin_url IS NULL;
UPDATE candidates SET github_url    = '' WHERE github_url IS NULL;
UPDATE candidates SET qualification = '' WHERE qualification IS NULL;
