import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import get_db_connection

def debug():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                print("\n--- Pullable Query ---")
                sql = """
                SELECT DISTINCT ON (c.id)
                       c.id, c.name,
                       c.job_id, jv.job_title,
                       sr.id AS round_id, sr.round_title, sr.round_order,
                       ia.interviewer_id AS current_interviewer_id
                FROM candidates c
                LEFT JOIN candidate_screening_status css ON c.id = css.candidate_id
                LEFT JOIN job_vacancies jv ON c.job_id = jv.id
                LEFT JOIN screening_rounds sr ON sr.job_id = jv.id AND sr.round_order = COALESCE(css.current_round_order, 1)
                LEFT JOIN interview_assignments ia ON ia.candidate_id = c.id AND ia.round_id = sr.id
                WHERE COALESCE(css.interview_status, 'Ongoing') = 'Ongoing' AND c.org_id = '33e9823e-2a71-4934-96af-b95d1e769b38' AND c.reached = TRUE
                ORDER BY c.id, sr.round_order ASC
                """
                cur.execute(sql)
                for r in cur.fetchall():
                    print(r)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug()
