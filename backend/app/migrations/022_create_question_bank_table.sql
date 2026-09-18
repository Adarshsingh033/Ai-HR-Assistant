-- Migration 022: Create question_bank table
-- Stores interview questions created by interviewers, with difficulty levels.
-- Questions are scoped to the organization and optionally to a branch/department.

CREATE TABLE IF NOT EXISTS question_bank (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                    UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    branch_id                 UUID REFERENCES branches(id) ON DELETE SET NULL,
    department_id             UUID REFERENCES departments(id) ON DELETE SET NULL,
    created_by_interviewer_id UUID NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
    question                  TEXT NOT NULL,
    difficulty                VARCHAR(10) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    category                  VARCHAR(120),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbank_org         ON question_bank (org_id);
CREATE INDEX IF NOT EXISTS idx_qbank_difficulty  ON question_bank (difficulty);
CREATE INDEX IF NOT EXISTS idx_qbank_interviewer ON question_bank (created_by_interviewer_id);
