-- =============================================================================
-- Migration 012: Extend Emails Schema
-- Renames sent_emails to emails, adds folder, is_starred, and from_email columns.
-- =============================================================================

-- Rename the table
ALTER TABLE sent_emails RENAME TO emails;

-- Add new columns
ALTER TABLE emails ADD COLUMN IF NOT EXISTS folder VARCHAR(50) DEFAULT 'sent';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_email VARCHAR(255);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing records to be in the 'sent' folder
UPDATE emails SET folder = 'sent' WHERE folder IS NULL;

-- Add an index for faster filtering
CREATE INDEX IF NOT EXISTS idx_emails_hr_folder ON emails(hr_id, folder);
