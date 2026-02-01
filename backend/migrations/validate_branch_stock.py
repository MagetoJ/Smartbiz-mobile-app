"""
Migration Script: Validate and Create Missing BranchStock Records

This script ensures all branches have BranchStock records for all parent products.
Auto-creates missing BranchStock records with quantity=0.

Run this to ensure data consistency for the branch inventory system.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select
from database import async_session_maker
from models import Tenant, Product, BranchStock


async def validate_branch_stock():
    """
    Ensure all branches have BranchStock for all parent products.
    Creates missing records with quantity=0.
    """
    async with async_session_maker() as db:
        # Get all branches (tenants with parent_tenant_id)
        result = await db.execute(
            select(Tenant).where(Tenant.parent_tenant_id.isnot(None))
        )
        branches = result.scalars().all()

        if not branches:
            print("✅ No branches found. Validation complete.")
            return

        print(f"Found {len(branches)} branches")
        print("Validating BranchStock records...")
        print()

        created_total = 0

        for branch in branches:
            print(f"Processing branch: {branch.name} (ID: {branch.id})")

            # Get parent products
            result = await db.execute(
                select(Product).where(
                    Product.tenant_id == branch.parent_tenant_id,
                    Product.is_available == True
                )
            )
            products = result.scalars().all()

            if not products:
                print(f"  ⚠️  No products found for parent tenant {branch.parent_tenant_id}")
                continue

            print(f"  Found {len(products)} products in parent catalog")

            created_count = 0

            for product in products:
                # Check if BranchStock exists
                result = await db.execute(
                    select(BranchStock).where(
                        BranchStock.tenant_id == branch.id,
                        BranchStock.product_id == product.id
                    )
                )
                branch_stock = result.scalar_one_or_none()

                if not branch_stock:
                    # Create missing BranchStock record
                    branch_stock = BranchStock(
                        tenant_id=branch.id,
                        product_id=product.id,
                        quantity=0,
                        override_selling_price=None
                    )
                    db.add(branch_stock)
                    created_count += 1

            if created_count > 0:
                await db.commit()
                print(f"  ✅ Created {created_count} missing BranchStock records")
                created_total += created_count
            else:
                print(f"  ✅ All BranchStock records exist")

            print()

        print("=" * 60)
        print(f"✅ Validation complete! Created {created_total} missing BranchStock records")


async def summary_report():
    """
    Generate a summary report of BranchStock coverage.
    """
    async with async_session_maker() as db:
        # Count branches
        result = await db.execute(
            select(Tenant).where(Tenant.parent_tenant_id.isnot(None))
        )
        branch_count = len(result.scalars().all())

        # Count total BranchStock records
        result = await db.execute(select(BranchStock))
        branch_stock_count = len(result.scalars().all())

        print()
        print("=" * 60)
        print("SUMMARY REPORT")
        print("=" * 60)
        print(f"Total Branches: {branch_count}")
        print(f"Total BranchStock Records: {branch_stock_count}")
        if branch_count > 0:
            print(f"Average Products per Branch: {branch_stock_count // branch_count if branch_count else 0}")
        print("=" * 60)


async def main():
    print("=" * 60)
    print("VALIDATE BRANCH STOCK MIGRATION")
    print("=" * 60)
    print()

    try:
        await validate_branch_stock()
        await summary_report()
        print()
        print("Migration completed successfully!")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
