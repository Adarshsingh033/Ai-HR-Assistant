import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("--- Constraints ---")
                cur.execute("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'unique_candidate_screening'")
                for r in cur.fetchall():
                    print(r)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
