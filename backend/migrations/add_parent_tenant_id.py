"""
Database migration to add parent_tenant_id for simple branch hierarchy
Replaces complex organization structure with simple parent-child tenant relationship
"""
import asyncio
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg


DATABASE_URL = "postgresql://chef_user:chef_user@localhost/chef_db"


async def run_migration():
    """Add parent_tenant_id column to tenants table"""

    conn = await asyncpg.connect(DATABASE_URL)

    try:
        print("Starting migration: Add parent_tenant_id to tenants...")

        # Step 1: Add parent_tenant_id column
        await conn.execute("""
            ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS parent_tenant_id INTEGER
            REFERENCES tenants(id) ON DELETE CASCADE;
        """)
        print("✓ Added parent_tenant_id column")

        # Step 2: Create index for performance
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tenants_parent
            ON tenants(parent_tenant_id);
        """)
        print("✓ Created index on parent_tenant_id")

        # Step 3: Update branch_stock to reference products directly (if needed)
        await conn.execute("""
            ALTER TABLE branch_stock
            DROP COLUMN IF EXISTS org_product_id;
        """)
        print("✓ Removed org_product_id from branch_stock (if existed)")

        await conn.execute("""
            ALTER TABLE branch_stock
            ADD COLUMN IF NOT EXISTS product_id INTEGER
            REFERENCES products(id) ON DELETE CASCADE;
        """)
        print("✓ Ensured product_id column exists in branch_stock")

        print("\n✅ Migration completed successfully!")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
