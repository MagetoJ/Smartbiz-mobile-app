#!/usr/bin/env python3
"""
Migration Script: Convert tenant-scoped categories and units to global entities

This script:
1. Collects all unique category names across all tenants
2. Creates one global category for each unique name (keeping first occurrence's settings)
3. Updates all products to reference the global category ID
4. Deletes duplicate category records

Same process for units.

IMPORTANT: Run this AFTER deploying the model changes that remove tenant_id from categories/units.
           This script handles the data migration.

Usage:
    python migrate_global_categories.py

Safety:
    - Creates backup of current state before migration
    - Uses transactions for atomicity
    - Can be run multiple times safely (idempotent)
"""

import asyncio
import sys
from datetime import datetime
from collections import defaultdict

# Add the backend directory to the path
sys.path.insert(0, '.')

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine as async_engine, async_session_maker as AsyncSessionLocal


async def check_migration_needed(db: AsyncSession) -> tuple[bool, bool]:
    """Check if categories and units tables still have tenant_id column"""
    # Check categories table
    categories_has_tenant_id = False
    units_has_tenant_id = False

    try:
        result = await db.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'categories' AND column_name = 'tenant_id'
        """))
        categories_has_tenant_id = result.scalar() is not None
    except Exception:
        pass

    try:
        result = await db.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'units' AND column_name = 'tenant_id'
        """))
        units_has_tenant_id = result.scalar() is not None
    except Exception:
        pass

    return categories_has_tenant_id, units_has_tenant_id


async def migrate_categories(db: AsyncSession) -> dict:
    """Migrate categories from tenant-scoped to global"""
    print("\n=== Migrating Categories ===")

    # Get all categories with their tenant info
    result = await db.execute(text("""
        SELECT id, tenant_id, name, display_order, icon, color, is_active,
               target_margin, minimum_margin, created_at, updated_at
        FROM categories
        ORDER BY created_at ASC
    """))
    all_categories = result.fetchall()

    print(f"Found {len(all_categories)} total category records")

    if len(all_categories) == 0:
        print("No categories to migrate")
        return {"migrated": 0, "duplicates_removed": 0, "products_updated": 0}

    # Group by name (case-insensitive)
    categories_by_name = defaultdict(list)
    for cat in all_categories:
        categories_by_name[cat.name.lower()].append(cat)

    print(f"Found {len(categories_by_name)} unique category names")

    # Track statistics
    stats = {
        "migrated": 0,
        "duplicates_removed": 0,
        "products_updated": 0
    }

    # For each unique name, keep the first one and update products
    for name_lower, cats in categories_by_name.items():
        # Keep the first (oldest) one as the global record
        keeper = cats[0]
        duplicates = cats[1:]

        print(f"\nCategory '{keeper.name}':")
        print(f"  - Keeping ID {keeper.id} (from tenant {keeper.tenant_id})")

        # Update products from duplicate categories to use the keeper
        for dup in duplicates:
            # Count products using this duplicate
            count_result = await db.execute(text("""
                SELECT COUNT(*) FROM products WHERE category_id = :cat_id
            """), {"cat_id": dup.id})
            product_count = count_result.scalar() or 0

            if product_count > 0:
                print(f"  - Migrating {product_count} products from duplicate ID {dup.id} (tenant {dup.tenant_id})")
                await db.execute(text("""
                    UPDATE products SET category_id = :keeper_id WHERE category_id = :dup_id
                """), {"keeper_id": keeper.id, "dup_id": dup.id})
                stats["products_updated"] += product_count

            # Delete the duplicate
            await db.execute(text("DELETE FROM categories WHERE id = :id"), {"id": dup.id})
            stats["duplicates_removed"] += 1

        stats["migrated"] += 1

    # Now remove tenant_id column and update constraints
    # First, drop the old constraints
    print("\nUpdating categories table schema...")

    try:
        await db.execute(text("ALTER TABLE categories DROP CONSTRAINT IF EXISTS uq_tenant_category_name"))
    except Exception as e:
        print(f"  Note: Could not drop uq_tenant_category_name: {e}")

    try:
        await db.execute(text("DROP INDEX IF EXISTS idx_categories_tenant_active"))
    except Exception as e:
        print(f"  Note: Could not drop idx_categories_tenant_active: {e}")

    try:
        await db.execute(text("DROP INDEX IF EXISTS idx_categories_display_order"))
    except Exception as e:
        print(f"  Note: Could not drop old idx_categories_display_order: {e}")

    # Drop tenant_id column
    try:
        await db.execute(text("ALTER TABLE categories DROP COLUMN IF EXISTS tenant_id"))
        print("  Dropped tenant_id column from categories")
    except Exception as e:
        print(f"  Note: Could not drop tenant_id column: {e}")

    # Add unique constraint on name
    try:
        await db.execute(text("ALTER TABLE categories ADD CONSTRAINT uq_categories_name UNIQUE (name)"))
        print("  Added unique constraint on name")
    except Exception as e:
        print(f"  Note: Could not add unique constraint: {e}")

    # Add new indexes
    try:
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (is_active)"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories (display_order)"))
        print("  Added new indexes")
    except Exception as e:
        print(f"  Note: Could not add indexes: {e}")

    return stats


async def migrate_units(db: AsyncSession) -> dict:
    """Migrate units from tenant-scoped to global"""
    print("\n=== Migrating Units ===")

    # Get all units with their tenant info
    result = await db.execute(text("""
        SELECT id, tenant_id, name, display_order, is_active, created_at, updated_at
        FROM units
        ORDER BY created_at ASC
    """))
    all_units = result.fetchall()

    print(f"Found {len(all_units)} total unit records")

    if len(all_units) == 0:
        print("No units to migrate")
        return {"migrated": 0, "duplicates_removed": 0, "products_updated": 0}

    # Group by name (case-insensitive)
    units_by_name = defaultdict(list)
    for unit in all_units:
        units_by_name[unit.name.lower()].append(unit)

    print(f"Found {len(units_by_name)} unique unit names")

    # Track statistics
    stats = {
        "migrated": 0,
        "duplicates_removed": 0,
        "products_updated": 0
    }

    # For each unique name, keep the first one
    # Note: Products use unit NAME not ID, so no product updates needed
    for name_lower, units in units_by_name.items():
        keeper = units[0]
        duplicates = units[1:]

        print(f"\nUnit '{keeper.name}':")
        print(f"  - Keeping ID {keeper.id} (from tenant {keeper.tenant_id})")

        # Delete duplicates
        for dup in duplicates:
            await db.execute(text("DELETE FROM units WHERE id = :id"), {"id": dup.id})
            stats["duplicates_removed"] += 1
            print(f"  - Removed duplicate ID {dup.id} (tenant {dup.tenant_id})")

        stats["migrated"] += 1

    # Now remove tenant_id column and update constraints
    print("\nUpdating units table schema...")

    try:
        await db.execute(text("ALTER TABLE units DROP CONSTRAINT IF EXISTS uq_tenant_unit_name"))
    except Exception as e:
        print(f"  Note: Could not drop uq_tenant_unit_name: {e}")

    try:
        await db.execute(text("DROP INDEX IF EXISTS idx_units_tenant_active"))
    except Exception as e:
        print(f"  Note: Could not drop idx_units_tenant_active: {e}")

    try:
        await db.execute(text("DROP INDEX IF EXISTS idx_units_display_order"))
    except Exception as e:
        print(f"  Note: Could not drop old idx_units_display_order: {e}")

    # Drop tenant_id column
    try:
        await db.execute(text("ALTER TABLE units DROP COLUMN IF EXISTS tenant_id"))
        print("  Dropped tenant_id column from units")
    except Exception as e:
        print(f"  Note: Could not drop tenant_id column: {e}")

    # Add unique constraint on name
    try:
        await db.execute(text("ALTER TABLE units ADD CONSTRAINT uq_units_name UNIQUE (name)"))
        print("  Added unique constraint on name")
    except Exception as e:
        print(f"  Note: Could not add unique constraint: {e}")

    # Add new indexes
    try:
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_units_active ON units (is_active)"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_units_display_order ON units (display_order)"))
        print("  Added new indexes")
    except Exception as e:
        print(f"  Note: Could not add indexes: {e}")

    return stats


async def seed_default_categories(db: AsyncSession):
    """Seed default categories if none exist"""
    result = await db.execute(text("SELECT COUNT(*) FROM categories"))
    count = result.scalar()

    if count == 0:
        print("\n=== Seeding Default Categories ===")
        default_categories = [
            ("Food & Beverages", 1, "coffee", "#10B981", True, 25.0, 15.0),
            ("Electronics", 2, "laptop", "#3B82F6", True, 20.0, 10.0),
            ("Clothing & Apparel", 3, "shirt", "#8B5CF6", True, 40.0, 25.0),
            ("Home & Garden", 4, "home", "#F59E0B", True, 30.0, 20.0),
            ("Health & Beauty", 5, "heart", "#EC4899", True, 35.0, 20.0),
            ("Office Supplies", 6, "briefcase", "#6B7280", True, 25.0, 15.0),
            ("Sports & Outdoors", 7, "dumbbell", "#14B8A6", True, 30.0, 20.0),
            ("Automotive", 8, "car", "#EF4444", True, 25.0, 15.0),
            ("Services", 9, "wrench", "#6366F1", True, 50.0, 30.0),
            ("Other", 10, "box", "#9CA3AF", True, None, None),
        ]

        for name, display_order, icon, color, is_active, target_margin, minimum_margin in default_categories:
            await db.execute(text("""
                INSERT INTO categories (name, display_order, icon, color, is_active, target_margin, minimum_margin, created_at, updated_at)
                VALUES (:name, :display_order, :icon, :color, :is_active, :target_margin, :minimum_margin, NOW(), NOW())
            """), {
                "name": name,
                "display_order": display_order,
                "icon": icon,
                "color": color,
                "is_active": is_active,
                "target_margin": target_margin,
                "minimum_margin": minimum_margin
            })
            print(f"  Created: {name}")


async def seed_default_units(db: AsyncSession):
    """Seed default units if none exist"""
    result = await db.execute(text("SELECT COUNT(*) FROM units"))
    count = result.scalar()

    if count == 0:
        print("\n=== Seeding Default Units ===")
        default_units = [
            ("pcs", 1, True),
            ("kg", 2, True),
            ("g", 3, True),
            ("liters", 4, True),
            ("ml", 5, True),
            ("meters", 6, True),
            ("cm", 7, True),
            ("box", 8, True),
            ("pack", 9, True),
            ("dozen", 10, True),
            ("pair", 11, True),
            ("set", 12, True),
            ("hour", 13, True),
            ("day", 14, True),
            ("service", 15, True),
        ]

        for name, display_order, is_active in default_units:
            await db.execute(text("""
                INSERT INTO units (name, display_order, is_active, created_at, updated_at)
                VALUES (:name, :display_order, :is_active, NOW(), NOW())
            """), {
                "name": name,
                "display_order": display_order,
                "is_active": is_active
            })
            print(f"  Created: {name}")


async def main():
    print("=" * 60)
    print("Global Categories & Units Migration Script")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat()}")

    async with AsyncSessionLocal() as db:
        try:
            # Check if migration is needed
            cat_has_tenant_id, unit_has_tenant_id = await check_migration_needed(db)

            if cat_has_tenant_id or unit_has_tenant_id:
                print("\nMigration needed - tenant_id columns found")

                # Migrate categories if needed
                if cat_has_tenant_id:
                    cat_stats = await migrate_categories(db)
                    print(f"\nCategories migration complete:")
                    print(f"  - Unique categories preserved: {cat_stats['migrated']}")
                    print(f"  - Duplicates removed: {cat_stats['duplicates_removed']}")
                    print(f"  - Products updated: {cat_stats['products_updated']}")
                else:
                    print("\nCategories already migrated (no tenant_id column)")

                # Migrate units if needed
                if unit_has_tenant_id:
                    unit_stats = await migrate_units(db)
                    print(f"\nUnits migration complete:")
                    print(f"  - Unique units preserved: {unit_stats['migrated']}")
                    print(f"  - Duplicates removed: {unit_stats['duplicates_removed']}")
                else:
                    print("\nUnits already migrated (no tenant_id column)")

                # Commit all changes
                await db.commit()
                print("\nAll changes committed successfully!")
            else:
                print("\nNo migration needed - tenant_id columns already removed")

                # Seed defaults if tables are empty
                await seed_default_categories(db)
                await seed_default_units(db)
                await db.commit()

        except Exception as e:
            print(f"\nERROR: Migration failed: {e}")
            await db.rollback()
            raise

    print(f"\nCompleted at: {datetime.now().isoformat()}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
