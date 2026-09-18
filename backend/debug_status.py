import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("--- Candidate Screening Status ---")
                cur.execute("SELECT id, candidate_id, interview_status, current_round_order FROM candidate_screening_status LIMIT 10")
                for r in cur.fetchall():
                    print(r)
                
                print("\n--- Interview Assignments ---")
                cur.execute("SELECT candidate_id, status FROM interview_assignments LIMIT 10")
                for r in cur.fetchall():
                    print(r)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
