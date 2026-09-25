-- Migration 024: Drop candidates_hr_id_fkey to allow HR IDs from organization_members

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_hr_id_fkey;
