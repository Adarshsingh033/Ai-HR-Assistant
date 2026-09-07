"""Seeders package — initial/default data for the database."""

from app.seeders.admin_seeder import seed_admin
from app.seeders.super_admin_seeder import seed_super_admin

__all__ = ["seed_admin", "seed_super_admin"]
