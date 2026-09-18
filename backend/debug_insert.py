import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("--- Try Inserting ---")
                cur.execute("BEGIN")
                try:
                    cur.execute(
                        """
                        INSERT INTO interview_assignments
                            (id, organization_id, branch_id, department_id, candidate_id,
                             job_id, round_id, interviewer_id, assigned_by_hr_id,
                             status, assigned_at, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, 'Ongoing', NOW(), NOW(), NOW())
                        ON CONFLICT (candidate_id, round_id) DO UPDATE
                        SET interviewer_id = EXCLUDED.interviewer_id,
                            status = 'Ongoing',
                            rating = NULL,
                            feedback = NULL,
                            updated_at = EXCLUDED.updated_at
                        RETURNING id
                        """,
                        (
                            '99999999-9999-9999-9999-999999999999', 
                            '33e9823e-2a71-4934-96af-b95d1e769b38', 
                            '948d1e10-50e5-49e3-b2bf-a0db84c99c72', 
                            '5114687b-e4e9-49ef-83d5-7d51f10ed514', 
                            '107258f7-4226-4542-80da-6d02c9cee043', 
                            'ca621afc-a7f7-4667-a62e-c56531474b95', 
                            '5700720e-7ee6-4049-b0b4-a8790d3ad0b9', 
                            '200c3c01-e276-4cd7-a62c-7c3afe3f1cf7'
                        ),
                    )
                    print(cur.fetchone())
                    cur.execute("ROLLBACK")
                    print("Insert Success and Rolled back.")
                except Exception as e:
                    print("Insert Error:", e)
                    cur.execute("ROLLBACK")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
