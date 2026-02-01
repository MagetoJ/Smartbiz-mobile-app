"""
Repair missing BranchStock records for existing branches.

This fixes branches that were created before the bug fix and are missing
some or all products in their stock initialization.

Usage:
    cd backend && python migrations/repair_missing_branch_stock.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path so we can import database and models
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from database import async_session_maker
from models import Tenant, Product, BranchStock


async def repair_missing_branch_stock():
    """Ensure all branches have BranchStock for ALL parent products."""
    async with async_session_maker() as db:
        print("="*60)
        print("REPAIR SCRIPT: Missing BranchStock Records")
        print("="*60)

        # Get all branches (tenants with parent_tenant_id)
        result = await db.execute(
            select(Tenant).where(Tenant.parent_tenant_id.isnot(None))
        )
        branches = result.scalars().all()

        if not branches:
            print("\n✅ No branches found in the system.")
            return

        print(f"\n📦 Found {len(branches)} branches to check")

        total_created = 0
        branches_fixed = 0

        for branch in branches:
            print(f"\n{'─'*60}")
            print(f"🔍 Checking: {branch.name} (ID: {branch.id})")
            print(f"   Subdomain: {branch.subdomain}")
            print(f"   Parent: {branch.parent_tenant_id}")

            # Get ALL products from parent (not just available ones!)
            result = await db.execute(
                select(Product).where(
                    Product.tenant_id == branch.parent_tenant_id
                )
            )
            all_products = result.scalars().all()

            if not all_products:
                print(f"   ⚠️  No products found for parent tenant (ID: {branch.parent_tenant_id})")
                continue

            print(f"   📋 Parent has {len(all_products)} products total")

            # Get existing branch stock
            result = await db.execute(
                select(BranchStock).where(
                    BranchStock.tenant_id == branch.id
                )
            )
            existing_stocks = result.scalars().all()
            existing_product_ids = {stock.product_id for stock in existing_stocks}

            print(f"   📊 Branch currently has {len(existing_stocks)} stock records")

            branch_created = 0
            for product in all_products:
                if product.id not in existing_product_ids:
                    # Create missing record
                    branch_stock = BranchStock(
                        tenant_id=branch.id,
                        product_id=product.id,
                        quantity=0,
                        override_selling_price=None
                    )
                    db.add(branch_stock)
                    branch_created += 1
                    print(f"   ✅ Added: {product.name} (SKU: {product.sku}) [Available: {product.is_available}]")

            if branch_created > 0:
                total_created += branch_created
                branches_fixed += 1
                print(f"   🔧 Created {branch_created} missing stock records")
            else:
                print(f"   ✅ All stock records already exist")

        if total_created > 0:
            await db.commit()
            print(f"\n{'='*60}")
            print(f"✅ REPAIR COMPLETE")
            print(f"{'='*60}")
            print(f"   Branches fixed: {branches_fixed}/{len(branches)}")
            print(f"   Stock records created: {total_created}")
            print(f"{'='*60}\n")
        else:
            print(f"\n{'='*60}")
            print(f"✅ NO REPAIRS NEEDED")
            print(f"{'='*60}")
            print(f"   All branches have complete stock records")
            print(f"{'='*60}\n")


if __name__ == "__main__":
    try:
        asyncio.run(repair_missing_branch_stock())
    except Exception as e:
        print(f"\n❌ Error during repair: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
