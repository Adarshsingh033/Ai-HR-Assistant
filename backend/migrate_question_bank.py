"""
Migration: Create question_bank table
Run: python migrate_question_bank.py
"""
import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db_connection

def migrate():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS question_bank (
                    id                        UUID PRIMARY KEY,
                    org_id                    UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
                    branch_id                 UUID,
                    department_id             UUID,
                    created_by_interviewer_id UUID NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
                    question                  TEXT NOT NULL,
                    difficulty                VARCHAR(10) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
                    category                  VARCHAR(120),
                    created_at                TIMESTAMPTZ DEFAULT NOW(),
                    updated_at                TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_qbank_org ON question_bank (org_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_qbank_difficulty ON question_bank (difficulty);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_qbank_interviewer ON question_bank (created_by_interviewer_id);")
            conn.commit()
            print("question_bank table created successfully.")

if __name__ == "__main__":
    migrate()
