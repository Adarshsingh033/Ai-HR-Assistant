-- Migration 011: Update Screening Module Schema
-- Adds interview_status, current_round_order, contacted_status to candidate_screening_status, and score to screening_comments.

ALTER TABLE candidate_screening_status 
ADD COLUMN IF NOT EXISTS interview_status VARCHAR(50) DEFAULT 'Ongoing';

ALTER TABLE candidate_screening_status 
ADD COLUMN IF NOT EXISTS current_round_order INTEGER DEFAULT 1;

ALTER TABLE candidate_screening_status 
ADD COLUMN IF NOT EXISTS contacted_status VARCHAR(50) DEFAULT 'Contacted';

ALTER TABLE screening_comments 
ADD COLUMN IF NOT EXISTS score INTEGER;
