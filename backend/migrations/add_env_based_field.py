"""
Migration: Add env_based field to users table

This field marks super admins that are created from environment variables.
These admins cannot be deleted through the UI and are automatically recreated
on server startup if missing (disaster recovery).
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine, Base


async def run_migration():
    """Add env_based field to users table"""
    print("Running migration: add_env_based_field")
    
    async with engine.begin() as conn:
        # Add env_based column
        await conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS env_based BOOLEAN DEFAULT FALSE;
        """))
        
        print("✅ Added env_based field to users table")
        
        # Create index for faster lookups
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_users_env_based
            ON users(env_based) WHERE env_based = TRUE;
        """))
        
        print("✅ Created index on env_based field")
    
    print("Migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(run_migration())
