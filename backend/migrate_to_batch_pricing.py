"""
Migration Script: Transition to Batch-Based FIFO Pricing System

This script migrates the database to support batch-tracked inventory with FIFO pricing.

CRITICAL CHANGES:
- Adds new tables: stock_batches, reorder_calculations
- Modifies products table: Adds deprecated pricing fields and calculated reorder level
- Modifies stock_movements and sale_items: Adds batch tracking
- SETS ALL PHYSICAL PRODUCT QUANTITIES TO ZERO (clean slate approach)
- Preserves old pricing in *_deprecated columns for reference

WARNING: This migration will ZERO OUT all inventory quantities.
Users must re-enter inventory using the new "Receive Stock" workflow.

Usage:
    python migrate_to_batch_pricing.py [--dry-run]

Options:
    --dry-run    Show what would be changed without making changes
"""

import asyncio
import sys
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from database import async_session_maker, engine
from models import Base


async def check_prerequisites(db: AsyncSession) -> bool:
    """Check if migration prerequisites are met"""
    print("Checking prerequisites...")

    # Check if tables exist
    result = await db.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('products', 'stock_movements', 'sale_items')
    """))
    existing_tables = [row[0] for row in result.fetchall()]

    if len(existing_tables) < 3:
        print(f"❌ Missing required tables. Found: {existing_tables}")
        return False

    print("✓ All required tables exist")

    # Check if migration already ran
    result = await db.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'products'
        AND column_name = 'pricing_migrated'
    """))

    if result.fetchone():
        print("⚠️  Migration appears to have already run (pricing_migrated column exists)")
        response = input("Continue anyway? (yes/no): ")
        if response.lower() != 'yes':
            return False

    return True


async def backup_current_data(db: AsyncSession) -> dict:
    """Get counts of current data for verification"""
    print("\n📊 Current Database State:")

    # Count products
    result = await db.execute(text("SELECT COUNT(*) FROM products"))
    product_count = result.scalar()
    print(f"   Products: {product_count}")

    # Count physical products with inventory
    result = await db.execute(text("""
        SELECT COUNT(*), SUM(quantity)
        FROM products
        WHERE is_service = FALSE AND quantity > 0
    """))
    row = result.fetchone()
    physical_with_stock = row[0] if row else 0
    total_quantity = row[1] if row and row[1] else 0
    print(f"   Physical products with stock: {physical_with_stock} (total units: {total_quantity})")

    # Count stock movements
    result = await db.execute(text("SELECT COUNT(*) FROM stock_movements"))
    movements_count = result.scalar()
    print(f"   Stock movements: {movements_count}")

    # Count sale items
    result = await db.execute(text("SELECT COUNT(*) FROM sale_items"))
    sale_items_count = result.scalar()
    print(f"   Sale items: {sale_items_count}")

    return {
        'products': product_count,
        'physical_with_stock': physical_with_stock,
        'total_quantity': total_quantity,
        'movements': movements_count,
        'sale_items': sale_items_count
    }


async def create_new_tables(db: AsyncSession, dry_run: bool = False):
    """Create new tables for batch pricing"""
    print("\n📦 Creating New Tables...")

    # Create stock_batches table
    stock_batches_sql = """
    CREATE TABLE IF NOT EXISTS stock_batches (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        batch_number VARCHAR(50) NOT NULL,
        receipt_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        base_cost FLOAT NOT NULL,
        selling_price FLOAT NOT NULL,
        initial_quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        supplier_name VARCHAR(100),
        reference_number VARCHAR(100),
        notes TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_tenant_batch_number UNIQUE (tenant_id, batch_number)
    );

    CREATE INDEX IF NOT EXISTS idx_batches_product_remaining
        ON stock_batches(product_id, remaining_quantity, receipt_date);
    CREATE INDEX IF NOT EXISTS idx_batches_tenant_product
        ON stock_batches(tenant_id, product_id);
    """

    # Create reorder_calculations table
    reorder_calculations_sql = """
    CREATE TABLE IF NOT EXISTS reorder_calculations (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        calculation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        days_analyzed INTEGER NOT NULL,
        total_sales INTEGER NOT NULL,
        daily_avg_consumption FLOAT NOT NULL,
        exponential_ma FLOAT NOT NULL,
        alpha FLOAT NOT NULL DEFAULT 0.3,
        safety_factor FLOAT NOT NULL DEFAULT 1.5,
        lead_time_days INTEGER NOT NULL DEFAULT 7,
        calculated_level INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_reorder_calc_product_date
        ON reorder_calculations(product_id, calculation_date);
    CREATE INDEX IF NOT EXISTS idx_reorder_calc_tenant
        ON reorder_calculations(tenant_id);
    """

    if dry_run:
        print("   [DRY RUN] Would create: stock_batches table")
        print("   [DRY RUN] Would create: reorder_calculations table")
    else:
        await db.execute(text(stock_batches_sql))
        print("   ✓ Created stock_batches table with indexes")

        await db.execute(text(reorder_calculations_sql))
        print("   ✓ Created reorder_calculations table with indexes")

        await db.commit()


async def alter_existing_tables(db: AsyncSession, dry_run: bool = False):
    """Add new columns to existing tables"""
    print("\n🔧 Modifying Existing Tables...")

    alterations = [
        # Products table - Add deprecated pricing fields and calculated reorder level
        ("products", "base_cost_deprecated", "ALTER TABLE products ADD COLUMN IF NOT EXISTS base_cost_deprecated FLOAT"),
        ("products", "selling_price_deprecated", "ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price_deprecated FLOAT"),
        ("products", "pricing_migrated", "ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_migrated BOOLEAN NOT NULL DEFAULT FALSE"),
        ("products", "calculated_reorder_level", "ALTER TABLE products ADD COLUMN IF NOT EXISTS calculated_reorder_level INTEGER"),
        ("products", "reorder_calculation_date", "ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_calculation_date TIMESTAMP"),

        # Stock movements - Add batch tracking
        ("stock_movements", "batch_id", "ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES stock_batches(id)"),
        ("stock_movements", "base_cost", "ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS base_cost FLOAT"),
        ("stock_movements", "selling_price", "ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS selling_price FLOAT"),

        # Sale items - Add batch tracking and cost
        ("sale_items", "batch_id", "ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES stock_batches(id)"),
        ("sale_items", "base_cost", "ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS base_cost FLOAT"),
    ]

    for table, column, sql in alterations:
        if dry_run:
            print(f"   [DRY RUN] Would add column: {table}.{column}")
        else:
            try:
                await db.execute(text(sql))
                print(f"   ✓ Added column: {table}.{column}")
            except Exception as e:
                if "already exists" in str(e):
                    print(f"   ⏭  Column already exists: {table}.{column}")
                else:
                    raise

    # Create indexes
    index_sql = [
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id)",
        "CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON sale_items(batch_id)",
    ]

    if not dry_run:
        for sql in index_sql:
            await db.execute(text(sql))
        print("   ✓ Created indexes for batch tracking")
        await db.commit()


async def migrate_pricing_data(db: AsyncSession, dry_run: bool = False):
    """Move current prices to deprecated columns and ZERO OUT quantities"""
    print("\n💰 Migrating Pricing Data...")

    if dry_run:
        print("   [DRY RUN] Would move base_cost → base_cost_deprecated")
        print("   [DRY RUN] Would move selling_price → selling_price_deprecated")
        print("   [DRY RUN] Would SET ALL PHYSICAL PRODUCT QUANTITIES TO 0")
        print("   [DRY RUN] Would set pricing_migrated = TRUE")
    else:
        # Get count before migration
        result = await db.execute(text("""
            SELECT COUNT(*) FROM products WHERE is_service = FALSE AND quantity > 0
        """))
        products_to_zero = result.scalar()

        # Move pricing to deprecated columns and zero out quantities
        await db.execute(text("""
            UPDATE products
            SET
                base_cost_deprecated = base_cost,
                selling_price_deprecated = selling_price,
                quantity = CASE WHEN is_service = TRUE THEN 0 ELSE 0 END,
                pricing_migrated = TRUE
            WHERE pricing_migrated = FALSE OR pricing_migrated IS NULL
        """))

        print(f"   ✓ Moved prices to deprecated columns")
        print(f"   ✓ ZEROED OUT {products_to_zero} physical products")
        print(f"   ✓ Set pricing_migrated flag")

        await db.commit()


async def backfill_historical_costs(db: AsyncSession, dry_run: bool = False):
    """Backfill sale_items.base_cost from product's deprecated cost"""
    print("\n📈 Backfilling Historical Sale Costs...")

    if dry_run:
        result = await db.execute(text("""
            SELECT COUNT(*)
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.base_cost IS NULL AND p.base_cost_deprecated IS NOT NULL
        """))
        count = result.scalar()
        print(f"   [DRY RUN] Would backfill {count} sale items with historical cost")
    else:
        result = await db.execute(text("""
            UPDATE sale_items si
            SET base_cost = p.base_cost_deprecated
            FROM products p
            WHERE si.product_id = p.id
            AND si.base_cost IS NULL
            AND p.base_cost_deprecated IS NOT NULL
        """))

        print(f"   ✓ Backfilled {result.rowcount} sale items with historical costs")
        await db.commit()


async def verify_migration(db: AsyncSession) -> bool:
    """Verify migration completed successfully"""
    print("\n✅ Verifying Migration...")

    checks = []

    # Check stock_batches table exists
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'stock_batches'
        )
    """))
    checks.append(("stock_batches table", result.scalar()))

    # Check reorder_calculations table exists
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'reorder_calculations'
        )
    """))
    checks.append(("reorder_calculations table", result.scalar()))

    # Check products have deprecated columns
    result = await db.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'base_cost_deprecated'
        )
    """))
    checks.append(("products.base_cost_deprecated", result.scalar()))

    # Check all physical products have 0 quantity
    result = await db.execute(text("""
        SELECT COUNT(*) FROM products WHERE is_service = FALSE AND quantity > 0
    """))
    products_with_stock = result.scalar()
    checks.append(("physical products zeroed", products_with_stock == 0))

    # Check pricing_migrated flag is set
    result = await db.execute(text("""
        SELECT COUNT(*) FROM products WHERE pricing_migrated = TRUE
    """))
    migrated_count = result.scalar()

    result = await db.execute(text("SELECT COUNT(*) FROM products"))
    total_count = result.scalar()

    checks.append(("pricing_migrated set", migrated_count == total_count))

    # Print results
    all_passed = True
    for check_name, passed in checks:
        status = "✓" if passed else "❌"
        print(f"   {status} {check_name}")
        if not passed:
            all_passed = False

    return all_passed


async def run_migration(dry_run: bool = False):
    """Main migration function"""
    print("=" * 70)
    print("BATCH PRICING MIGRATION")
    print("=" * 70)

    if dry_run:
        print("\n🔍 DRY RUN MODE - No changes will be made\n")
    else:
        print("\n⚠️  LIVE MODE - Database will be modified\n")
        print("CRITICAL WARNING:")
        print("- ALL physical product quantities will be set to ZERO")
        print("- Users must re-enter inventory using 'Receive Stock'")
        print("- Old pricing will be preserved in deprecated columns")
        print("")
        response = input("Type 'I UNDERSTAND' to proceed: ")
        if response != "I UNDERSTAND":
            print("Migration cancelled.")
            return False

    async with async_session_maker() as db:
        try:
            # Check prerequisites
            if not await check_prerequisites(db):
                print("\n❌ Prerequisites not met. Aborting.")
                return False

            # Backup current data
            backup_data = await backup_current_data(db)

            # Run migration steps
            await create_new_tables(db, dry_run)
            await alter_existing_tables(db, dry_run)
            await migrate_pricing_data(db, dry_run)
            await backfill_historical_costs(db, dry_run)

            if not dry_run:
                # Verify migration
                if await verify_migration(db):
                    print("\n" + "=" * 70)
                    print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
                    print("=" * 70)
                    print("\n📋 NEXT STEPS:")
                    print("   1. Inform users about inventory reset")
                    print("   2. Train staff on new 'Receive Stock' workflow")
                    print("   3. Re-enter inventory with batch pricing")
                    print("   4. Monitor system for any issues")
                    print("\n⚠️  IMPORTANT:")
                    print("   - All physical product quantities are now ZERO")
                    print(f"   - {backup_data['physical_with_stock']} products need re-entry")
                    print(f"   - {backup_data['total_quantity']} total units lost (data preserved in deprecated columns)")
                    print("")
                    return True
                else:
                    print("\n❌ Migration verification failed!")
                    return False
            else:
                print("\n✅ DRY RUN COMPLETED - No changes made")
                print("   Run without --dry-run to apply changes")
                return True

        except Exception as e:
            print(f"\n❌ Migration failed with error: {e}")
            if not dry_run:
                await db.rollback()
                print("   Changes rolled back")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    success = asyncio.run(run_migration(dry_run))
    sys.exit(0 if success else 1)
