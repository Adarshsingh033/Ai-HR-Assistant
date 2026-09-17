-- Migration 021: Create interview_status_history table
-- Audit trail for every status change in the interview workflow.
-- Captures: who changed, from what status, to what status, rating, feedback, when.

CREATE TABLE IF NOT EXISTS interview_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES interview_assignments(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    changed_by_interviewer_id UUID REFERENCES interviewers(id) ON DELETE SET NULL,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    rating INTEGER,
    feedback TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_history_assignment ON interview_status_history(assignment_id);
CREATE INDEX IF NOT EXISTS idx_status_history_org ON interview_status_history(organization_id);
