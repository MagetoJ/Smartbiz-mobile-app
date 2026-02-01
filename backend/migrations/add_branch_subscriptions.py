"""
Migration: Add Branch Subscription Tables

Creates two new tables to support per-branch subscription management:
1. branch_subscriptions - Historical record of which branches were included in each payment
2. active_branch_subscriptions - Current active subscription status for each branch (quick lookup)

Also adds metadata columns to subscription_transactions table.

Run this migration with: python migrations/add_branch_subscriptions.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import from backend
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import engine, async_session_maker
from models import Base, Tenant, SubscriptionTransaction
from datetime import datetime


async def run_migration():
    """Run the migration to add branch subscription tables"""

    print("Starting branch subscription migration...")

    async with engine.begin() as conn:
        # Step 1: Create branch_subscriptions table
        print("Creating branch_subscriptions table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS branch_subscriptions (
                id SERIAL PRIMARY KEY,
                transaction_id INTEGER NOT NULL REFERENCES subscription_transactions(id) ON DELETE CASCADE,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                is_main_location BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_transaction_tenant UNIQUE (transaction_id, tenant_id)
            );
        """))

        # Create indexes for branch_subscriptions
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_branch_sub_transaction
            ON branch_subscriptions(transaction_id);
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_branch_sub_tenant
            ON branch_subscriptions(tenant_id);
        """))

        print("✓ branch_subscriptions table created")

        # Step 2: Create active_branch_subscriptions table
        print("Creating active_branch_subscriptions table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS active_branch_subscriptions (
                id SERIAL PRIMARY KEY,
                parent_tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                branch_tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                is_active BOOLEAN DEFAULT TRUE,
                subscription_start_date TIMESTAMP NOT NULL,
                subscription_end_date TIMESTAMP NOT NULL,
                last_transaction_id INTEGER REFERENCES subscription_transactions(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_parent_branch UNIQUE (parent_tenant_id, branch_tenant_id)
            );
        """))

        # Create indexes for active_branch_subscriptions
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_active_branch_parent
            ON active_branch_subscriptions(parent_tenant_id);
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_active_branch_end_date
            ON active_branch_subscriptions(subscription_end_date);
        """))

        print("✓ active_branch_subscriptions table created")

        # Step 3: Add new columns to subscription_transactions
        print("Adding metadata columns to subscription_transactions...")

        # Check if columns already exist
        result = await conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'subscription_transactions'
            AND column_name IN ('num_branches_included', 'branch_selection_json', 'main_location_included');
        """))
        existing_columns = [row[0] for row in result]

        if 'num_branches_included' not in existing_columns:
            await conn.execute(text("""
                ALTER TABLE subscription_transactions
                ADD COLUMN num_branches_included INTEGER DEFAULT 0;
            """))
            print("✓ Added num_branches_included column")
        else:
            print("  - num_branches_included already exists")

        if 'branch_selection_json' not in existing_columns:
            await conn.execute(text("""
                ALTER TABLE subscription_transactions
                ADD COLUMN branch_selection_json TEXT;
            """))
            print("✓ Added branch_selection_json column")
        else:
            print("  - branch_selection_json already exists")

        if 'main_location_included' not in existing_columns:
            await conn.execute(text("""
                ALTER TABLE subscription_transactions
                ADD COLUMN main_location_included BOOLEAN DEFAULT TRUE;
            """))
            print("✓ Added main_location_included column")
        else:
            print("  - main_location_included already exists")

    print("\n✓ Database schema migration completed successfully!")

    # Step 4: Backfill existing subscriptions
    await backfill_existing_subscriptions()


async def backfill_existing_subscriptions():
    """
    Backfill branch subscription records for existing active subscriptions.

    Strategy: For each active subscription (subscription_end_date > now):
    - Find the parent tenant and all its branches
    - Create branch_subscriptions records for all branches in the organization
    - Create active_branch_subscriptions records for all branches

    This ensures existing tenants retain access to all their branches.
    """

    print("\nStarting backfill of existing subscriptions...")

    async with async_session_maker() as db:
        # Find all tenants with active subscriptions (using next_billing_date)
        result = await db.execute(text("""
            SELECT DISTINCT t.id, t.parent_tenant_id, t.next_billing_date
            FROM tenants t
            WHERE t.next_billing_date IS NOT NULL
            AND t.next_billing_date > NOW()
        """))

        active_tenants = result.fetchall()

        if not active_tenants:
            print("No active subscriptions found to backfill.")
            return

        print(f"Found {len(active_tenants)} tenant(s) with active subscriptions")

        backfilled_count = 0

        for tenant_row in active_tenants:
            tenant_id = tenant_row[0]
            parent_tenant_id = tenant_row[1] or tenant_id  # If no parent, it IS the parent
            next_billing_date = tenant_row[2]

            # Get the most recent successful transaction for this tenant
            tx_result = await db.execute(text("""
                SELECT id, subscription_start_date, subscription_end_date
                FROM subscription_transactions
                WHERE tenant_id = :tenant_id
                AND paystack_status = 'success'
                ORDER BY created_at DESC
                LIMIT 1
            """), {"tenant_id": parent_tenant_id})

            transaction_row = tx_result.fetchone()

            if not transaction_row:
                print(f"  Warning: No successful transaction found for tenant {tenant_id}, skipping")
                continue

            transaction_id = transaction_row[0]
            subscription_start_date = transaction_row[1]
            subscription_end_date_tx = transaction_row[2]

            # Get all branches in this organization (parent + all children)
            branches_result = await db.execute(text("""
                SELECT id, name, subdomain
                FROM tenants
                WHERE (id = :parent_id OR parent_tenant_id = :parent_id)
                AND is_active = TRUE
            """), {"parent_id": parent_tenant_id})

            branches = branches_result.fetchall()

            print(f"\n  Processing tenant {parent_tenant_id} with {len(branches)} branch(es)")

            for branch in branches:
                branch_id = branch[0]
                branch_name = branch[1]
                is_main = (branch_id == parent_tenant_id)

                # Check if branch_subscription already exists
                check_result = await db.execute(text("""
                    SELECT id FROM branch_subscriptions
                    WHERE transaction_id = :tx_id AND tenant_id = :tenant_id
                """), {"tx_id": transaction_id, "tenant_id": branch_id})

                if check_result.fetchone():
                    print(f"    - {branch_name}: branch_subscription already exists")
                else:
                    # Create branch_subscriptions record (historical)
                    await db.execute(text("""
                        INSERT INTO branch_subscriptions (transaction_id, tenant_id, is_main_location)
                        VALUES (:tx_id, :tenant_id, :is_main)
                    """), {"tx_id": transaction_id, "tenant_id": branch_id, "is_main": is_main})
                    print(f"    + {branch_name}: Created branch_subscription")

                # Check if active_branch_subscription already exists
                check_active = await db.execute(text("""
                    SELECT id FROM active_branch_subscriptions
                    WHERE parent_tenant_id = :parent_id AND branch_tenant_id = :branch_id
                """), {"parent_id": parent_tenant_id, "branch_id": branch_id})

                if check_active.fetchone():
                    print(f"    - {branch_name}: active_branch_subscription already exists")
                else:
                    # Create active_branch_subscriptions record (current status)
                    await db.execute(text("""
                        INSERT INTO active_branch_subscriptions
                        (parent_tenant_id, branch_tenant_id, is_active, subscription_start_date,
                         subscription_end_date, last_transaction_id)
                        VALUES (:parent_id, :branch_id, TRUE, :start_date, :end_date, :tx_id)
                    """), {
                        "parent_id": parent_tenant_id,
                        "branch_id": branch_id,
                        "start_date": subscription_start_date,
                        "end_date": subscription_end_date_tx,
                        "tx_id": transaction_id
                    })
                    print(f"    + {branch_name}: Created active_branch_subscription")
                    backfilled_count += 1

            # Update transaction metadata
            await db.execute(text("""
                UPDATE subscription_transactions
                SET num_branches_included = :num_branches,
                    main_location_included = TRUE
                WHERE id = :tx_id
            """), {"num_branches": len(branches), "tx_id": transaction_id})

        await db.commit()

        print(f"\n✓ Backfill completed: Created {backfilled_count} active branch subscription(s)")


async def verify_migration():
    """Verify that the migration was successful"""

    print("\nVerifying migration...")

    async with async_session_maker() as db:
        # Check that tables exist
        result = await db.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name IN ('branch_subscriptions', 'active_branch_subscriptions')
        """))
        tables = [row[0] for row in result]

        if 'branch_subscriptions' in tables:
            print("✓ branch_subscriptions table exists")
        else:
            print("✗ branch_subscriptions table NOT found")
            return False

        if 'active_branch_subscriptions' in tables:
            print("✓ active_branch_subscriptions table exists")
        else:
            print("✗ active_branch_subscriptions table NOT found")
            return False

        # Check columns were added
        result = await db.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'subscription_transactions'
            AND column_name IN ('num_branches_included', 'branch_selection_json', 'main_location_included')
        """))
        columns = [row[0] for row in result]

        if len(columns) == 3:
            print("✓ All metadata columns added to subscription_transactions")
        else:
            print(f"✗ Missing columns: {3 - len(columns)}")
            return False

        # Check indexes
        result = await db.execute(text("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename IN ('branch_subscriptions', 'active_branch_subscriptions')
        """))
        indexes = [row[0] for row in result]

        print(f"✓ Created {len(indexes)} index(es)")

        # Check data counts
        result = await db.execute(text("SELECT COUNT(*) FROM branch_subscriptions"))
        branch_sub_count = result.scalar()

        result = await db.execute(text("SELECT COUNT(*) FROM active_branch_subscriptions"))
        active_sub_count = result.scalar()

        print(f"✓ branch_subscriptions: {branch_sub_count} record(s)")
        print(f"✓ active_branch_subscriptions: {active_sub_count} record(s)")

    print("\n✅ Migration verification passed!")
    return True


async def main():
    """Main migration runner"""
    try:
        await run_migration()
        await verify_migration()
        print("\n" + "="*60)
        print("Migration completed successfully!")
        print("="*60)
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
