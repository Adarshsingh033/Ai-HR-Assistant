"""
Admin seeder — inserts the default admin user on first startup.
"""

import uuid
from app.database import get_db_connection
from app.config import DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD
from app.logger import get_logger

logger = get_logger(__name__)


def seed_admin() -> None:
    """Insert the default admin user if not already present."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM admin WHERE username = %s LIMIT 1",
                (DEFAULT_ADMIN_USERNAME,),
            )
            existing = cur.fetchone()

            if existing:
                logger.info("Default admin user '%s' already exists — skipping seed.", DEFAULT_ADMIN_USERNAME)
                return

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
                    "System Default Admin",
                ),
            )
        conn.commit()
        logger.info("Default admin user '%s' seeded successfully.", DEFAULT_ADMIN_USERNAME)
