-- =============================================================================
-- Migration 016: Create AI Tasks Table
-- Persistent background task queue for all AI-powered operations.
-- Allows AI processes to continue running server-side independently of
-- the user's browser session, page navigation, or network interruptions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_tasks (
    id              UUID PRIMARY KEY,
    task_type       VARCHAR(100) NOT NULL,
    -- Supported types: 'jd_generation', 'resume_parse', 'email_draft',
    --                  'candidate_comparison', 'candidate_match'
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Lifecycle:  pending -> running -> completed | failed
    input_data      JSONB NOT NULL DEFAULT '{}',
    result_data     JSONB,
    error_message   TEXT,
    created_by      VARCHAR(255),   -- hr_id or admin_id
    org_id          UUID,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_tasks_status     ON ai_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_created_by ON ai_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_org_id     ON ai_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_type       ON ai_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_created_at ON ai_tasks(created_at DESC);
