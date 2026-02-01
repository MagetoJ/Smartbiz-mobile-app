"""
Combined Reset and Seed Script for Multi-Tenant Database
Drops all tables, recreates them, and populates with multi-tenant demo data
"""
import asyncio
from database import engine, Base
# Import all models so they register with Base.metadata
from models import Tenant, User, Product, Sale, SaleItem, StockMovement, tenant_users
from seed_multi_tenant_data import seed_data


async def reset_and_seed():
    """Reset database tables and seed with multi-tenant data"""
    print("🔄 Starting database reset and seed process...")
    print("⚠️  WARNING: This will delete ALL existing data!")

    confirm = input("Are you sure you want to continue? (yes/no): ")
    if confirm.lower() != "yes":
        print("❌ Operation cancelled.")
        return

    print("\n" + "="*60)
    print("STEP 1: DROPPING TABLES")
    print("="*60)
    print("\n🗑️  Dropping all existing tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    print("✅ All tables dropped!")

    print("\n" + "="*60)
    print("STEP 2: CREATING TABLES")
    print("="*60)
    print("\n🆕 Creating fresh tables with multi-tenant schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ All tables created!")

    print("\n" + "="*60)
    print("STEP 3: SEEDING MULTI-TENANT DATA")
    print("="*60)
    print()

    # Call the seed function from seed_multi_tenant_data.py
    await seed_data()

    print("\n" + "="*60)
    print("✅ DATABASE RESET AND SEED COMPLETE!")
    print("="*60)
    print("\n🚀 Next steps:")
    print("1. Start the server: python main.py")
    print("2. Access at: http://localhost:8000")
    print("\n📝 You can login with any of the credentials shown above")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(reset_and_seed())
