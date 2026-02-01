"""
Sync BranchStock records for all existing branches
Ensures every branch has a BranchStock entry for every parent product

This migration fixes the issue where branches created before this fix
may show parent stock quantities instead of 0.

Run with: python migrations/sync_branch_stock.py
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import async_session_maker
from models import Tenant, Product, BranchStock
import asyncio


async def sync_branch_stock():
    """Sync BranchStock records for all existing branches"""
    async with async_session_maker() as db:
        print("=" * 60)
        print("Branch Stock Sync Migration")
        print("=" * 60)

        # Find all branches (tenants with parent_tenant_id)
        result = await db.execute(
            select(Tenant).where(Tenant.parent_tenant_id != None)
        )
        branches = result.scalars().all()

        if not branches:
            print("No branches found. Nothing to sync.")
            return

        print(f"\nFound {len(branches)} branch(es) to sync\n")

        total_created = 0
        total_existing = 0

        for branch in branches:
            print(f"Syncing branch: {branch.name} (ID: {branch.id})")

            # Get parent tenant's products
            main_tenant_id = branch.parent_tenant_id
            products_result = await db.execute(
                select(Product).where(
                    Product.tenant_id == main_tenant_id,
                    Product.is_available == True
                )
            )
            products = products_result.scalars().all()

            print(f"  Parent has {len(products)} product(s)")

            # Check which products already have BranchStock
            branch_created = 0
            branch_existing = 0

            for product in products:
                stock_result = await db.execute(
                    select(BranchStock).where(
                        BranchStock.tenant_id == branch.id,
                        BranchStock.product_id == product.id
                    )
                )
                existing = stock_result.scalar_one_or_none()

                if not existing:
                    # Create missing BranchStock with qty=0
                    branch_stock = BranchStock(
                        tenant_id=branch.id,
                        product_id=product.id,
                        quantity=0,
                        override_selling_price=None
                    )
                    db.add(branch_stock)
                    branch_created += 1
                    print(f"    ✓ Created BranchStock for: {product.name}")
                else:
                    branch_existing += 1

            total_created += branch_created
            total_existing += branch_existing

            if branch_created > 0:
                print(f"  Created {branch_created} BranchStock record(s)")
            if branch_existing > 0:
                print(f"  Already had {branch_existing} BranchStock record(s)")

            await db.commit()
            print()

        print("=" * 60)
        print(f"Migration Complete!")
        print(f"  Total BranchStock records created: {total_created}")
        print(f"  Total existing records: {total_existing}")
        print("=" * 60)


if __name__ == "__main__":
    print("\nStarting branch stock synchronization...\n")
    asyncio.run(sync_branch_stock())
    print("\nAll branches synced successfully!")
