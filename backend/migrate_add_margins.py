"""
Add margin fields to products and recalculate selling prices.
"""
import asyncio
from sqlalchemy import text
from database import async_session_maker

async def migrate_add_margins():
    async with async_session_maker() as session:
        try:
            print("Starting margin fields migration...")

            # Add target_margin column
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'products' AND column_name = 'target_margin'
                );
            """))
            if not result.scalar():
                await session.execute(text("""
                    ALTER TABLE products
                    ADD COLUMN target_margin FLOAT NOT NULL DEFAULT 25.0;
                """))
                print("✓ target_margin column added")
            else:
                print("✓ target_margin column already exists")

            # Add minimum_margin column
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'products' AND column_name = 'minimum_margin'
                );
            """))
            if not result.scalar():
                await session.execute(text("""
                    ALTER TABLE products
                    ADD COLUMN minimum_margin FLOAT NOT NULL DEFAULT 15.0;
                """))
                print("✓ minimum_margin column added")
            else:
                print("✓ minimum_margin column already exists")

            # Recalculate selling_price = base_cost × 1.25
            await session.execute(text("""
                UPDATE products
                SET selling_price = base_cost * 1.25
                WHERE base_cost > 0;
            """))
            print("✓ Selling prices recalculated (base_cost × 1.25)")

            # Warn about zero-cost products
            result = await session.execute(text("""
                SELECT COUNT(*) FROM products WHERE base_cost = 0;
            """))
            zero_count = result.scalar()
            if zero_count > 0:
                print(f"⚠️  {zero_count} products have base_cost = 0 (prices unchanged)")

            await session.commit()
            print("✅ Migration completed successfully!")
            print("\nAll products now have:")
            print("   - target_margin: 25%")
            print("   - minimum_margin: 15%")
            print("   - selling_price: base_cost × 1.25 (recalculated)")

        except Exception as e:
            await session.rollback()
            print(f"❌ Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate_add_margins())
