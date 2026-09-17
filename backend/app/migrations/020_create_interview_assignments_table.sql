-- Migration 020: Create interview_assignments table
-- Each record represents one Candidate + Job + Round + Interviewer assignment.
-- This allows different interviewers to handle different rounds.
-- One interviewer is allowed per candidate per round (UNIQUE constraint).
-- AI-generated questions are stored per assignment in a JSONB column.

CREATE TABLE IF NOT EXISTS interview_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES job_vacancies(id) ON DELETE CASCADE,
    round_id UUID NOT NULL REFERENCES screening_rounds(id) ON DELETE CASCADE,
    interviewer_id UUID NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
    assigned_by_hr_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,

    -- Interview outcome recorded by the interviewer
    status VARCHAR(30) NOT NULL DEFAULT 'Ongoing',  -- Ongoing, Passed, Rejected, Onhold
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    feedback TEXT,

    -- AI-generated questions stored per assignment (array of 10 strings)
    questions JSONB,

    -- Workflow timestamps
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Exactly one interviewer assignment per candidate per round
    CONSTRAINT unique_assignment_per_round UNIQUE(candidate_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_org ON interview_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_assignments_candidate ON interview_assignments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_assignments_interviewer ON interview_assignments(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_assignments_round ON interview_assignments(round_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON interview_assignments(status);
