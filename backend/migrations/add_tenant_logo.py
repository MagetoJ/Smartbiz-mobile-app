"""
Add logo_url column to tenants table for business logo support
"""
from sqlalchemy import text
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import async_session_maker


async def migrate():
    """Add logo_url column to tenants table"""
    async with async_session_maker() as session:
        print("Starting migration: Add logo_url to tenants")

        await session.execute(text(
            "ALTER TABLE tenants ADD COLUMN logo_url VARCHAR(255) NULL"
        ))
        print("✓ Column added: logo_url")

        await session.execute(text(
            "COMMENT ON COLUMN tenants.logo_url IS 'File path to business logo'"
        ))
        print("✓ Column comment added")

        await session.commit()
        print("✓ Migration completed")


async def rollback():
    """Remove logo_url column"""
    async with async_session_maker() as session:
        print("Starting rollback: Remove logo_url from tenants")

        await session.execute(text(
            "ALTER TABLE tenants DROP COLUMN logo_url"
        ))

        await session.commit()
        print("✓ Rollback completed")


if __name__ == "__main__":
    import asyncio

    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        print("\n" + "="*50)
        print("ROLLBACK MODE")
        print("="*50 + "\n")
        asyncio.run(rollback())
    else:
        print("\n" + "="*50)
        print("MIGRATION: Add logo_url to tenants")
        print("="*50 + "\n")
        asyncio.run(migrate())
