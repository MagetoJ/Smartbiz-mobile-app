"""
Database migration script to add category_id and create categories/units tables
"""
import asyncio
from sqlalchemy import text
from database import async_session_maker

async def migrate_database():
    async with async_session_maker() as session:
        try:
            print("Starting database migration...")

            # Check if categories table exists
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'categories'
                );
            """))
            categories_exists = result.scalar()

            if not categories_exists:
                print("Creating categories table...")
                await session.execute(text("""
                    CREATE TABLE categories (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR(50) NOT NULL,
                        display_order INTEGER NOT NULL DEFAULT 0,
                        icon VARCHAR(50),
                        color VARCHAR(20),
                        is_active BOOLEAN NOT NULL DEFAULT true,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
                        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
                        CONSTRAINT uq_tenant_category_name UNIQUE (tenant_id, name)
                    );
                """))

                await session.execute(text("""
                    CREATE INDEX idx_categories_tenant_active ON categories(tenant_id, is_active);
                """))

                await session.execute(text("""
                    CREATE INDEX idx_categories_display_order ON categories(tenant_id, display_order);
                """))

                await session.execute(text("""
                    CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
                """))

                print("Categories table created successfully!")
            else:
                print("Categories table already exists.")

            # Check if units table exists
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'units'
                );
            """))
            units_exists = result.scalar()

            if not units_exists:
                print("Creating units table...")
                await session.execute(text("""
                    CREATE TABLE units (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        name VARCHAR(30) NOT NULL,
                        display_order INTEGER NOT NULL DEFAULT 0,
                        is_active BOOLEAN NOT NULL DEFAULT true,
                        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
                        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'utc'),
                        CONSTRAINT uq_tenant_unit_name UNIQUE (tenant_id, name)
                    );
                """))

                await session.execute(text("""
                    CREATE INDEX idx_units_tenant_active ON units(tenant_id, is_active);
                """))

                await session.execute(text("""
                    CREATE INDEX idx_units_display_order ON units(tenant_id, display_order);
                """))

                await session.execute(text("""
                    CREATE INDEX idx_units_tenant_id ON units(tenant_id);
                """))

                print("Units table created successfully!")
            else:
                print("Units table already exists.")

            # Check if category_id column exists in products table
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'products'
                    AND column_name = 'category_id'
                );
            """))
            category_id_exists = result.scalar()

            if not category_id_exists:
                print("Adding category_id column to products table...")
                await session.execute(text("""
                    ALTER TABLE products
                    ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT;
                """))

                await session.execute(text("""
                    CREATE INDEX idx_products_category ON products(category_id);
                """))

                print("category_id column added successfully!")
            else:
                print("category_id column already exists.")

            # Check if category_legacy column exists
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns
                    WHERE table_name = 'products'
                    AND column_name = 'category_legacy'
                );
            """))
            category_legacy_exists = result.scalar()

            if not category_legacy_exists:
                # Rename existing category column to category_legacy
                result = await session.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.columns
                        WHERE table_name = 'products'
                        AND column_name = 'category'
                    );
                """))
                category_exists = result.scalar()

                if category_exists:
                    print("Renaming category column to category_legacy...")
                    await session.execute(text("""
                        ALTER TABLE products
                        RENAME COLUMN category TO category_legacy;
                    """))
                    print("Category column renamed successfully!")
            else:
                print("category_legacy column already exists.")

            await session.commit()
            print("\n✅ Database migration completed successfully!")

        except Exception as e:
            await session.rollback()
            print(f"\n❌ Migration failed: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate_database())
