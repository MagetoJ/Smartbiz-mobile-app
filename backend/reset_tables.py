"""
Alternative Database Reset Script
Drops all tables and recreates them with the new multi-tenant schema
Use this if you don't have database creation permissions
"""
import asyncio
from database import engine, Base
# Import all models so they register with Base.metadata
from models import Tenant, User, Product, Sale, SaleItem, StockMovement, tenant_users


async def reset_tables():
    print("🔄 Resetting database tables for multi-tenant schema...")
    print("⚠️  WARNING: This will delete ALL existing data!")
    
    confirm = input("Are you sure you want to continue? (yes/no): ")
    if confirm.lower() != "yes":
        print("❌ Operation cancelled.")
        return
    
    print("\n🗑️  Dropping all existing tables...")
    async with engine.begin() as conn:
        # Drop all tables
        await conn.run_sync(Base.metadata.drop_all)
    
    print("✅ All tables dropped!")
    
    print("\n🆕 Creating fresh tables with new multi-tenant schema...")
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
    
    print("✅ All tables created with multi-tenant schema!")
    
    print("\n" + "="*60)
    print("✅ DATABASE TABLES RESET COMPLETE!")
    print("="*60)
    print("\n📦 Next steps:")
    print("1. Start the server: python main.py")
    print("2. The server will create default 'demo' tenant with admin/admin123")
    print("3. (Optional) Run: python seed_multi_tenant_data.py")
    print("\n🚀 Ready to go!")


if __name__ == "__main__":
    asyncio.run(reset_tables())
