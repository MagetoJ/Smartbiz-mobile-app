"""
Migration Script: Backfill Sale.branch_id for Existing Sales

This script populates the branch_id field for existing sales records.
Strategy: If sale.tenant_id is a branch (has parent_tenant_id), set branch_id = tenant_id.
          If tenant is main (no parent), set branch_id = tenant_id (main is its own branch).

Run this after adding the branch_id column to the sales table.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select, update
from database import async_session_maker
from models import Sale, Tenant


async def backfill_sale_branch_ids():
    """
    Set branch_id for existing sales based on their tenant_id.
    """
    async with async_session_maker() as db:
        # Get all sales without branch_id
        result = await db.execute(
            select(Sale.id, Sale.tenant_id, Tenant.parent_tenant_id)
            .join(Tenant, Sale.tenant_id == Tenant.id)
            .where(Sale.branch_id.is_(None))
        )

        sales_to_update = result.all()
        total_sales = len(sales_to_update)

        if total_sales == 0:
            print("✅ No sales need backfilling. All sales already have branch_id set.")
            return

        print(f"Found {total_sales} sales without branch_id")
        print("Starting backfill process...")

        count = 0
        for sale_id, tenant_id, parent_tenant_id in sales_to_update:
            # Set branch_id = tenant_id for all cases
            # (Works for both branches and main tenants)
            await db.execute(
                update(Sale)
                .where(Sale.id == sale_id)
                .values(branch_id=tenant_id)
            )
            count += 1

            if count % 100 == 0:
                print(f"  Processed {count}/{total_sales} sales...")

        await db.commit()
        print(f"\n✅ Successfully backfilled {count} sales with branch_id")


async def verify_backfill():
    """
    Verify that all sales now have branch_id set.
    """
    async with async_session_maker() as db:
        result = await db.execute(
            select(Sale.id).where(Sale.branch_id.is_(None))
        )
        null_count = len(result.all())

        if null_count == 0:
            print("✅ Verification passed: All sales have branch_id set")
        else:
            print(f"⚠️  Warning: {null_count} sales still have NULL branch_id")


async def main():
    print("=" * 60)
    print("BACKFILL SALE BRANCH_ID MIGRATION")
    print("=" * 60)
    print()

    try:
        await backfill_sale_branch_ids()
        print()
        await verify_backfill()
        print()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
