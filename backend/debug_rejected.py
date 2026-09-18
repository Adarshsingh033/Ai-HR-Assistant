import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("--- Trying to mark candidate as Rejected ---")
                cur.execute("UPDATE interview_assignments SET status='Rejected' WHERE candidate_id='618625ce-b496-4158-beb5-67f0a4d9bbb8'")
                conn.commit()
                
                cur.execute("SELECT status FROM interview_assignments WHERE candidate_id='618625ce-b496-4158-beb5-67f0a4d9bbb8'")
                print(cur.fetchone())
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
