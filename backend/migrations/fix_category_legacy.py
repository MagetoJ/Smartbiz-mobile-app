"""
Migration to make category_legacy nullable since it's being deprecated
"""
from sqlalchemy import text
import sys
import os

# Add parent directory to path to import database
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import async_session_maker


async def migrate():
    async with async_session_maker() as session:
        # Make category_legacy nullable
        await session.execute(text(
            "ALTER TABLE products ALTER COLUMN category_legacy DROP NOT NULL"
        ))
        await session.commit()
        print("✓ Migration completed: category_legacy is now nullable")


if __name__ == "__main__":
    import asyncio
    asyncio.run(migrate())
