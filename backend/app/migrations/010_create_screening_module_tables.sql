-- Migration 010: Screening Module Tables
-- Creates tables for screening rounds per job vacancy, candidate screening/interview statuses, and round evaluations.

CREATE TABLE IF NOT EXISTS screening_rounds (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES job_vacancies(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    round_title VARCHAR(255) NOT NULL,
    round_description TEXT,
    round_order INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidate_screening_status (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID REFERENCES job_vacancies(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    interview_schedule VARCHAR(50) DEFAULT 'Pending',
    screening_stage VARCHAR(100) DEFAULT 'Screening',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_candidate_screening UNIQUE(candidate_id)
);

CREATE TABLE IF NOT EXISTS screening_comments (
    id UUID PRIMARY KEY,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    round_id UUID REFERENCES screening_rounds(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'Pending',
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_candidate_round UNIQUE(candidate_id, round_id)
);
