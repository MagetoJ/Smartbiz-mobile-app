"""
Script to automatically clean up duplicate branch names
Keeps the oldest branch and deletes the newer duplicates
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete
from models import Tenant, tenant_users, BranchStock, Sale
from database import DATABASE_URL


async def find_and_cleanup_duplicates(session: AsyncSession, dry_run: bool = True):
    """Find and delete duplicate branches (keeps oldest)"""

    # Get all branches (tenants with parent_tenant_id)
    result = await session.execute(
        select(Tenant)
        .where(Tenant.parent_tenant_id.isnot(None))
        .order_by(Tenant.parent_tenant_id, Tenant.name, Tenant.created_at)
    )
    branches = result.scalars().all()

    # Group by parent and name
    seen = {}
    duplicates_to_delete = []

    for branch in branches:
        key = (branch.parent_tenant_id, branch.name)
        if key in seen:
            # This is a duplicate, mark for deletion
            duplicates_to_delete.append(branch)
        else:
            # First occurrence, keep it
            seen[key] = branch

    if not duplicates_to_delete:
        print("\n✓ No duplicate branches found!")
        return []

    print(f"\nFound {len(duplicates_to_delete)} duplicate branch(es):")
    print("-" * 80)

    for branch in duplicates_to_delete:
        print(f"Branch ID: {branch.id}")
        print(f"  Name: {branch.name}")
        print(f"  Subdomain: {branch.subdomain}")
        print(f"  Parent Tenant ID: {branch.parent_tenant_id}")
        print(f"  Created: {branch.created_at}")

        # Check if branch has any sales
        sales_count = await session.execute(
            select(Sale).where(Sale.tenant_id == branch.id)
        )
        num_sales = len(sales_count.scalars().all())
        print(f"  Sales: {num_sales}")

        # Check if branch has any users
        users_count = await session.execute(
            select(tenant_users).where(tenant_users.c.tenant_id == branch.id)
        )
        num_users = len(users_count.all())
        print(f"  Users: {num_users}")

        if dry_run:
            print(f"  → Would DELETE (dry run)")
        else:
            print(f"  → DELETING...")

        print()

    if dry_run:
        print("\n" + "=" * 80)
        print("DRY RUN MODE - No changes made")
        print("To actually delete these branches, run:")
        print("  python migrations/cleanup_duplicate_branches.py --delete")
        print("=" * 80)
        return duplicates_to_delete

    # Actually delete the duplicates
    print("\nDeleting duplicate branches...")
    for branch in duplicates_to_delete:
        # Delete related data (cascade should handle this, but being explicit)
        await session.execute(
            delete(tenant_users).where(tenant_users.c.tenant_id == branch.id)
        )
        await session.execute(
            delete(BranchStock).where(BranchStock.tenant_id == branch.id)
        )

        # Delete the branch
        await session.delete(branch)

    await session.commit()
    print(f"✓ Deleted {len(duplicates_to_delete)} duplicate branch(es)")

    return duplicates_to_delete


async def main():
    import sys
    dry_run = "--delete" not in sys.argv

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("=" * 80)
        print("Cleaning up duplicate branch names...")
        print("=" * 80)

        await find_and_cleanup_duplicates(session, dry_run=dry_run)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
