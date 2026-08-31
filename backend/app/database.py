import psycopg2
from psycopg2 import pool
from pgvector.psycopg2 import register_vector
import os
from contextlib import contextmanager
from app.config import DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT

# Initialize connection pool
try:
    db_pool = psycopg2.pool.SimpleConnectionPool(
        1, 10,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )
except psycopg2.OperationalError as e:
    print(f"Error connecting to PostgreSQL: {e}")
    db_pool = None


@contextmanager
def get_db_connection():
    """Yields a database connection from the pool and registers pgvector."""
    if not db_pool:
        raise RuntimeError("Database connection pool is not initialized.")
    conn = db_pool.getconn()
    try:
        # Register pgvector type with this connection
        register_vector(conn)
        yield conn
    finally:
        db_pool.putconn(conn)


def init_db():
    """Initialize PostgreSQL database tables and pgvector extension."""
    if not db_pool:
        return

    commands = (
        "CREATE EXTENSION IF NOT EXISTS vector;",
        """
        CREATE TABLE IF NOT EXISTS admin (
            id UUID PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS organization (
            id UUID PRIMARY KEY,
            company_name VARCHAR(255) NOT NULL,
            admin_id UUID REFERENCES admin(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS hr (
            id UUID PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            admin_id UUID REFERENCES admin(id) ON DELETE SET NULL,
            org_id UUID REFERENCES organization(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS jd_description (
            id UUID PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            embedding VECTOR(384),
            org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
            hr_id UUID REFERENCES hr(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS jd_details (
            id UUID PRIMARY KEY,
            description_id UUID REFERENCES jd_description(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            department VARCHAR(255),
            location VARCHAR(255),
            job_type VARCHAR(100),
            experience VARCHAR(255),
            skills TEXT,
            hr_id UUID REFERENCES hr(id) ON DELETE SET NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS candidates (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(255),
            gender VARCHAR(50),
            total_experience VARCHAR(100),
            skills TEXT,
            education TEXT,
            job_id UUID REFERENCES jd_description(id) ON DELETE CASCADE,
            org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
            hr_id UUID REFERENCES hr(id) ON DELETE SET NULL,
            filename VARCHAR(500),
            embedding VECTOR(384),
            match_percentage INTEGER,
            match_explanation TEXT,
            reached BOOLEAN DEFAULT FALSE,
            remark TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS sent_emails (
            id UUID PRIMARY KEY,
            hr_id UUID REFERENCES hr(id) ON DELETE CASCADE,
            org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
            candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
            to_email VARCHAR(255) NOT NULL,
            cc_emails TEXT,
            bcc_emails TEXT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """,
        # Migrations for existing tables
        "ALTER TABLE organization ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin(id) ON DELETE CASCADE;",
        "ALTER TABLE hr ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin(id) ON DELETE SET NULL;",
        "ALTER TABLE jd_description ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;",
        "ALTER TABLE jd_details ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;",
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hr_id UUID REFERENCES hr(id) ON DELETE SET NULL;"
    )
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for command in commands:
                try:
                    cur.execute(command)
                except Exception as e:
                    print(f"Migration/Init Command Error: {e}")
                    conn.rollback()
                    continue
        conn.commit()
    print("PostgreSQL Database Initialized with pgvector.")
