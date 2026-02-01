"""
Migration: Add per-branch cancellation tracking
Adds is_cancelled and cancelled_at columns to active_branch_subscriptions table
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports when running standalone
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def upgrade():
    """Add cancellation tracking fields to active_branch_subscriptions table"""

    try:
        logger.info("Adding branch cancellation tracking fields...")

        async with engine.begin() as conn:
            # Add is_cancelled column
            await conn.execute(text("""
                ALTER TABLE active_branch_subscriptions
                ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE NOT NULL
            """))
            logger.info("✅ Added is_cancelled column")

            # Add cancelled_at column
            await conn.execute(text("""
                ALTER TABLE active_branch_subscriptions
                ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL
            """))
            logger.info("✅ Added cancelled_at column")

            # Create index for performance
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_active_branch_cancelled
                ON active_branch_subscriptions(is_cancelled)
            """))
            logger.info("✅ Created performance index")

        logger.info("✅ Migration completed successfully!")

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        raise


async def downgrade():
    """Remove cancellation tracking fields from active_branch_subscriptions table"""

    try:
        logger.info("Removing branch cancellation tracking fields...")

        async with engine.begin() as conn:
            # Drop index
            await conn.execute(text("DROP INDEX IF EXISTS idx_active_branch_cancelled"))
            logger.info("✅ Dropped index")

            # Remove columns
            await conn.execute(text("""
                ALTER TABLE active_branch_subscriptions
                DROP COLUMN IF EXISTS cancelled_at,
                DROP COLUMN IF EXISTS is_cancelled
            """))
            logger.info("✅ Removed columns")

        logger.info("✅ Downgrade completed successfully!")

    except Exception as e:
        logger.error(f"❌ Downgrade failed: {e}")
        raise


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        asyncio.run(downgrade())
    else:
        asyncio.run(upgrade())
