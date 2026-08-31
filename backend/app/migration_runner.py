"""
Database migration runner.

Scans the ``migrations/`` directory for versioned ``.sql`` files,
executes them in alphabetical order, and tracks applied migrations
in a ``_migrations`` table to avoid re-running.
"""

import os
import glob
from app.logger import get_logger

logger = get_logger(__name__)

_MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def _ensure_migrations_table(conn) -> None:
    """Create the _migrations tracking table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(500) UNIQUE NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
    conn.commit()


def _get_applied_migrations(conn) -> set:
    """Return a set of already-applied migration filenames."""
    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM _migrations ORDER BY filename;")
        return {row[0] for row in cur.fetchall()}


def _get_pending_migrations(applied: set) -> list:
    """Return sorted list of migration file paths not yet applied."""
    pattern = os.path.join(_MIGRATIONS_DIR, "*.sql")
    all_files = sorted(glob.glob(pattern))
    return [f for f in all_files if os.path.basename(f) not in applied]


def run_migrations(conn) -> None:
    """
    Execute all pending SQL migrations in order.

    Args:
        conn: An active psycopg2 connection (from the pool).
    """
    _ensure_migrations_table(conn)
    applied = _get_applied_migrations(conn)
    pending = _get_pending_migrations(applied)

    if not pending:
        logger.info("No pending migrations.")
        return

    for filepath in pending:
        filename = os.path.basename(filepath)
        logger.info("Applying migration: %s", filename)

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                sql = f.read()

            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO _migrations (filename) VALUES (%s);",
                    (filename,),
                )
            conn.commit()
            logger.info("Migration applied successfully: %s", filename)

        except Exception as e:
            conn.rollback()
            logger.error("Migration failed [%s]: %s", filename, e, exc_info=True)
            raise RuntimeError(f"Migration failed: {filename}") from e
