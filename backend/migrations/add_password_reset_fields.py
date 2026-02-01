"""
Migration: Add password reset fields to users table

Adds:
- reset_token (String, nullable, indexed)
- reset_token_expires (DateTime, nullable)

Run this migration ONCE to update the existing database schema.
"""

import asyncio
from sqlalchemy import text
from database import async_session_maker


async def add_password_reset_fields():
    """Add password reset columns to users table"""
    
    async with async_session_maker() as session:
        try:
            # Check if columns already exist
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' 
                AND column_name IN ('reset_token', 'reset_token_expires');
            """)
            
            result = await session.execute(check_query)
            existing_columns = [row[0] for row in result.fetchall()]
            
            if 'reset_token' in existing_columns and 'reset_token_expires' in existing_columns:
                print("✅ Password reset fields already exist. Skipping migration.")
                return
            
            print("🔧 Adding password reset fields to users table...")
            
            # Add reset_token column
            if 'reset_token' not in existing_columns:
                await session.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN reset_token VARCHAR(255);
                """))
                print("  ✓ Added reset_token column")
                
                # Create index on reset_token
                await session.execute(text("""
                    CREATE INDEX idx_users_reset_token ON users(reset_token);
                """))
                print("  ✓ Created index on reset_token")
            
            # Add reset_token_expires column
            if 'reset_token_expires' not in existing_columns:
                await session.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN reset_token_expires TIMESTAMP;
                """))
                print("  ✓ Added reset_token_expires column")
            
            await session.commit()
            print("✅ Migration completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Migration failed: {e}")
            raise


async def rollback_password_reset_fields():
    """Rollback: Remove password reset columns (if needed)"""
    
    async with async_session_maker() as session:
        try:
            print("🔄 Rolling back password reset fields migration...")
            
            # Drop index first
            await session.execute(text("""
                DROP INDEX IF EXISTS idx_users_reset_token;
            """))
            print("  ✓ Dropped index idx_users_reset_token")
            
            # Drop columns
            await session.execute(text("""
                ALTER TABLE users 
                DROP COLUMN IF EXISTS reset_token,
                DROP COLUMN IF EXISTS reset_token_expires;
            """))
            print("  ✓ Dropped reset_token and reset_token_expires columns")
            
            await session.commit()
            print("✅ Rollback completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Rollback failed: {e}")
            raise


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        asyncio.run(rollback_password_reset_fields())
    else:
        asyncio.run(add_password_reset_fields())
