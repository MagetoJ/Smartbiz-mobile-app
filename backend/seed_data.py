"""
Seed script to populate the database with sample inventory products.
MANUAL USE ONLY - For adding demo data to a specific tenant.

Usage:
    python seed_data.py

This script is DEPRECATED - use seed_demo_data.py for automatic seeding.
This file is kept for manual/testing purposes only.
"""
import asyncio
import sys
from database import async_session_maker, init_db
from models import Product, StockMovement, StockMovementType, User, Tenant, Category, Unit
from sqlalchemy import select, func
from auth import get_password_hash

async def seed_inventory():
    """Add sample products to the database - UPDATED FOR CURRENT SCHEMA"""
    await init_db()
    
    print("=" * 60)
    print("MANUAL DEMO DATA SEEDING")
    print("=" * 60)
    
    async with async_session_maker() as session:
        # Check if demo tenant exists
        result = await session.execute(select(Tenant).where(Tenant.subdomain == "demo"))
        demo_tenant = result.scalar_one_or_none()
        
        if not demo_tenant:
            print("❌ Error: Demo tenant not found!")
            print("Please run the main app first to create the default tenant.")
            return
        
        # Check if admin user exists
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        
        if not admin:
            print("❌ Error: Admin user not found!")
            print("Please run the main app first to create the default admin user.")
            return
        
        # Check if tenant already has products
        result = await session.execute(
            select(func.count(Product.id)).where(Product.tenant_id == demo_tenant.id)
        )
        existing_products = result.scalar() or 0
        
        if existing_products > 0:
            print(f"⚠️  Warning: Tenant '{demo_tenant.name}' already has {existing_products} products!")
            response = input("Do you want to add more products anyway? (yes/no): ")
            if response.lower() != "yes":
                print("Aborted.")
                return
        
        print(f"\n🌱 Seeding demo data for tenant: {demo_tenant.name}")
        
        # Use seed_demo_data module for actual seeding
        from seed_demo_data import seed_demo_tenant_data
        await seed_demo_tenant_data(session, demo_tenant, admin)
        
        print("\n✅ Manual seeding completed!")
        print("=" * 60)

# OLD CODE BELOW - DEPRECATED BUT KEPT FOR REFERENCE
"""
OLD SCHEMA - NO LONGER WORKS:

    sample_products = [
        # Beverages
        Product(
            name="Coca Cola 500ml", 
            sku="BEV-001",
            description="Carbonated soft drink", 
            base_cost=45, 
            selling_price=60, 
            quantity=100,
            category="Beverages",  # ❌ DEPRECATED: Should be category_id (FK)
            unit="bottle",
            is_available=True,
            reorder_level=20
        ),
        # ... more products
    ]
    
    # ❌ THIS OLD CODE NO LONGER WORKS - USE seed_demo_data.py INSTEAD
"""

if __name__ == "__main__":
    asyncio.run(seed_inventory())
