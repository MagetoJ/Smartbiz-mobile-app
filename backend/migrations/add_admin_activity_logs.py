"""
Migration: Add admin_activity_logs table

This table tracks all super admin actions for audit and security purposes.
Includes actions like login, tenant management, impersonation, and admin management.
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine


async def run_migration():
    """Create admin_activity_logs table"""
    print("Running migration: add_admin_activity_logs")
    
    async with engine.begin() as conn:
        # Create admin_activity_logs table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS admin_activity_logs (
                id SERIAL PRIMARY KEY,
                admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                action VARCHAR(100) NOT NULL,
                target_type VARCHAR(50),
                target_id INTEGER,
                details JSONB,
                ip_address VARCHAR(50),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
        """))
        
        print("✅ Created admin_activity_logs table")
        
        # Create indexes for performance
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_admin_logs_user 
            ON admin_activity_logs(admin_user_id);
        """))
        
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_admin_logs_created 
            ON admin_activity_logs(created_at DESC);
        """))
        
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_admin_logs_action 
            ON admin_activity_logs(action);
        """))
        
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_admin_logs_target 
            ON admin_activity_logs(target_type, target_id) 
            WHERE target_type IS NOT NULL;
        """))
        
        print("✅ Created indexes on admin_activity_logs")
    
    print("Migration completed successfully!")


if __name__ == "__main__":
    asyncio.run(run_migration())
