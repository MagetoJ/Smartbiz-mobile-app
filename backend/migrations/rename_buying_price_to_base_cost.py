"""
Rename buying_price column to base_cost in products table

This migration renames the 'buying_price' field to 'base_cost' to better
reflect its use for both physical products and services.
"""
from sqlalchemy import text
import sys
import os

# Add parent directory to path to import database
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import async_session_maker


async def migrate():
    """Rename buying_price to base_cost"""
    async with async_session_maker() as session:
        print("Starting migration: buying_price → base_cost")

        # Rename column atomically
        await session.execute(text(
            "ALTER TABLE products RENAME COLUMN buying_price TO base_cost"
        ))
        print("✓ Column renamed")

        # Add helpful comment
        await session.execute(text(
            "COMMENT ON COLUMN products.base_cost IS "
            "'Base cost price for products and services'"
        ))
        print("✓ Column comment added")

        await session.commit()
        print("✓ Migration completed: buying_price → base_cost")


async def rollback():
    """Rollback: rename base_cost back to buying_price"""
    async with async_session_maker() as session:
        print("Starting rollback: base_cost → buying_price")

        await session.execute(text(
            "ALTER TABLE products RENAME COLUMN base_cost TO buying_price"
        ))

        await session.commit()
        print("✓ Rollback completed: base_cost → buying_price")


if __name__ == "__main__":
    import asyncio

    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        print("\n" + "="*50)
        print("ROLLBACK MODE")
        print("="*50 + "\n")
        asyncio.run(rollback())
    else:
        print("\n" + "="*50)
        print("MIGRATION: Rename buying_price to base_cost")
        print("="*50 + "\n")
        asyncio.run(migrate())
