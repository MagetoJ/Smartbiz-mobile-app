"""
Migration: Make Categories and Units Global

This migration converts tenant-scoped categories and units to global (system-wide) entities.

Changes:
1. Consolidates duplicate category names across tenants into single global categories
2. Consolidates duplicate unit names across tenants into single global units
3. Updates product references to point to the consolidated categories
4. Removes tenant_id column from categories and units tables
5. Updates unique constraints

This migration is safe to run multiple times (idempotent).
"""

import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


async def check_column_exists(engine: AsyncEngine, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    async with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            return any(row[1] == column_name for row in result)
        else:
            result = await conn.execute(text(f"""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = :table_name AND column_name = :column_name
            """), {"table_name": table_name, "column_name": column_name})
            return result.scalar() is not None


async def migrate_categories_to_global(engine: AsyncEngine):
    """Migrate categories from tenant-scoped to global."""
    if engine.dialect.name == "sqlite":
        return
        
    logger.info("🔄 Migrating categories to global...")

    # Check if tenant_id column still exists
    if not await check_column_exists(engine, "categories", "tenant_id"):
        logger.info("✅ Categories already migrated (no tenant_id column)")
        return

    async with engine.begin() as conn:
        # Step 1: Get all unique category names (case-insensitive)
        # Keep the one with the lowest ID (oldest) for each name
        result = await conn.execute(text("""
            SELECT DISTINCT ON (LOWER(name)) id, name, display_order, icon, color, is_active,
                   target_margin, minimum_margin, created_at, updated_at
            FROM categories
            ORDER BY LOWER(name), created_at ASC
        """))
        unique_categories = result.fetchall()
        logger.info(f"  Found {len(unique_categories)} unique category names")

        # Step 2: Create a mapping of old category IDs to new (keeper) IDs
        # For each unique name, map all IDs with that name to the keeper ID
        for keeper in unique_categories:
            keeper_id = keeper[0]
            keeper_name = keeper[1]

            # Find all duplicate category IDs with the same name (case-insensitive)
            dup_result = await conn.execute(text("""
                SELECT id FROM categories
                WHERE LOWER(name) = LOWER(:name) AND id != :keeper_id
            """), {"name": keeper_name, "keeper_id": keeper_id})
            duplicate_ids = [row[0] for row in dup_result.fetchall()]

            if duplicate_ids:
                logger.info(f"  Category '{keeper_name}': merging IDs {duplicate_ids} -> {keeper_id}")

                # Update products to use the keeper category ID
                for dup_id in duplicate_ids:
                    await conn.execute(text("""
                        UPDATE products SET category_id = :keeper_id WHERE category_id = :dup_id
                    """), {"keeper_id": keeper_id, "dup_id": dup_id})

                # Delete the duplicates
                await conn.execute(text("""
                    DELETE FROM categories WHERE id = ANY(:ids)
                """), {"ids": duplicate_ids})

        # Step 3: Drop old constraints and indexes
        try:
            await conn.execute(text("ALTER TABLE categories DROP CONSTRAINT IF EXISTS uq_tenant_category_name"))
        except Exception as e:
            logger.debug(f"  Could not drop uq_tenant_category_name: {e}")

        try:
            await conn.execute(text("DROP INDEX IF EXISTS idx_categories_tenant_active"))
        except Exception as e:
            logger.debug(f"  Could not drop idx_categories_tenant_active: {e}")

        try:
            await conn.execute(text("DROP INDEX IF EXISTS idx_categories_display_order"))
        except Exception as e:
            logger.debug(f"  Could not drop old idx_categories_display_order: {e}")

        # Step 4: Drop tenant_id foreign key constraint if exists
        try:
            await conn.execute(text("""
                ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_tenant_id_fkey
            """))
        except Exception as e:
            logger.debug(f"  Could not drop categories_tenant_id_fkey: {e}")

        # Step 5: Drop tenant_id column
        try:
            await conn.execute(text("ALTER TABLE categories DROP COLUMN IF EXISTS tenant_id"))
            logger.info("  Dropped tenant_id column from categories")
        except Exception as e:
            logger.warning(f"  Could not drop tenant_id column: {e}")

        # Step 6: Add unique constraint on name (if not exists)
        try:
            await conn.execute(text("""
                ALTER TABLE categories ADD CONSTRAINT uq_categories_name UNIQUE (name)
            """))
            logger.info("  Added unique constraint on category name")
        except Exception as e:
            logger.debug(f"  Unique constraint may already exist: {e}")

        # Step 7: Add new indexes
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (is_active)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories (display_order)"))
        except Exception as e:
            logger.debug(f"  Could not add indexes: {e}")

    logger.info("✅ Categories migration completed")


async def migrate_units_to_global(engine: AsyncEngine):
    """Migrate units from tenant-scoped to global."""
    if engine.dialect.name == "sqlite":
        return
        
    logger.info("🔄 Migrating units to global...")

    # Check if tenant_id column still exists
    if not await check_column_exists(engine, "units", "tenant_id"):
        logger.info("✅ Units already migrated (no tenant_id column)")
        return

    async with engine.begin() as conn:
        # Step 1: Get all unique unit names (case-insensitive)
        result = await conn.execute(text("""
            SELECT DISTINCT ON (LOWER(name)) id, name, display_order, is_active, created_at, updated_at
            FROM units
            ORDER BY LOWER(name), created_at ASC
        """))
        unique_units = result.fetchall()
        logger.info(f"  Found {len(unique_units)} unique unit names")

        # Step 2: Delete duplicates (units are referenced by name, not ID)
        for keeper in unique_units:
            keeper_id = keeper[0]
            keeper_name = keeper[1]

            # Delete duplicates with the same name (case-insensitive)
            result = await conn.execute(text("""
                DELETE FROM units
                WHERE LOWER(name) = LOWER(:name) AND id != :keeper_id
                RETURNING id
            """), {"name": keeper_name, "keeper_id": keeper_id})
            deleted = result.fetchall()
            if deleted:
                logger.info(f"  Unit '{keeper_name}': removed {len(deleted)} duplicates")

        # Step 3: Drop old constraints and indexes
        try:
            await conn.execute(text("ALTER TABLE units DROP CONSTRAINT IF EXISTS uq_tenant_unit_name"))
        except Exception as e:
            logger.debug(f"  Could not drop uq_tenant_unit_name: {e}")

        try:
            await conn.execute(text("DROP INDEX IF EXISTS idx_units_tenant_active"))
        except Exception as e:
            logger.debug(f"  Could not drop idx_units_tenant_active: {e}")

        try:
            await conn.execute(text("DROP INDEX IF EXISTS idx_units_display_order"))
        except Exception as e:
            logger.debug(f"  Could not drop old idx_units_display_order: {e}")

        # Step 4: Drop tenant_id foreign key constraint if exists
        try:
            await conn.execute(text("""
                ALTER TABLE units DROP CONSTRAINT IF EXISTS units_tenant_id_fkey
            """))
        except Exception as e:
            logger.debug(f"  Could not drop units_tenant_id_fkey: {e}")

        # Step 5: Drop tenant_id column
        try:
            await conn.execute(text("ALTER TABLE units DROP COLUMN IF EXISTS tenant_id"))
            logger.info("  Dropped tenant_id column from units")
        except Exception as e:
            logger.warning(f"  Could not drop tenant_id column: {e}")

        # Step 6: Add unique constraint on name (if not exists)
        try:
            await conn.execute(text("""
                ALTER TABLE units ADD CONSTRAINT uq_units_name UNIQUE (name)
            """))
            logger.info("  Added unique constraint on unit name")
        except Exception as e:
            logger.debug(f"  Unique constraint may already exist: {e}")

        # Step 7: Add new indexes
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_units_active ON units (is_active)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_units_display_order ON units (display_order)"))
        except Exception as e:
            logger.debug(f"  Could not add indexes: {e}")

    logger.info("✅ Units migration completed")


async def seed_default_categories(engine: AsyncEngine):
    """Seed default categories if table is empty."""
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM categories"))
        count = result.scalar()

    if count == 0:
        logger.info("📦 Seeding default categories...")
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

        async with engine.begin() as conn:
            for name, display_order, icon, color, is_active, target_margin, minimum_margin in default_categories:
                now_func = "CURRENT_TIMESTAMP" if engine.dialect.name == "sqlite" else "NOW()"
                await conn.execute(text(f"""
                    INSERT INTO categories (name, display_order, icon, color, is_active, target_margin, minimum_margin, created_at, updated_at)
                    VALUES (:name, :display_order, :icon, :color, :is_active, :target_margin, :minimum_margin, {now_func}, {now_func})
                    ON CONFLICT (name) DO NOTHING
                """), {
                    "name": name,
                    "display_order": display_order,
                    "icon": icon,
                    "color": color,
                    "is_active": is_active,
                    "target_margin": target_margin,
                    "minimum_margin": minimum_margin
                })
        logger.info("✅ Default categories seeded")


async def seed_default_units(engine: AsyncEngine):
    """Seed default units if table is empty."""
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT COUNT(*) FROM units"))
        count = result.scalar()

    if count == 0:
        logger.info("📏 Seeding default units...")
        default_units = [
            ("pc", 1, True),       # pieces
            ("kg", 2, True),       # kilograms
            ("g", 3, True),        # grams
            ("l", 4, True),        # liters
            ("ml", 5, True),       # milliliters
            ("hr", 6, True),       # hours
            ("box", 7, True),      # box
            ("pack", 8, True),     # pack
            ("bag", 9, True),      # bag
            ("dozen", 10, True),   # dozen
            ("set", 11, True),     # set
            ("pair", 12, True),    # pair
            ("service", 13, True), # service
            ("session", 14, True), # session
        ]

        async with engine.begin() as conn:
            for name, display_order, is_active in default_units:
                now_func = "CURRENT_TIMESTAMP" if engine.dialect.name == "sqlite" else "NOW()"
                await conn.execute(text(f"""
                    INSERT INTO units (name, display_order, is_active, created_at, updated_at)
                    VALUES (:name, :display_order, :is_active, {now_func}, {now_func})
                    ON CONFLICT (name) DO NOTHING
                """), {
                    "name": name,
                    "display_order": display_order,
                    "is_active": is_active
                })
        logger.info("✅ Default units seeded")


async def run_migration(engine: AsyncEngine):
    """Main migration function."""
    logger.info("=" * 60)
    logger.info("Running: Make Categories and Units Global")
    logger.info("=" * 60)

    await migrate_categories_to_global(engine)
    await migrate_units_to_global(engine)
    await seed_default_categories(engine)
    await seed_default_units(engine)

    logger.info("=" * 60)
    logger.info("Migration completed!")
    logger.info("=" * 60)
