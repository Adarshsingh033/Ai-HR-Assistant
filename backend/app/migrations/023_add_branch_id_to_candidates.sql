-- Migration 023: Add branch_id to candidates table for branch-level data isolation

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS branch_id UUID;

ALTER TABLE candidates DROP CONSTRAINT IF EXISTS fk_candidates_branch;
ALTER TABLE candidates ADD CONSTRAINT fk_candidates_branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- Back-fill branch_id from the job_vacancies table for existing candidates
UPDATE candidates c
SET branch_id = jv.branch_id
FROM job_vacancies jv
WHERE c.job_id = jv.id
  AND c.branch_id IS NULL
  AND jv.branch_id IS NOT NULL;

-- Back-fill branch_id from the organization_members (hr) table where still missing
UPDATE candidates c
SET branch_id = om.branch_id
FROM organization_members om
WHERE c.hr_id = om.id
  AND c.branch_id IS NULL
  AND om.branch_id IS NOT NULL;

-- Create index for efficient branch-scoped queries
CREATE INDEX IF NOT EXISTS idx_candidates_branch_id ON candidates(branch_id);
CREATE INDEX IF NOT EXISTS idx_candidates_org_branch ON candidates(org_id, branch_id);
