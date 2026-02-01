"""
Migration: Add unique constraint for branch names within same parent tenant
Also helps identify and clean up duplicate branch names
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from models import Tenant
from database import DATABASE_URL


async def find_duplicates(session: AsyncSession):
    """Find branches with duplicate names under the same parent"""

    # Get all branches (tenants with parent_tenant_id)
    result = await session.execute(
        select(Tenant).where(Tenant.parent_tenant_id.isnot(None)).order_by(Tenant.parent_tenant_id, Tenant.name)
    )
    branches = result.scalars().all()

    # Group by parent and name
    seen = {}
    duplicates = []

    for branch in branches:
        key = (branch.parent_tenant_id, branch.name)
        if key in seen:
            duplicates.append({
                'branch_id': branch.id,
                'branch_name': branch.name,
                'parent_tenant_id': branch.parent_tenant_id,
                'subdomain': branch.subdomain,
                'created_at': branch.created_at
            })
        else:
            seen[key] = branch

    return duplicates


async def main():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("=" * 80)
        print("Checking for duplicate branch names...")
        print("=" * 80)

        duplicates = await find_duplicates(session)

        if duplicates:
            print(f"\nFound {len(duplicates)} duplicate branch(es):")
            print("-" * 80)
            for dup in duplicates:
                print(f"Branch ID: {dup['branch_id']}")
                print(f"  Name: {dup['branch_name']}")
                print(f"  Subdomain: {dup['subdomain']}")
                print(f"  Parent Tenant ID: {dup['parent_tenant_id']}")
                print(f"  Created: {dup['created_at']}")
                print()

            print("\nTO FIX DUPLICATES:")
            print("1. Go to Settings → Branches in the web interface")
            print("2. Delete or rename duplicate branches")
            print("3. Re-run this script to verify and add the constraint")
            print()
        else:
            print("\n✓ No duplicate branch names found!")
            print("\nAdding database constraint to prevent future duplicates...")

            # Add unique constraint
            try:
                await session.execute(text("""
                    ALTER TABLE tenants
                    ADD CONSTRAINT uq_parent_branch_name
                    UNIQUE (parent_tenant_id, name)
                """))
                await session.commit()
                print("✓ Constraint 'uq_parent_branch_name' added successfully!")
                print("\nBranch names are now unique within each organization.")
            except Exception as e:
                if "already exists" in str(e) or "duplicate key" in str(e):
                    print("✓ Constraint already exists!")
                else:
                    print(f"Error adding constraint: {e}")
                    print("\nThe constraint may already exist, or there might be duplicates.")
                    print("Please check the duplicates listed above and fix them first.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
