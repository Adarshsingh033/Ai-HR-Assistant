"""
Database connection pool and initialization.

Uses psycopg2 SimpleConnectionPool with pgvector support.
Schema management is handled by the migration runner.
"""

import psycopg2
from psycopg2 import pool
from pgvector.psycopg2 import register_vector
from contextlib import contextmanager

from app.config import DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
from app.logger import get_logger

logger = get_logger(__name__)

# ── Connection Pool ──────────────────────────────────────────────────────────
db_pool = None

try:
    db_pool = psycopg2.pool.SimpleConnectionPool(
        1, 10,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
    )
    logger.info("Database connection pool initialized (host=%s, db=%s).", DB_HOST, DB_NAME)
except psycopg2.OperationalError as e:
    logger.error("Failed to initialize database connection pool: %s", e)


@contextmanager
def get_db_connection():
    """Yields a database connection from the pool with pgvector registered if available."""
    if not db_pool:
        raise RuntimeError("Database connection pool is not initialized.")
    conn = db_pool.getconn()
    try:
        try:
            register_vector(conn)
        except Exception:
            # Safely ignore if 'vector' extension hasn't been created yet (e.g. before initial migration)
            pass
        yield conn
    finally:
        db_pool.putconn(conn)


def init_db() -> None:
    """Run pending database migrations to bring the schema up to date."""
    if not db_pool:
        logger.error("Cannot run migrations — database pool is not initialized.")
        return

    from app.migration_runner import run_migrations

    with get_db_connection() as conn:
        run_migrations(conn)

    logger.info("Database initialization complete.")


def close_pool() -> None:
    """Close all connections in the pool (for graceful shutdown)."""
    if db_pool:
        db_pool.closeall()
        logger.info("Database connection pool closed.")
