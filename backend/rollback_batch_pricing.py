"""
Rollback Script: Revert Batch-Based FIFO Pricing Migration

This script rolls back the batch pricing migration, restoring the original pricing structure.

CRITICAL WARNINGS:
- Inventory QUANTITIES CANNOT BE RESTORED (data lost forever)
- Only batch metadata and pricing structure are rolled back
- Only viable within 24 hours of migration before new batch data accumulates
- Historical sale costs from new batches will be lost

What This Script Does:
- Restores prices from *_deprecated columns back to original columns
- Drops new columns: batch_id, base_cost from stock_movements and sale_items
- Drops new tables: stock_batches, reorder_calculations
- Removes calculated_reorder_level and related columns from products
- Sets pricing_migrated = FALSE

What This Script CANNOT Do:
- Restore inventory quantities (they remain at 0)
- Restore stock_movements with batch relationships
- Restore sale_items batch tracking

Usage:
    python rollback_batch_pricing.py [--dry-run]

Options:
    --dry-run    Show what would be changed without making changes
"""

import asyncio
import sys
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from database import async_session_maker


async def check_rollback_prerequisites(db: AsyncSession) -> bool:
    """Check if rollback is safe and prerequisites are met"""
    print("Checking rollback prerequisites...")

    # Check if migration was actually run
    result = await db.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name = 'pricing_migrated'
    """))

    if not result.fetchone():
        print("❌ Migration doesn't appear to have been run (pricing_migrated column not found)")
        return False

    print("✓ Migration columns exist")

    # Check if any batches have been created
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'stock_batches'
        )
    """))

    if result.scalar():
        result = await db.execute(text("SELECT COUNT(*) FROM stock_batches"))
        batch_count = result.scalar()

        if batch_count > 0:
            print(f"⚠️  WARNING: {batch_count} stock batches exist!")
            print("   Rolling back will delete these batches and their associated data.")
            response = input("   Are you sure you want to continue? (yes/no): ")
            if response.lower() != 'yes':
                return False

    # Check if deprecated columns have data
    result = await db.execute(text("""
        SELECT COUNT(*) FROM products
        WHERE base_cost_deprecated IS NOT NULL
        OR selling_price_deprecated IS NOT NULL
    """))
    products_with_backup = result.scalar()

    if products_with_backup == 0:
        print("⚠️  WARNING: No products have deprecated pricing data!")
        print("   Rollback may not restore any pricing.")
        response = input("   Continue anyway? (yes/no): ")
        if response.lower() != 'yes':
            return False

    print(f"✓ Found {products_with_backup} products with backup pricing")

    return True


async def get_current_state(db: AsyncSession) -> dict:
    """Get counts of current data for reporting"""
    print("\n📊 Current Database State:")

    # Count products
    result = await db.execute(text("SELECT COUNT(*) FROM products"))
    product_count = result.scalar()
    print(f"   Products: {product_count}")

    # Count migrated products
    result = await db.execute(text("""
        SELECT COUNT(*) FROM products WHERE pricing_migrated = TRUE
    """))
    migrated_count = result.scalar()
    print(f"   Migrated products: {migrated_count}")

    # Count batches
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'stock_batches'
        )
    """))
    if result.scalar():
        result = await db.execute(text("SELECT COUNT(*) FROM stock_batches"))
        batch_count = result.scalar()
        print(f"   Stock batches: {batch_count}")
    else:
        batch_count = 0
        print(f"   Stock batches: 0 (table doesn't exist)")

    # Count reorder calculations
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'reorder_calculations'
        )
    """))
    if result.scalar():
        result = await db.execute(text("SELECT COUNT(*) FROM reorder_calculations"))
        reorder_count = result.scalar()
        print(f"   Reorder calculations: {reorder_count}")
    else:
        reorder_count = 0
        print(f"   Reorder calculations: 0 (table doesn't exist)")

    return {
        'products': product_count,
        'migrated': migrated_count,
        'batches': batch_count,
        'reorder_calcs': reorder_count
    }


async def restore_pricing_data(db: AsyncSession, dry_run: bool = False):
    """Restore prices from deprecated columns"""
    print("\n💰 Restoring Pricing Data...")

    if dry_run:
        print("   [DRY RUN] Would restore base_cost from base_cost_deprecated")
        print("   [DRY RUN] Would restore selling_price from selling_price_deprecated")
        print("   [DRY RUN] Would set pricing_migrated = FALSE")
        print("   [DRY RUN] ⚠️  Quantities remain at 0 (cannot be restored)")
    else:
        # Get count of products to restore
        result = await db.execute(text("""
            SELECT COUNT(*) FROM products
            WHERE base_cost_deprecated IS NOT NULL
            OR selling_price_deprecated IS NOT NULL
        """))
        products_to_restore = result.scalar()

        # Restore pricing from deprecated columns
        await db.execute(text("""
            UPDATE products
            SET
                base_cost = COALESCE(base_cost_deprecated, base_cost),
                selling_price = COALESCE(selling_price_deprecated, selling_price),
                pricing_migrated = FALSE
            WHERE pricing_migrated = TRUE
        """))

        print(f"   ✓ Restored pricing for {products_to_restore} products")
        print(f"   ⚠️  Quantities remain at 0 (cannot be restored)")
        print(f"   ✓ Set pricing_migrated = FALSE")

        await db.commit()


async def remove_batch_columns(db: AsyncSession, dry_run: bool = False):
    """Remove batch-related columns from existing tables"""
    print("\n🔧 Removing Batch Tracking Columns...")

    columns_to_drop = [
        ("products", "base_cost_deprecated"),
        ("products", "selling_price_deprecated"),
        ("products", "pricing_migrated"),
        ("products", "calculated_reorder_level"),
        ("products", "reorder_calculation_date"),
        ("stock_movements", "batch_id"),
        ("stock_movements", "base_cost"),
        ("stock_movements", "selling_price"),
        ("sale_items", "batch_id"),
        ("sale_items", "base_cost"),
    ]

    if dry_run:
        for table, column in columns_to_drop:
            print(f"   [DRY RUN] Would drop column: {table}.{column}")
    else:
        for table, column in columns_to_drop:
            try:
                await db.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))
                print(f"   ✓ Dropped column: {table}.{column}")
            except Exception as e:
                if "does not exist" in str(e).lower():
                    print(f"   ⏭  Column doesn't exist: {table}.{column}")
                else:
                    print(f"   ❌ Error dropping {table}.{column}: {e}")

        await db.commit()


async def drop_new_tables(db: AsyncSession, dry_run: bool = False):
    """Drop tables created by migration"""
    print("\n📦 Dropping New Tables...")

    tables_to_drop = [
        "stock_batches",
        "reorder_calculations"
    ]

    if dry_run:
        for table in tables_to_drop:
            print(f"   [DRY RUN] Would drop table: {table}")
    else:
        for table in tables_to_drop:
            try:
                await db.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
                print(f"   ✓ Dropped table: {table}")
            except Exception as e:
                print(f"   ❌ Error dropping {table}: {e}")

        await db.commit()


async def verify_rollback(db: AsyncSession) -> bool:
    """Verify rollback completed successfully"""
    print("\n✅ Verifying Rollback...")

    checks = []

    # Check stock_batches table is gone
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'stock_batches'
        )
    """))
    checks.append(("stock_batches table removed", not result.scalar()))

    # Check reorder_calculations table is gone
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'reorder_calculations'
        )
    """))
    checks.append(("reorder_calculations table removed", not result.scalar()))

    # Check pricing_migrated column is gone
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'pricing_migrated'
        )
    """))
    checks.append(("pricing_migrated column removed", not result.scalar()))

    # Check base_cost_deprecated is gone
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'base_cost_deprecated'
        )
    """))
    checks.append(("deprecated columns removed", not result.scalar()))

    # Check products have pricing restored
    result = await db.execute(text("""
        SELECT COUNT(*) FROM products
        WHERE (base_cost IS NOT NULL AND base_cost > 0)
        OR (selling_price IS NOT NULL AND selling_price > 0)
    """))
    products_with_pricing = result.scalar()
    checks.append(("products have pricing", products_with_pricing > 0))

    # Print results
    all_passed = True
    for check_name, passed in checks:
        status = "✓" if passed else "❌"
        print(f"   {status} {check_name}")
        if not passed:
            all_passed = False

    return all_passed


async def run_rollback(dry_run: bool = False):
    """Main rollback function"""
    print("=" * 70)
    print("BATCH PRICING ROLLBACK")
    print("=" * 70)

    if dry_run:
        print("\n🔍 DRY RUN MODE - No changes will be made\n")
    else:
        print("\n⚠️  LIVE MODE - Database will be modified\n")
        print("CRITICAL WARNINGS:")
        print("- Inventory quantities CANNOT be restored (remain at 0)")
        print("- All stock batches will be deleted")
        print("- All reorder calculations will be deleted")
        print("- Pricing will be restored from deprecated columns")
        print("")
        response = input("Type 'ROLLBACK NOW' to proceed: ")
        if response != "ROLLBACK NOW":
            print("Rollback cancelled.")
            return False

    async with async_session_maker() as db:
        try:
            # Check prerequisites
            if not await check_rollback_prerequisites(db):
                print("\n❌ Prerequisites not met. Aborting.")
                return False

            # Get current state
            current_state = await get_current_state(db)

            # Run rollback steps
            await restore_pricing_data(db, dry_run)
            await remove_batch_columns(db, dry_run)
            await drop_new_tables(db, dry_run)

            if not dry_run:
                # Verify rollback
                if await verify_rollback(db):
                    print("\n" + "=" * 70)
                    print("✅ ROLLBACK COMPLETED SUCCESSFULLY!")
                    print("=" * 70)
                    print("\n📋 WHAT WAS REVERTED:")
                    print(f"   ✓ Deleted {current_state['batches']} stock batches")
                    print(f"   ✓ Deleted {current_state['reorder_calcs']} reorder calculations")
                    print(f"   ✓ Restored pricing for {current_state['migrated']} products")
                    print(f"   ✓ Removed batch tracking columns")
                    print(f"   ✓ Removed new tables")
                    print("\n⚠️  IMPORTANT:")
                    print("   - Inventory quantities remain at 0 (cannot be restored)")
                    print("   - You must manually re-enter quantities using old workflow")
                    print("   - Historical batch data has been lost")
                    print("")
                    return True
                else:
                    print("\n❌ Rollback verification failed!")
                    return False
            else:
                print("\n✅ DRY RUN COMPLETED - No changes made")
                print("   Run without --dry-run to apply rollback")
                return True

        except Exception as e:
            print(f"\n❌ Rollback failed with error: {e}")
            if not dry_run:
                await db.rollback()
                print("   Changes rolled back")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    success = asyncio.run(run_rollback(dry_run))
    sys.exit(0 if success else 1)
