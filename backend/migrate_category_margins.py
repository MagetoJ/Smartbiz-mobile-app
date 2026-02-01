"""
Migration script to add margin fields to categories table.
Run this once after updating the Category model.
"""
import asyncio
from sqlalchemy import text
from database import get_db


async def migrate():
    async for db in get_db():
        try:
            print("Starting category margin fields migration...")

            # Check and add target_margin column
            result = await db.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'categories' AND column_name = 'target_margin'
                );
            """))
            if not result.scalar():
                await db.execute(text("""
                    ALTER TABLE categories
                    ADD COLUMN target_margin FLOAT DEFAULT NULL;
                """))
                print("✓ target_margin column added to categories")
            else:
                print("✓ target_margin column already exists in categories")

            # Check and add minimum_margin column
            result = await db.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'categories' AND column_name = 'minimum_margin'
                );
            """))
            if not result.scalar():
                await db.execute(text("""
                    ALTER TABLE categories
                    ADD COLUMN minimum_margin FLOAT DEFAULT NULL;
                """))
                print("✓ minimum_margin column added to categories")
            else:
                print("✓ minimum_margin column already exists in categories")

            await db.commit()
            print("✅ Migration completed successfully!")
            print("\nAll categories now have:")
            print("   - target_margin: NULL (use system default 25%)")
            print("   - minimum_margin: NULL (use system default 15%)")
            print("\nAdmins can now set custom margins per category in Settings > Categories")

        except Exception as e:
            await db.rollback()
            print(f"❌ Migration failed: {e}")
            raise
        finally:
            break


if __name__ == "__main__":
    asyncio.run(migrate())
