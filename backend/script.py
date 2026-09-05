import sys; sys.path.append('c:/Users/adars/Desktop/Ai-HR-Assistant/backend'); from app.database import get_db_connection;
with get_db_connection() as conn:
    with conn.cursor() as cur:
        cur.execute('''
            SELECT constraint_name, table_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'emails' AND constraint_type = 'FOREIGN KEY'
        ''')
        print(cur.fetchall())

