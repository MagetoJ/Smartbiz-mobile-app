"""
Database Migration: Add Service Support
Adds is_service field to products table to distinguish services from physical products
"""
from sqlalchemy import text
from database import async_session_maker
import asyncio


async def migrate():
    """Add is_service column and index to products table"""
    async with async_session_maker() as session:
        try:
            # Add is_service column with default False for existing products
            await session.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE NOT NULL"
            ))

            # Create index for better query performance
            await session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_products_tenant_service ON products(tenant_id, is_service)"
            ))

            await session.commit()
            print("✓ Migration completed: is_service field added to products table")
            print("✓ Index created: idx_products_tenant_service")

        except Exception as e:
            await session.rollback()
            print(f"✗ Migration failed: {str(e)}")
            raise


if __name__ == "__main__":
    asyncio.run(migrate())
