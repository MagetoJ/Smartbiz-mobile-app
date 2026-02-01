"""
Database Migration: Product Price Refactoring

This migration implements the following changes:
1. Make base_cost and selling_price nullable in products table
2. Add lead_time_days field for reorder level calculations
3. Create price_history table for tracking all pricing changes
4. Backfill price_history with existing product prices
5. Add pricing fields to stock_movements table

Run this script ONCE to upgrade the database schema.
"""

import asyncio
from sqlalchemy import text
from database import engine, async_session_maker
from datetime import datetime


async def run_migration():
    """Execute all migration steps in order"""

    print("=" * 80)
    print("Starting Price Refactoring Migration")
    print("=" * 80)

    async with async_session_maker() as session:
        try:
            # Step 1: Make base_cost and selling_price nullable in products
            print("\n[1/6] Making product pricing fields nullable...")
            await session.execute(text("""
                ALTER TABLE products
                ALTER COLUMN base_cost DROP NOT NULL;
            """))
            await session.execute(text("""
                ALTER TABLE products
                ALTER COLUMN selling_price DROP NOT NULL;
            """))
            print("✅ Product pricing fields are now nullable")

            # Step 2: Add lead_time_days to products table
            print("\n[2/6] Adding lead_time_days field to products...")
            await session.execute(text("""
                ALTER TABLE products
                ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7;
            """))
            print("✅ Added lead_time_days field (default: 7 days)")

            # Step 3: Create price_history table
            print("\n[3/6] Creating price_history table...")
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS price_history (
                    id SERIAL PRIMARY KEY,
                    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    base_cost FLOAT NOT NULL,
                    selling_price FLOAT NOT NULL,
                    source VARCHAR(20) NOT NULL CHECK (source IN ('receipt', 'adjustment', 'manual_update', 'migration')),
                    reference VARCHAR(255),
                    notes TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                );
            """))

            # Add indexes for performance
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_price_history_product
                ON price_history(product_id);
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_price_history_created
                ON price_history(product_id, created_at DESC);
            """))
            print("✅ Created price_history table with indexes")

            # Step 4: Backfill price_history from existing products
            print("\n[4/6] Backfilling price history from existing products...")
            result = await session.execute(text("""
                INSERT INTO price_history (product_id, user_id, base_cost, selling_price, source, notes, created_at)
                SELECT
                    id,
                    NULL,
                    base_cost,
                    selling_price,
                    'migration',
                    'Initial pricing migrated from product table',
                    created_at
                FROM products
                WHERE base_cost IS NOT NULL AND selling_price IS NOT NULL
                RETURNING id;
            """))
            migrated_count = len(result.fetchall())
            print(f"✅ Migrated {migrated_count} existing product prices to history")

            # Step 5: Add pricing fields to stock_movements
            print("\n[5/6] Adding pricing fields to stock_movements...")
            await session.execute(text("""
                ALTER TABLE stock_movements
                ADD COLUMN IF NOT EXISTS base_cost FLOAT,
                ADD COLUMN IF NOT EXISTS selling_price FLOAT,
                ADD COLUMN IF NOT EXISTS supplier VARCHAR(255),
                ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
            """))
            print("✅ Added pricing tracking fields to stock_movements")

            # Step 6: Commit all changes
            print("\n[6/6] Committing migration...")
            await session.commit()
            print("✅ All changes committed successfully")

            # Success summary
            print("\n" + "=" * 80)
            print("MIGRATION COMPLETED SUCCESSFULLY!")
            print("=" * 80)
            print(f"✅ Products can now be created without pricing")
            print(f"✅ {migrated_count} product prices backed up to history")
            print(f"✅ Price history tracking is now active")
            print(f"✅ Stock movements now track pricing changes")
            print(f"✅ Reorder level auto-calculation ready (lead_time_days added)")
            print("=" * 80)

        except Exception as e:
            print(f"\n❌ Migration failed: {str(e)}")
            await session.rollback()
            raise


async def verify_migration():
    """Verify that migration was successful"""
    print("\nVerifying migration...")

    async with async_session_maker() as session:
        # Check if columns exist
        result = await session.execute(text("""
            SELECT
                column_name,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'products'
            AND column_name IN ('base_cost', 'selling_price', 'lead_time_days')
            ORDER BY column_name;
        """))

        print("\nProduct table columns:")
        for row in result:
            print(f"  - {row[0]}: nullable={row[1]}, default={row[2]}")

        # Check price_history table
        result = await session.execute(text("""
            SELECT COUNT(*) as count FROM price_history;
        """))
        count = result.scalar()
        print(f"\nPrice history records: {count}")

        # Check stock_movements columns
        result = await session.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'stock_movements'
            AND column_name IN ('base_cost', 'selling_price', 'supplier', 'reference');
        """))

        sm_columns = [row[0] for row in result]
        print(f"\nStock movements new columns: {', '.join(sm_columns)}")

        print("\n✅ Migration verification complete!")


if __name__ == "__main__":
    print("Database Migration Script - Price Refactoring")
    print("This will modify your database schema. Make sure you have a backup!")
    print("\nPress Enter to continue, or Ctrl+C to cancel...")
    try:
        input()
    except KeyboardInterrupt:
        print("\n\n❌ Migration cancelled by user")
        exit(0)

    # Run migration
    asyncio.run(run_migration())

    # Verify migration
    asyncio.run(verify_migration())
