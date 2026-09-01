-- =============================================================================
-- Migration 002: Add phone and profile_image columns to admin table
-- =============================================================================

ALTER TABLE admin ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE admin ADD COLUMN IF NOT EXISTS profile_image TEXT;
