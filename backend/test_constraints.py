"""
Test script to verify database constraints are working correctly.
Run this after database migrations or schema changes.

Usage:
    cd backend
    source venv/bin/activate
    python test_constraints.py
"""

import asyncio
from sqlalchemy import select, insert, text
from sqlalchemy.exc import IntegrityError
from database import async_session_maker, engine
from models import Product, Tenant, User, tenant_users, UserRole


async def check_schema_constraints():
    """Check constraints exist in database schema"""
    async with engine.connect() as conn:
        result = await conn.execute(text('''
            SELECT
                tc.constraint_name,
                tc.table_name,
                STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
                AND tc.table_name IN ('products', 'tenant_users')
                AND tc.table_schema = 'public'
            GROUP BY tc.constraint_name, tc.table_name
            ORDER BY tc.table_name, tc.constraint_name;
        '''))

        rows = result.fetchall()
        for row in rows:
            print(f"   ✅ {row[1]}.{row[0]}: ({row[2]})")


async def test_product_sku_constraint():
    """Test that SKU uniqueness is enforced per tenant"""
    async with async_session_maker() as db:
        try:
            result = await db.execute(select(Tenant).limit(1))
            tenant = result.scalar_one_or_none()

            if not tenant:
                print("   ⚠️  No tenants found. Run seed_data.py first.")
                return

            result = await db.execute(
                select(Product)
                .where(Product.tenant_id == tenant.id)
                .limit(1)
            )
            existing_product = result.scalar_one_or_none()

            if not existing_product:
                print("   ⚠️  No products found. Cannot test.")
                return

            # Try to create duplicate SKU in same tenant
            duplicate = Product(
                tenant_id=tenant.id,
                name="Constraint Test Product",
                sku=existing_product.sku,  # Duplicate SKU
                buying_price=100,
                selling_price=150,
                quantity=10,
                category="Test"
            )
            db.add(duplicate)
            await db.flush()

            # If we get here, the constraint failed
            print(f"   ❌ FAILED: Duplicate SKU '{existing_product.sku}' was allowed!")

        except IntegrityError as e:
            if "uq_tenant_product_sku" in str(e):
                print(f"   ✅ PASSED: Duplicate SKU was blocked")
            else:
                print(f"   ⚠️  Unexpected integrity error")


async def test_tenant_user_constraint():
    """Test that user can't join same tenant twice"""
    async with async_session_maker() as db:
        try:
            result = await db.execute(select(Tenant).limit(1))
            tenant = result.scalar_one_or_none()

            result = await db.execute(select(User).limit(1))
            user = result.scalar_one_or_none()

            if not user or not tenant:
                print("   ⚠️  No users or tenants found. Cannot test.")
                return

            # Check if user is already a member
            result = await db.execute(
                select(tenant_users)
                .where(tenant_users.c.tenant_id == tenant.id)
                .where(tenant_users.c.user_id == user.id)
            )
            existing_membership = result.fetchone()

            if not existing_membership:
                print("   ⚠️  User not a tenant member. Cannot test duplicate.")
                return

            # Try to add duplicate membership
            await db.execute(
                insert(tenant_users).values(
                    tenant_id=tenant.id,
                    user_id=user.id,
                    role=UserRole.STAFF
                )
            )
            await db.flush()

            # If we get here, the constraint failed
            print(f"   ❌ FAILED: Duplicate membership was allowed!")

        except IntegrityError as e:
            if "uq_tenant_user" in str(e):
                print(f"   ✅ PASSED: Duplicate membership was blocked")
            else:
                print(f"   ⚠️  Unexpected integrity error")


async def verify_constraints():
    """Verify all critical database constraints"""

    print("=" * 70)
    print("DATABASE CONSTRAINT VERIFICATION")
    print("=" * 70)

    print("\n1. Checking constraint existence in database...")
    await check_schema_constraints()

    print("\n2. Testing Product SKU constraint (tenant_id, sku)...")
    await test_product_sku_constraint()

    print("\n3. Testing Tenant-User membership constraint (tenant_id, user_id)...")
    await test_tenant_user_constraint()

    print("\n" + "=" * 70)
    print("VERIFICATION COMPLETE")
    print("=" * 70)
    print()


if __name__ == "__main__":
    asyncio.run(verify_constraints())
