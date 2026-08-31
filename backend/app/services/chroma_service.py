import uuid
from app.database import get_db_connection
from app.config import DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD


def seed_admin():
    """Insert the default admin user on first startup."""
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check if admin exists
            cur.execute("SELECT id FROM admin WHERE username = %s LIMIT 1", (DEFAULT_ADMIN_USERNAME,))
            existing = cur.fetchone()
            
            if not existing:
                admin_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO admin (id, username, password, email, full_name)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        admin_id,
                        DEFAULT_ADMIN_USERNAME,
                        DEFAULT_ADMIN_PASSWORD,
                        "admin@system.local",
                        "System Default Admin"
                    )
                )
                conn.commit()


def authenticate_user(username: str, password: str):
    """Return user metadata dict if credentials match, else None."""
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check Admin table
            cur.execute("SELECT id, username, password, email FROM admin WHERE username = %s LIMIT 1", (username,))
            admin = cur.fetchone()
            
            if admin:
                if admin[2] == password:
                    return {
                        "user_id": str(admin[0]),
                        "username": admin[1],
                        "role": "admin",
                        "org_id": "",
                        "email": admin[3],
                    }
                return None
            
            # Check HR table
            cur.execute("SELECT id, username, password, email, org_id FROM hr WHERE username = %s LIMIT 1", (username,))
            hr = cur.fetchone()
            
            if hr:
                if hr[2] == password:
                    return {
                        "user_id": str(hr[0]),
                        "username": hr[1],
                        "role": "hr",
                        "org_id": str(hr[4]) if hr[4] else "",
                        "email": hr[3],
                    }
                return None

    return None
