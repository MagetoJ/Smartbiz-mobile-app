"""
Auto-migration system for schema changes.

This module automatically detects and applies schema changes when the app starts.
It ensures that all tables and columns defined in models exist in the database.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports when running standalone
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import AsyncEngine
from database import engine, Base
from models import (
    Tenant, User, Category, Unit, Product, Sale, SaleItem,
    StockMovement, Organization, OrganizationCategory,
    OrganizationProduct, BranchStock, tenant_users, organization_users
)

logger = logging.getLogger(__name__)


async def get_table_columns(engine: AsyncEngine, table_name: str) -> set:
    """Get all column names for a table from the database."""
    async with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            return {row[1] for row in result}
        else:
            result = await conn.execute(text(f"""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = '{table_name}'
            """))
            return {row[0] for row in result}


async def add_missing_columns(engine: AsyncEngine):
    """
    Check all SQLAlchemy models and add any missing columns to the database.
    This is safe to run multiple times.
    """
    if engine.dialect.name == "sqlite":
        logger.info("ℹ️ Skipping complex column detection for SQLite. create_all will handle table creation.")
        return

    logger.info("🔍 Checking for missing database columns...")

    # Get all table objects from metadata
    tables_to_check = Base.metadata.tables

    changes_made = False

    for table_name, table in tables_to_check.items():
        # Get columns that exist in the database
        try:
            db_columns = await get_table_columns(engine, table_name)
        except Exception as e:
            # Table doesn't exist yet, skip (create_all will handle it)
            logger.debug(f"Table {table_name} doesn't exist yet, will be created by create_all")
            continue

        # Get columns defined in the model
        model_columns = {col.name for col in table.columns}

        # Find missing columns
        missing_columns = model_columns - db_columns

        if missing_columns:
            logger.info(f"📝 Table '{table_name}' is missing columns: {missing_columns}")

            async with engine.begin() as conn:
                for col_name in missing_columns:
                    col = table.columns[col_name]

                    # Build ALTER TABLE statement
                    col_type = col.type.compile(engine.dialect)
                    nullable = "NULL" if col.nullable else "NOT NULL"

                    # Handle default values
                    default_clause = ""
                    if col.default is not None:
                        if hasattr(col.default, 'arg'):
                            if callable(col.default.arg):
                                # For functions like datetime.utcnow, don't set default in migration
                                default_clause = ""
                            else:
                                default_value = col.default.arg
                                if isinstance(default_value, str):
                                    default_clause = f"DEFAULT '{default_value}'"
                                elif isinstance(default_value, bool):
                                    default_clause = f"DEFAULT {default_value}"
                                elif isinstance(default_value, (int, float)):
                                    default_clause = f"DEFAULT {default_value}"

                    alter_sql = f"""
                        ALTER TABLE {table_name}
                        ADD COLUMN IF NOT EXISTS {col_name} {col_type} {nullable} {default_clause}
                    """

                    try:
                        await conn.execute(text(alter_sql))
                        logger.info(f"✅ Added column {table_name}.{col_name}")
                        changes_made = True

                        # Add foreign key constraint if column has one
                        if col.foreign_keys:
                            for fk in col.foreign_keys:
                                # Generate constraint name
                                fk_name = f"fk_{table_name}_{col_name}"
                                target_table = fk.column.table.name
                                target_column = fk.column.name

                                # Check if constraint already exists
                                check_fk_sql = f"""
                                    SELECT COUNT(*) FROM information_schema.table_constraints
                                    WHERE constraint_name = '{fk_name}'
                                    AND table_name = '{table_name}'
                                """
                                result = await conn.execute(text(check_fk_sql))
                                exists = (await result.fetchone())[0] > 0

                                if not exists:
                                    fk_sql = f"""
                                        ALTER TABLE {table_name}
                                        ADD CONSTRAINT {fk_name}
                                        FOREIGN KEY ({col_name})
                                        REFERENCES {target_table}({target_column})
                                    """
                                    try:
                                        await conn.execute(text(fk_sql))
                                        logger.info(f"✅ Added foreign key constraint {fk_name}")
                                    except Exception as fk_error:
                                        logger.warning(f"⚠️  Could not add foreign key constraint {fk_name}: {fk_error}")

                    except Exception as e:
                        logger.error(f"❌ Failed to add column {table_name}.{col_name}: {e}")
                        # Continue with other columns
        else:
            logger.debug(f"✅ Table '{table_name}' schema is up to date")

    if changes_made:
        logger.info("✅ Schema migration completed - columns added")
    else:
        logger.info("✅ Schema is up to date - no changes needed")


async def add_missing_foreign_keys(engine: AsyncEngine):
    """
    Check all tables for missing foreign key constraints and add them.
    """
    if engine.dialect.name == "sqlite":
        return

    logger.info("🔍 Checking for missing foreign key constraints...")

    tables_to_check = Base.metadata.tables
    changes_made = False

    for table_name, table in tables_to_check.items():
        # Get existing foreign key constraints from database
        async with engine.connect() as conn:
            result = await conn.execute(text(f"""
                SELECT
                    tc.constraint_name,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_name = '{table_name}'
            """))
            existing_fks = {row[1]: (row[2], row[3]) for row in result}

        # Check each column for foreign keys
        for col in table.columns:
            if col.foreign_keys:
                for fk in col.foreign_keys:
                    target_table = fk.column.table.name
                    target_column = fk.column.name

                    # Check if this FK already exists
                    if col.name in existing_fks:
                        existing_target = existing_fks[col.name]
                        if existing_target == (target_table, target_column):
                            continue  # FK already exists

                    # FK is missing, add it
                    fk_name = f"fk_{table_name}_{col.name}"
                    fk_sql = f"""
                        ALTER TABLE {table_name}
                        ADD CONSTRAINT {fk_name}
                        FOREIGN KEY ({col.name})
                        REFERENCES {target_table}({target_column})
                    """

                    try:
                        async with engine.begin() as conn:
                            await conn.execute(text(fk_sql))
                        logger.info(f"✅ Added foreign key constraint {fk_name}: {table_name}.{col.name} -> {target_table}.{target_column}")
                        changes_made = True
                    except Exception as e:
                        logger.warning(f"⚠️  Could not add foreign key constraint {fk_name}: {e}")

    if changes_made:
        logger.info("✅ Foreign key constraints added")
    else:
        logger.info("✅ All foreign key constraints exist")


async def run_migrations():
    """
    Main migration entry point.
    1. Creates missing tables (via create_all)
    2. Adds missing columns to existing tables
    3. Adds missing foreign key constraints
    4. Runs custom migrations
    """
    logger.info("=" * 60)
    logger.info("Starting database schema migration...")
    logger.info("=" * 60)

    # Step 1: Create any missing tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ All tables exist")

    # Step 2: Add missing columns to existing tables
    await add_missing_columns(engine)

    # Step 3: Add missing foreign key constraints
    await add_missing_foreign_keys(engine)
    
    if engine.dialect.name != "sqlite":
        # Step 4: Ensure last_login_at column exists in tenant_users
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'tenant_users' AND column_name = 'last_login_at'
            """))
            if not result.scalar():
                logger.info("📝 Adding last_login_at column to tenant_users...")
                async with engine.begin() as conn:
                    await conn.execute(text("""
                        ALTER TABLE tenant_users
                        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP NULL
                    """))
                    await conn.execute(text("""
                        CREATE INDEX IF NOT EXISTS idx_tenant_users_last_login
                        ON tenant_users (last_login_at)
                    """))
                logger.info("✅ Added last_login_at column")
            else:
                logger.info("✅ last_login_at column already exists")

    # Step 5: Run custom migrations (categories/units global)
    # Make categories and units global (super admin managed)
    from migrations.make_categories_units_global import run_migration as make_categories_units_global
    await make_categories_units_global(engine)

    logger.info("=" * 60)
    logger.info("Database schema migration completed!")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Allow running migrations standalone
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_migrations())
