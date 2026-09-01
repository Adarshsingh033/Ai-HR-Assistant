-- Migration 005: Add status column to organization table

ALTER TABLE organization ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

UPDATE organization SET status = 'active' WHERE status IS NULL;
