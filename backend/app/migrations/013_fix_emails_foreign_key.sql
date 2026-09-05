-- =============================================================================
-- Migration 013: Fix Emails Foreign Key
-- Drops the hr_id foreign key constraint because HR users are now stored in organization_members
-- =============================================================================

ALTER TABLE emails DROP CONSTRAINT IF EXISTS sent_emails_hr_id_fkey;
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_hr_id_fkey;
