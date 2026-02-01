"""
Migration: Add RBAC fields to tenant_users table
- Adds is_owner column
- Sets is_owner=TRUE for first admin of each tenant
"""
from sqlalchemy import create_engine, text
import sys
import os

# Add parent directory to path to import config module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings

# Get sync database URL (remove asyncpg driver for migrations)
def get_sync_database_url():
    """Convert async database URL to sync for migrations"""
    url = settings.DATABASE_URL
    # Remove async drivers if present
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgres+asyncpg://", "postgresql://")
    return url

DATABASE_URL = get_sync_database_url()

def migrate():
    """Run the migration"""
    print("Starting RBAC migration...")
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("1. Adding is_owner column to tenant_users table...")
        try:
            conn.execute(text("""
                ALTER TABLE tenant_users
                ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT FALSE
            """))
            conn.commit()
            print("   ✓ is_owner column added successfully")
        except Exception as e:
            print(f"   ⚠ Error adding column (may already exist): {e}")
            conn.rollback()

        print("\n2. Setting is_owner=TRUE for first admin of each tenant...")
        try:
            # Set is_owner for the earliest admin user in each tenant
            # Use uppercase ADMIN to match database enum values
            result = conn.execute(text("""
                UPDATE tenant_users tu1
                SET is_owner = TRUE
                WHERE role = 'ADMIN'::userrole
                AND id = (
                    SELECT id FROM tenant_users tu2
                    WHERE tu2.tenant_id = tu1.tenant_id
                    AND tu2.role = 'ADMIN'::userrole
                    ORDER BY tu2.joined_at ASC
                    LIMIT 1
                )
            """))
            conn.commit()
            print(f"   ✓ Updated {result.rowcount} tenant owners")
        except Exception as e:
            print(f"   ✗ Error setting owners: {e}")
            conn.rollback()
            return False

        print("\n3. Verifying migration...")
        try:
            result = conn.execute(text("""
                SELECT tenant_id, COUNT(*) as owner_count
                FROM tenant_users
                WHERE is_owner = TRUE
                GROUP BY tenant_id
            """))
            tenant_owners = result.fetchall()

            if tenant_owners:
                print(f"   ✓ Found {len(tenant_owners)} tenant(s) with owners:")
                for tenant_id, count in tenant_owners:
                    print(f"     - Tenant {tenant_id}: {count} owner(s)")
            else:
                print("   ⚠ No owners found (this may be normal if no tenants exist yet)")

        except Exception as e:
            print(f"   ⚠ Error during verification: {e}")

    print("\n✅ RBAC migration completed successfully!")
    return True

def rollback():
    """Rollback the migration"""
    print("Rolling back RBAC migration...")
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        try:
            conn.execute(text("""
                ALTER TABLE tenant_users
                DROP COLUMN IF EXISTS is_owner
            """))
            conn.commit()
            print("✓ Rollback completed")
        except Exception as e:
            print(f"✗ Rollback failed: {e}")
            conn.rollback()

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='RBAC Migration Script')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    args = parser.parse_args()

    if args.rollback:
        rollback()
    else:
        migrate()
