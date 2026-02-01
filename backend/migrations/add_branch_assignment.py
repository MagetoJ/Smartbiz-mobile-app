"""
Migration: Add branch assignment to tenant_users
Allows staff users to be assigned to specific branches within an organization
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text

# Use sync driver for migrations
DATABASE_URL = "postgresql://chef_user:chef_user@localhost/chef_db"

def upgrade():
    """Add branch_id column to tenant_users table"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("Adding branch_id column to tenant_users table...")

        # Add branch_id column (nullable, references tenants.id)
        conn.execute(text("""
            ALTER TABLE tenant_users
            ADD COLUMN IF NOT EXISTS branch_id INTEGER
            REFERENCES tenants(id) ON DELETE SET NULL;
        """))

        # Create index for faster lookups
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_tenant_users_branch
            ON tenant_users(branch_id);
        """))

        # For existing users, set branch_id to their tenant_id (assign to main location)
        # This ensures backward compatibility
        conn.execute(text("""
            UPDATE tenant_users
            SET branch_id = tenant_id
            WHERE branch_id IS NULL;
        """))

        conn.commit()
        print("✓ Successfully added branch_id column to tenant_users")
        print("✓ Existing users assigned to their main tenant")

def downgrade():
    """Remove branch_id column from tenant_users table"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("Removing branch_id column from tenant_users table...")

        # Drop index
        conn.execute(text("""
            DROP INDEX IF EXISTS idx_tenant_users_branch;
        """))

        # Drop column
        conn.execute(text("""
            ALTER TABLE tenant_users
            DROP COLUMN IF EXISTS branch_id;
        """))

        conn.commit()
        print("✓ Successfully removed branch_id column")

if __name__ == "__main__":
    print("Running migration: Add branch assignment to tenant_users")
    print("=" * 60)

    try:
        upgrade()
        print("\n✓ Migration completed successfully!")
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        sys.exit(1)
