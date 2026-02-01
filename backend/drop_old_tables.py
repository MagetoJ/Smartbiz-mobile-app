"""
Drop old tables that are no longer in the current schema
Run this before reset if you have schema migration issues
"""
import asyncio
from sqlalchemy import text
from database import engine


async def drop_old_tables():
    """Drop old tables that might be leftover from previous schema versions"""
    print("🗑️  Dropping old/orphaned tables...")

    old_tables = ['orders', 'order_items']  # Add any other old table names here

    async with engine.begin() as conn:
        for table in old_tables:
            try:
                await conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
                print(f"  ✅ Dropped table: {table}")
            except Exception as e:
                print(f"  ⚠️  Could not drop {table}: {e}")

    print("✅ Old tables cleanup complete!")


if __name__ == "__main__":
    asyncio.run(drop_old_tables())
