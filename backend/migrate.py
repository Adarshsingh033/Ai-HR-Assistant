"""
Standalone Database Migration CLI for Production.

Provides a dedicated CLI command to run and check database migrations
independently of the application server lifespan.

Usage:
    python migrate.py          # Applies all pending migrations
    python migrate.py status   # Shows migration history and pending status
"""

import sys
import os

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db_connection
from app.migration_runner import (
    run_migrations,
    _get_applied_migrations,
    _get_pending_migrations,
    _ensure_migrations_table,
)
from app.logger import get_logger

logger = get_logger("migration_cli")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "up"

    with get_db_connection() as conn:
        if cmd in ("status", "list"):
            _ensure_migrations_table(conn)
            applied = _get_applied_migrations(conn)
            pending = _get_pending_migrations(applied)

            print("\n" + "=" * 55)
            print("  DATABASE MIGRATION STATUS")
            print("=" * 55)
            print(f"Applied migrations ({len(applied)}):")
            for m in sorted(applied):
                print(f"  [✓] {m}")

            print(f"\nPending migrations ({len(pending)}):")
            if pending:
                for m in pending:
                    print(f"  [ ] {m}")
            else:
                print("  (None — Database is up to date)")
            print("=" * 55 + "\n")

        elif cmd in ("up", "upgrade", "migrate", "run"):
            print("\nApplying database migrations...")
            run_migrations(conn)
            print("All migrations completed successfully.\n")

        else:
            print(f"\nUnknown migration command: '{cmd}'")
            print("Usage:")
            print("  python migrate.py           Apply pending migrations")
            print("  python migrate.py status    Check migration status\n")


if __name__ == "__main__":
    main()
