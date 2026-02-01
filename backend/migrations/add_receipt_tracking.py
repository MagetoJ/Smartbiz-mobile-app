"""
Migration: Add receipt tracking fields to sales table
Date: 2026-01-19
Description: Adds customer_phone, whatsapp_sent, and email_sent fields to the sales table
"""

import sys
import os
import asyncio
# Add parent directory to path to import database module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import async_session_maker


async def upgrade():
    """Add receipt tracking fields to sales table"""
    async with async_session_maker() as session:
        try:
            # Check if columns already exist
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='sales' 
                AND column_name IN ('customer_phone', 'whatsapp_sent', 'email_sent');
            """)
            
            result = await session.execute(check_query)
            existing_columns = [row[0] for row in result.fetchall()]
            
            if all(col in existing_columns for col in ['customer_phone', 'whatsapp_sent', 'email_sent']):
                print("✅ Receipt tracking fields already exist. Skipping migration.")
                return
            
            print("🔧 Adding receipt tracking fields to sales table...")
            
            # Add customer_phone column
            if 'customer_phone' not in existing_columns:
                await session.execute(text("""
                    ALTER TABLE sales 
                    ADD COLUMN customer_phone VARCHAR(20);
                """))
                print("  ✓ Added customer_phone column")
            
            # Add whatsapp_sent column
            if 'whatsapp_sent' not in existing_columns:
                await session.execute(text("""
                    ALTER TABLE sales 
                    ADD COLUMN whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE;
                """))
                print("  ✓ Added whatsapp_sent column")
            
            # Add email_sent column
            if 'email_sent' not in existing_columns:
                await session.execute(text("""
                    ALTER TABLE sales 
                    ADD COLUMN email_sent BOOLEAN NOT NULL DEFAULT FALSE;
                """))
                print("  ✓ Added email_sent column")
            
            await session.commit()
            print("✅ Migration completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Migration failed: {e}")
            raise


async def downgrade():
    """Remove receipt tracking fields from sales table"""
    async with async_session_maker() as session:
        try:
            print("🔄 Rolling back receipt tracking fields migration...")
            
            await session.execute(text("""
                ALTER TABLE sales 
                DROP COLUMN IF EXISTS customer_phone,
                DROP COLUMN IF EXISTS whatsapp_sent,
                DROP COLUMN IF EXISTS email_sent;
            """))
            print("  ✓ Dropped receipt tracking columns")
            
            await session.commit()
            print("✅ Rollback completed successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Rollback failed: {e}")
            raise


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        asyncio.run(downgrade())
    else:
        asyncio.run(upgrade())
