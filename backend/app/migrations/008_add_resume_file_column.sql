-- =============================================================================
-- Migration 008: Add resume_file column to candidates
-- =============================================================================

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_file BYTEA;
