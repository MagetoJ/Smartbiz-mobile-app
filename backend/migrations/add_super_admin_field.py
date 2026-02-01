"""
Migration: Add is_super_admin field to users table

This migration adds platform-level super admin capability.
Super admins have platform-wide access to monitor and manage all tenants.
"""

from sqlalchemy import text
from database import engine, Base
import asyncio


async def upgrade():
    """Add is_super_admin field to users table"""
    async with engine.begin() as conn:
        # Add is_super_admin column
        await conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
        """))
        
        # Create index for super admin queries
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_users_super_admin 
            ON users(is_super_admin) WHERE is_super_admin = TRUE;
        """))
        
        print("✅ Added is_super_admin field to users table")


async def downgrade():
    """Remove is_super_admin field from users table"""
    async with engine.begin() as conn:
        await conn.execute(text("""
            DROP INDEX IF EXISTS idx_users_super_admin;
        """))
        
        await conn.execute(text("""
            ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin;
        """))
        
        print("✅ Removed is_super_admin field from users table")


if __name__ == "__main__":
    print("Running migration: add_super_admin_field")
    asyncio.run(upgrade())
    print("Migration completed successfully!")
