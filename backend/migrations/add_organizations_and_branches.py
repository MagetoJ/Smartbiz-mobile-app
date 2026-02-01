"""
Database Migration: Add Organizations and Branches
Transforms multi-tenant architecture to support organization hierarchies with shared product catalogs
"""
import sys
from pathlib import Path

# Add parent directory to sys.path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import async_session_maker
import asyncio


async def migrate():
    """Add organizations, branches, and shared product catalog tables"""
    async with async_session_maker() as session:
        try:
            print("Starting Organizations and Branches migration...")

            # ========== CREATE NEW TABLES ==========

            # 1. Organizations table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS organizations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    owner_email VARCHAR(100) NOT NULL,

                    currency VARCHAR(3) DEFAULT 'KES',
                    tax_rate FLOAT DEFAULT 0.16,
                    timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',

                    subscription_plan VARCHAR(20) DEFAULT 'free',
                    max_branches INTEGER DEFAULT 3,
                    is_active BOOLEAN DEFAULT TRUE,

                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            print("✓ Created organizations table")

            # 2. Organization Categories table
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS organization_categories (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

                    name VARCHAR(50) NOT NULL,
                    display_order INTEGER DEFAULT 0,
                    icon VARCHAR(50),
                    color VARCHAR(20),
                    is_active BOOLEAN DEFAULT TRUE,
                    target_margin FLOAT,
                    minimum_margin FLOAT,

                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),

                    UNIQUE(organization_id, name)
                )
            """))
            print("✓ Created organization_categories table")

            # 3. Organization Products table (Shared Catalog)
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS organization_products (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

                    name VARCHAR(100) NOT NULL,
                    sku VARCHAR(50) NOT NULL,
                    description TEXT,
                    base_cost FLOAT NOT NULL,
                    selling_price FLOAT NOT NULL,
                    target_margin FLOAT DEFAULT 25.0,
                    minimum_margin FLOAT DEFAULT 15.0,

                    category_id INTEGER REFERENCES organization_categories(id) ON DELETE RESTRICT,
                    unit VARCHAR(20) DEFAULT 'pcs',
                    image_url VARCHAR(255),
                    reorder_level INTEGER DEFAULT 10,
                    is_available BOOLEAN DEFAULT TRUE,
                    is_service BOOLEAN DEFAULT FALSE,

                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),

                    UNIQUE(organization_id, sku)
                )
            """))
            print("✓ Created organization_products table")

            # 4. Branch Stock table (Per-Branch Inventory)
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS branch_stock (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    org_product_id INTEGER NOT NULL REFERENCES organization_products(id) ON DELETE CASCADE,

                    quantity INTEGER NOT NULL DEFAULT 0,
                    override_selling_price FLOAT,

                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),

                    UNIQUE(tenant_id, org_product_id)
                )
            """))
            print("✓ Created branch_stock table")

            # 5. Organization Users table (Org-Level Permissions)
            await session.execute(text("""
                CREATE TABLE IF NOT EXISTS organization_users (
                    id SERIAL PRIMARY KEY,
                    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) DEFAULT 'org_admin',
                    is_active BOOLEAN DEFAULT TRUE,
                    joined_at TIMESTAMP DEFAULT NOW(),

                    UNIQUE(organization_id, user_id)
                )
            """))
            print("✓ Created organization_users table")

            # ========== MODIFY EXISTING TABLES ==========

            # 6. Add organization link to tenants table
            await session.execute(text("""
                ALTER TABLE tenants
                ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL
            """))
            await session.execute(text("""
                ALTER TABLE tenants
                ADD COLUMN IF NOT EXISTS branch_type VARCHAR(20) DEFAULT 'independent'
            """))
            print("✓ Added organization_id and branch_type to tenants table")

            # 7. Add org product link to sale_items
            await session.execute(text("""
                ALTER TABLE sale_items
                ADD COLUMN IF NOT EXISTS org_product_id INTEGER REFERENCES organization_products(id) ON DELETE RESTRICT
            """))
            print("✓ Added org_product_id to sale_items table")

            # 8. Add org product links to stock_movements
            await session.execute(text("""
                ALTER TABLE stock_movements
                ADD COLUMN IF NOT EXISTS org_product_id INTEGER REFERENCES organization_products(id) ON DELETE RESTRICT
            """))
            await session.execute(text("""
                ALTER TABLE stock_movements
                ADD COLUMN IF NOT EXISTS branch_stock_id INTEGER REFERENCES branch_stock(id) ON DELETE RESTRICT
            """))
            print("✓ Added org_product_id and branch_stock_id to stock_movements table")

            # ========== CREATE INDEXES FOR PERFORMANCE ==========

            # Organizations indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active)
            """))

            # Organization categories indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_categories_org ON organization_categories(organization_id)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_categories_org_active
                ON organization_categories(organization_id, is_active)
            """))

            # Organization products indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_products_org ON organization_products(organization_id)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_products_category ON organization_products(category_id)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_products_org_active
                ON organization_products(organization_id, is_available)
            """))

            # Branch stock indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_branch_stock_tenant ON branch_stock(tenant_id)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_branch_stock_product ON branch_stock(org_product_id)
            """))

            # Organization users indexes
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_users_org ON organization_users(organization_id)
            """))
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_org_users_user ON organization_users(user_id)
            """))

            # Tenants organization index
            await session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_tenants_organization ON tenants(organization_id)
            """))

            print("✓ Created all performance indexes")

            # Commit all changes
            await session.commit()

            print("\n" + "="*60)
            print("✅ Migration completed successfully!")
            print("="*60)
            print("\nCreated 5 new tables:")
            print("  - organizations")
            print("  - organization_categories")
            print("  - organization_products")
            print("  - branch_stock")
            print("  - organization_users")
            print("\nModified 3 existing tables:")
            print("  - tenants (added organization_id, branch_type)")
            print("  - sale_items (added org_product_id)")
            print("  - stock_movements (added org_product_id, branch_stock_id)")
            print("\nCreated 11 performance indexes")
            print("\nBackward compatibility: Independent tenants (organization_id=NULL) continue working unchanged")

        except Exception as e:
            await session.rollback()
            print(f"\n✗ Migration failed: {str(e)}")
            raise


async def rollback():
    """Rollback migration (for development/testing)"""
    async with async_session_maker() as session:
        try:
            print("Rolling back Organizations and Branches migration...")

            # Drop columns from existing tables (in reverse order)
            await session.execute(text("ALTER TABLE stock_movements DROP COLUMN IF EXISTS branch_stock_id"))
            await session.execute(text("ALTER TABLE stock_movements DROP COLUMN IF EXISTS org_product_id"))
            await session.execute(text("ALTER TABLE sale_items DROP COLUMN IF EXISTS org_product_id"))
            await session.execute(text("ALTER TABLE tenants DROP COLUMN IF EXISTS branch_type"))
            await session.execute(text("ALTER TABLE tenants DROP COLUMN IF EXISTS organization_id"))

            # Drop tables (in reverse order to respect foreign keys)
            await session.execute(text("DROP TABLE IF EXISTS branch_stock CASCADE"))
            await session.execute(text("DROP TABLE IF EXISTS organization_users CASCADE"))
            await session.execute(text("DROP TABLE IF EXISTS organization_products CASCADE"))
            await session.execute(text("DROP TABLE IF EXISTS organization_categories CASCADE"))
            await session.execute(text("DROP TABLE IF EXISTS organizations CASCADE"))

            await session.commit()
            print("✓ Rollback completed successfully")

        except Exception as e:
            await session.rollback()
            print(f"✗ Rollback failed: {str(e)}")
            raise


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        print("WARNING: This will remove all organizations and branches data!")
        confirm = input("Type 'yes' to confirm rollback: ")
        if confirm.lower() == 'yes':
            asyncio.run(rollback())
        else:
            print("Rollback cancelled")
    else:
        asyncio.run(migrate())
