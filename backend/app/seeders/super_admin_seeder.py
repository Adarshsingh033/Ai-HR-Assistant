"""
Super Admin seeder — inserts the default super admin and legacy plan.
"""

import uuid
from app.database import get_db_connection
from app.config import (
    SUPER_ADMIN_USERNAME,
    SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_FULL_NAME,
)
from app.logger import get_logger

logger = get_logger(__name__)


def seed_super_admin() -> None:
    """Insert the default super admin and a legacy plan if not already present."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. Seed Legacy Plan
                cur.execute("SELECT id FROM plans WHERE name = 'Legacy' LIMIT 1")
                legacy_plan = cur.fetchone()
                
                if not legacy_plan:
                    plan_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO plans (id, name, description, max_organizations, max_branches, max_hr_users, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            plan_id,
                            "Legacy",
                            "Default plan for existing admins before plans were introduced.",
                            999, 
                            999,
                            999,
                            "active"
                        )
                    )
                    logger.info("Legacy Plan seeded successfully.")
                else:
                    plan_id = legacy_plan[0]
                
                # Assign legacy plan to any admins without a plan
                cur.execute("UPDATE admin SET plan_id = %s WHERE plan_id IS NULL", (plan_id,))
                
                # 2. Seed Super Admin
                cur.execute(
                    "SELECT id FROM super_admin WHERE username = %s LIMIT 1",
                    (SUPER_ADMIN_USERNAME,),
                )
                existing = cur.fetchone()

                if existing:
                    logger.info("Super admin user '%s' already exists — skipping seed.", SUPER_ADMIN_USERNAME)
                else:
                    sa_id = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO super_admin (id, username, password, email, full_name)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            sa_id,
                            SUPER_ADMIN_USERNAME,
                            SUPER_ADMIN_PASSWORD,
                            SUPER_ADMIN_EMAIL,
                            SUPER_ADMIN_FULL_NAME,
                        ),
                    )
                    logger.info("Super admin user '%s' seeded successfully.", SUPER_ADMIN_USERNAME)
            conn.commit()
    except Exception as e:
        logger.warning("Could not seed super admin / plans: %s", e)
