-- Migration 008: Add resume_text column to candidates
-- Stores the cleaned, well-formatted extracted text from uploaded resumes
-- Supports PDF (PaddleOCR), DOCX (python-docx), TXT (plain decode)

ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- Optional index for full-text search on resume content
CREATE INDEX IF NOT EXISTS idx_candidates_resume_text_fts
    ON candidates USING gin(to_tsvector('english', COALESCE(resume_text, '')));

-- Backfill: set empty string for existing rows so NOT NULL upgrades are safe
UPDATE candidates SET resume_text = '' WHERE resume_text IS NULL;
