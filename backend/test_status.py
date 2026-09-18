import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # get a candidate and assignment
                cur.execute("SELECT ia.id, ia.candidate_id, ia.status FROM interview_assignments ia LIMIT 1")
                assignment = cur.fetchone()
                print("Before test, assignment:", assignment)
                
                # Fetch screening status
                cur.execute("SELECT interview_status FROM candidate_screening_status WHERE candidate_id=%s", (assignment[1],))
                print("Before test, screening:", cur.fetchone())
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
