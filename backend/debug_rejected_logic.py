import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("--- Simulating Submit Rejected ---")
                cur.execute("SELECT id, candidate_id, job_id, round_id, status FROM interview_assignments WHERE candidate_id='618625ce-b496-4158-beb5-67f0a4d9bbb8' LIMIT 1")
                assignment = cur.fetchone()
                print("Assignment:", assignment)
                
                assignment_id = assignment[0]
                job_id = assignment[2]
                round_id = assignment[3]
                
                cur.execute("SELECT COALESCE(MAX(round_order), 1) FROM screening_rounds WHERE job_id = %s", (job_id,))
                max_rounds = cur.fetchone()[0]
                
                cur.execute("SELECT round_order FROM screening_rounds WHERE id = %s", (round_id,))
                round_order = cur.fetchone()[0]
                
                print("Max Rounds:", max_rounds, "Round Order:", round_order)
                
                status_map = {
                    "Passed": "Passed",
                    "Rejected": "Rejected",
                    "Onhold": "On Hold",
                    "Ongoing": "Ongoing",
                }
                screening_status = status_map.get("Rejected", "Rejected")
                print("Screening Status:", screening_status)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
