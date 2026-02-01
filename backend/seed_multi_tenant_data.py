"""
Multi-Tenant Seed Data Script
Creates sample tenants, users, products, and sales for testing
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, insert
from sqlalchemy.orm import selectinload

from database import async_session_maker
from models import (
    Tenant, User, Product, Sale, SaleItem, StockMovement,
    tenant_users, UserRole, OrderStatus, StockMovementType, SubscriptionPlan
)
from auth import get_password_hash


async def seed_data():
    async with async_session_maker() as db:
        print("🌱 Starting multi-tenant seed data generation...")
        
        # ============ CREATE TENANTS ============
        print("\n📦 Creating tenants...")
        
        # Tenant 1: Demo Business (default)
        demo_tenant = Tenant(
            name="Demo Business",
            subdomain="demo",
            slug="demo",
            owner_email="admin@demo.com",
            phone="+254712345678",
            address="Nairobi, Kenya",
            subscription_plan=SubscriptionPlan.PREMIUM,
            max_users=10,
            max_products=500,
            currency="KES",
            tax_rate=0.16,
            business_type="retail",
            is_active=True
        )
        db.add(demo_tenant)
        
        # Tenant 2: Acme Corporation
        acme_tenant = Tenant(
            name="Acme Corporation",
            subdomain="acme",
            slug="acme",
            owner_email="owner@acme.com",
            phone="+254723456789",
            address="Mombasa, Kenya",
            subscription_plan=SubscriptionPlan.BASIC,
            max_users=5,
            max_products=200,
            currency="KES",
            tax_rate=0.16,
            business_type="wholesale",
            is_active=True
        )
        db.add(acme_tenant)
        
        # Tenant 3: Globex Inc
        globex_tenant = Tenant(
            name="Globex Inc",
            subdomain="globex",
            slug="globex",
            owner_email="admin@globex.com",
            phone="+254734567890",
            address="Kisumu, Kenya",
            subscription_plan=SubscriptionPlan.FREE,
            max_users=3,
            max_products=50,
            currency="KES",
            tax_rate=0.16,
            business_type="restaurant",
            is_active=True
        )
        db.add(globex_tenant)
        
        await db.flush()  # Get tenant IDs
        print(f"✅ Created 3 tenants: {demo_tenant.name}, {acme_tenant.name}, {globex_tenant.name}")
        
        # ============ CREATE USERS ============
        print("\n👥 Creating users...")
        
        # Demo tenant users
        admin_demo = User(
            username="admin",
            email="admin@demo.com",
            hashed_password=get_password_hash("admin123"),
            full_name="Demo Admin",
            is_active=True
        )
        db.add(admin_demo)
        
        staff_demo = User(
            username="staff_demo",
            email="staff@demo.com",
            hashed_password=get_password_hash("staff123"),
            full_name="Demo Staff Member",
            is_active=True
        )
        db.add(staff_demo)
        
        # Acme tenant users
        admin_acme = User(
            username="acme_admin",
            email="admin@acme.com",
            hashed_password=get_password_hash("acme123"),
            full_name="Acme Administrator",
            is_active=True
        )
        db.add(admin_acme)
        
        # Globex tenant users
        admin_globex = User(
            username="globex_admin",
            email="admin@globex.com",
            hashed_password=get_password_hash("globex123"),
            full_name="Globex Manager",
            is_active=True
        )
        db.add(admin_globex)
        
        # Multi-tenant consultant
        consultant = User(
            username="consultant",
            email="consultant@example.com",
            hashed_password=get_password_hash("consultant123"),
            full_name="Business Consultant",
            is_active=True
        )
        db.add(consultant)
        
        await db.flush()  # Get user IDs
        print(f"✅ Created 5 users")
        
        # ============ LINK USERS TO TENANTS ============
        print("\n🔗 Linking users to tenants...")
        
        # Demo tenant memberships
        await db.execute(insert(tenant_users).values([
            {"tenant_id": demo_tenant.id, "user_id": admin_demo.id, "role": UserRole.ADMIN, "is_active": True},
            {"tenant_id": demo_tenant.id, "user_id": staff_demo.id, "role": UserRole.STAFF, "is_active": True},
            {"tenant_id": demo_tenant.id, "user_id": consultant.id, "role": UserRole.STAFF, "is_active": True},
        ]))
        
        # Acme tenant memberships
        await db.execute(insert(tenant_users).values([
            {"tenant_id": acme_tenant.id, "user_id": admin_acme.id, "role": UserRole.ADMIN, "is_active": True},
            {"tenant_id": acme_tenant.id, "user_id": consultant.id, "role": UserRole.STAFF, "is_active": True},
        ]))
        
        # Globex tenant memberships
        await db.execute(insert(tenant_users).values([
            {"tenant_id": globex_tenant.id, "user_id": admin_globex.id, "role": UserRole.ADMIN, "is_active": True},
            {"tenant_id": globex_tenant.id, "user_id": consultant.id, "role": UserRole.STAFF, "is_active": True},
        ]))
        
        print("✅ Linked users to tenants (consultant has access to all 3)")
        
        # ============ CREATE PRODUCTS FOR DEMO TENANT ============
        print(f"\n🏪 Creating products for {demo_tenant.name}...")
        
        demo_products = [
            Product(tenant_id=demo_tenant.id, name="Laptop Dell XPS", sku="TECH-001", description="15-inch laptop", 
                   base_cost=65000, selling_price=85000, quantity=15, category="Electronics", unit="pcs", reorder_level=5),
            Product(tenant_id=demo_tenant.id, name="Wireless Mouse", sku="TECH-002", description="Bluetooth mouse",
                   base_cost=800, selling_price=1200, quantity=50, category="Electronics", unit="pcs", reorder_level=10),
            Product(tenant_id=demo_tenant.id, name="Office Chair", sku="FURN-001", description="Ergonomic chair",
                   base_cost=8000, selling_price=12000, quantity=20, category="Furniture", unit="pcs", reorder_level=5),
            Product(tenant_id=demo_tenant.id, name="Desk Lamp", sku="FURN-002", description="LED desk lamp",
                   base_cost=1500, selling_price=2500, quantity=30, category="Furniture", unit="pcs", reorder_level=8),
            Product(tenant_id=demo_tenant.id, name="Notebook A4", sku="STAT-001", description="100 pages",
                   base_cost=50, selling_price=100, quantity=200, category="Stationery", unit="pcs", reorder_level=50),
            Product(tenant_id=demo_tenant.id, name="Ballpoint Pen", sku="STAT-002", description="Blue ink",
                   base_cost=10, selling_price=20, quantity=500, category="Stationery", unit="pcs", reorder_level=100),
            Product(tenant_id=demo_tenant.id, name="Coffee Maker", sku="APPL-001", description="12-cup capacity",
                   base_cost=3500, selling_price=5500, quantity=8, category="Appliances", unit="pcs", reorder_level=3),
            Product(tenant_id=demo_tenant.id, name="Rice 5kg", sku="FOOD-001", description="Basmati rice",
                   base_cost=450, selling_price=650, quantity=100, category="Food", unit="kg", reorder_level=20),
        ]
        
        for product in demo_products:
            db.add(product)
        
        await db.flush()
        print(f"✅ Created {len(demo_products)} products for Demo")
        
        # ============ CREATE PRODUCTS FOR ACME TENANT ============
        print(f"\n🏪 Creating products for {acme_tenant.name}...")
        
        acme_products = [
            Product(tenant_id=acme_tenant.id, name="Industrial Pump", sku="IND-001", description="High-pressure pump",
                   base_cost=45000, selling_price=65000, quantity=10, category="Industrial", unit="pcs", reorder_level=3),
            Product(tenant_id=acme_tenant.id, name="Safety Helmet", sku="SAFE-001", description="Construction helmet",
                   base_cost=500, selling_price=800, quantity=50, category="Safety", unit="pcs", reorder_level=15),
            Product(tenant_id=acme_tenant.id, name="Work Gloves", sku="SAFE-002", description="Leather gloves",
                   base_cost=200, selling_price=350, quantity=100, category="Safety", unit="pairs", reorder_level=25),
            Product(tenant_id=acme_tenant.id, name="Cement 50kg", sku="BUILD-001", description="Portland cement",
                   base_cost=650, selling_price=900, quantity=200, category="Building", unit="bags", reorder_level=50),
            Product(tenant_id=acme_tenant.id, name="Steel Rods 12mm", sku="BUILD-002", description="Construction rods",
                   base_cost=800, selling_price=1100, quantity=150, category="Building", unit="pcs", reorder_level=40),
        ]
        
        for product in acme_products:
            db.add(product)
        
        await db.flush()
        print(f"✅ Created {len(acme_products)} products for Acme")
        
        # ============ CREATE PRODUCTS FOR GLOBEX TENANT ============
        print(f"\n🏪 Creating products for {globex_tenant.name}...")
        
        globex_products = [
            Product(tenant_id=globex_tenant.id, name="Burger Patty", sku="FOOD-001", description="Beef patty 200g",
                   base_cost=150, selling_price=300, quantity=100, category="Food", unit="pcs", reorder_level=30),
            Product(tenant_id=globex_tenant.id, name="French Fries", sku="FOOD-002", description="Frozen fries 1kg",
                   base_cost=200, selling_price=400, quantity=50, category="Food", unit="kg", reorder_level=15),
            Product(tenant_id=globex_tenant.id, name="Soft Drink 500ml", sku="BEV-001", description="Cola",
                   base_cost=40, selling_price=80, quantity=200, category="Beverages", unit="bottles", reorder_level=50),
            Product(tenant_id=globex_tenant.id, name="Bottled Water 500ml", sku="BEV-002", description="Mineral water",
                   base_cost=20, selling_price=50, quantity=300, category="Beverages", unit="bottles", reorder_level=80),
        ]
        
        for product in globex_products:
            db.add(product)
        
        await db.flush()
        print(f"✅ Created {len(globex_products)} products for Globex")
        
        # ============ CREATE STOCK MOVEMENTS ============
        print("\n📊 Creating initial stock movements...")
        
        for product in demo_products:
            movement = StockMovement(
                product_id=product.id,
                user_id=admin_demo.id,
                movement_type=StockMovementType.IN,
                quantity=product.quantity,
                previous_stock=0,
                new_stock=product.quantity,
                notes="Initial stock"
            )
            db.add(movement)
        
        for product in acme_products:
            movement = StockMovement(
                product_id=product.id,
                user_id=admin_acme.id,
                movement_type=StockMovementType.IN,
                quantity=product.quantity,
                previous_stock=0,
                new_stock=product.quantity,
                notes="Initial stock"
            )
            db.add(movement)
        
        for product in globex_products:
            movement = StockMovement(
                product_id=product.id,
                user_id=admin_globex.id,
                movement_type=StockMovementType.IN,
                quantity=product.quantity,
                previous_stock=0,
                new_stock=product.quantity,
                notes="Initial stock"
            )
            db.add(movement)
        
        print("✅ Created stock movement records")
        
        # ============ CREATE SALES FOR DEMO TENANT ============
        print(f"\n💰 Creating sales for {demo_tenant.name}...")
        
        # Sale 1: Recent sale
        sale1 = Sale(
            tenant_id=demo_tenant.id,
            user_id=admin_demo.id,
            customer_name="John Doe",
            payment_method="M-Pesa",
            status=OrderStatus.COMPLETED,
            subtotal=0,
            tax=0,
            total=0
        )
        db.add(sale1)
        await db.flush()
        
        # Sale items for sale 1
        laptop = demo_products[0]
        mouse = demo_products[1]
        
        sale1_item1 = SaleItem(
            sale_id=sale1.id,
            product_id=laptop.id,
            quantity=2,
            price=laptop.selling_price,
            subtotal=laptop.selling_price * 2
        )
        sale1_item2 = SaleItem(
            sale_id=sale1.id,
            product_id=mouse.id,
            quantity=3,
            price=mouse.selling_price,
            subtotal=mouse.selling_price * 3
        )
        db.add(sale1_item1)
        db.add(sale1_item2)
        
        sale1.subtotal = sale1_item1.subtotal + sale1_item2.subtotal
        sale1.tax = sale1.subtotal * demo_tenant.tax_rate
        sale1.total = sale1.subtotal + sale1.tax
        
        # Update stock
        laptop.quantity -= 2
        mouse.quantity -= 3
        
        # Sale 2: Yesterday's sale
        sale2 = Sale(
            tenant_id=demo_tenant.id,
            user_id=staff_demo.id,
            customer_name="Jane Smith",
            payment_method="Cash",
            status=OrderStatus.COMPLETED,
            subtotal=0,
            tax=0,
            total=0,
            created_at=datetime.utcnow() - timedelta(days=1)
        )
        db.add(sale2)
        await db.flush()
        
        chair = demo_products[2]
        lamp = demo_products[3]
        
        sale2_item1 = SaleItem(
            sale_id=sale2.id,
            product_id=chair.id,
            quantity=1,
            price=chair.selling_price,
            subtotal=chair.selling_price
        )
        sale2_item2 = SaleItem(
            sale_id=sale2.id,
            product_id=lamp.id,
            quantity=2,
            price=lamp.selling_price,
            subtotal=lamp.selling_price * 2
        )
        db.add(sale2_item1)
        db.add(sale2_item2)
        
        sale2.subtotal = sale2_item1.subtotal + sale2_item2.subtotal
        sale2.tax = sale2.subtotal * demo_tenant.tax_rate
        sale2.total = sale2.subtotal + sale2.tax
        
        chair.quantity -= 1
        lamp.quantity -= 2
        
        print("✅ Created 2 sales for Demo tenant")
        
        # ============ CREATE SALES FOR ACME TENANT ============
        print(f"\n💰 Creating sales for {acme_tenant.name}...")
        
        sale3 = Sale(
            tenant_id=acme_tenant.id,
            user_id=admin_acme.id,
            customer_name="Construction Co.",
            payment_method="Card",
            status=OrderStatus.COMPLETED,
            subtotal=0,
            tax=0,
            total=0
        )
        db.add(sale3)
        await db.flush()
        
        cement = acme_products[3]
        gloves = acme_products[2]
        
        sale3_item1 = SaleItem(
            sale_id=sale3.id,
            product_id=cement.id,
            quantity=50,
            price=cement.selling_price,
            subtotal=cement.selling_price * 50
        )
        sale3_item2 = SaleItem(
            sale_id=sale3.id,
            product_id=gloves.id,
            quantity=20,
            price=gloves.selling_price,
            subtotal=gloves.selling_price * 20
        )
        db.add(sale3_item1)
        db.add(sale3_item2)
        
        sale3.subtotal = sale3_item1.subtotal + sale3_item2.subtotal
        sale3.tax = sale3.subtotal * acme_tenant.tax_rate
        sale3.total = sale3.subtotal + sale3.tax
        
        cement.quantity -= 50
        gloves.quantity -= 20
        
        print("✅ Created 1 sale for Acme tenant")
        
        # ============ CREATE SALES FOR GLOBEX TENANT ============
        print(f"\n💰 Creating sales for {globex_tenant.name}...")
        
        sale4 = Sale(
            tenant_id=globex_tenant.id,
            user_id=admin_globex.id,
            customer_name="Table 5",
            payment_method="Cash",
            status=OrderStatus.COMPLETED,
            subtotal=0,
            tax=0,
            total=0
        )
        db.add(sale4)
        await db.flush()
        
        burger = globex_products[0]
        fries = globex_products[1]
        soda = globex_products[2]
        
        sale4_item1 = SaleItem(
            sale_id=sale4.id,
            product_id=burger.id,
            quantity=2,
            price=burger.selling_price,
            subtotal=burger.selling_price * 2
        )
        sale4_item2 = SaleItem(
            sale_id=sale4.id,
            product_id=fries.id,
            quantity=2,
            price=fries.selling_price,
            subtotal=fries.selling_price * 2
        )
        sale4_item3 = SaleItem(
            sale_id=sale4.id,
            product_id=soda.id,
            quantity=2,
            price=soda.selling_price,
            subtotal=soda.selling_price * 2
        )
        db.add(sale4_item1)
        db.add(sale4_item2)
        db.add(sale4_item3)
        
        sale4.subtotal = sale4_item1.subtotal + sale4_item2.subtotal + sale4_item3.subtotal
        sale4.tax = sale4.subtotal * globex_tenant.tax_rate
        sale4.total = sale4.subtotal + sale4.tax
        
        burger.quantity -= 2
        fries.quantity -= 2
        soda.quantity -= 2
        
        print("✅ Created 1 sale for Globex tenant")
        
        # ============ COMMIT ALL CHANGES ============
        await db.commit()
        print("\n✅ All data committed to database!")
        
        # ============ SUMMARY ============
        print("\n" + "="*60)
        print("🎉 SEED DATA GENERATION COMPLETE!")
        print("="*60)
        print(f"\n📊 Summary:")
        print(f"  • Tenants: 3 (Demo, Acme, Globex)")
        print(f"  • Users: 5 (4 admins + 1 multi-tenant consultant)")
        print(f"  • Products: {len(demo_products) + len(acme_products) + len(globex_products)}")
        print(f"  • Sales: 4 (2 for Demo, 1 for Acme, 1 for Globex)")
        
        print(f"\n🔑 Login Credentials:")
        print(f"\n  Demo Tenant (subdomain: 'demo'):")
        print(f"    - Admin: admin / admin123")
        print(f"    - Staff: staff_demo / staff123")
        
        print(f"\n  Acme Tenant (subdomain: 'acme'):")
        print(f"    - Admin: acme_admin / acme123")
        
        print(f"\n  Globex Tenant (subdomain: 'globex'):")
        print(f"    - Admin: globex_admin / globex123")
        
        print(f"\n  Multi-Tenant Consultant (works in all 3):")
        print(f"    - consultant / consultant123")
        print(f"    - Can login to any subdomain")
        
        print("\n🚀 Ready to test! Start the server with: python main.py")
        print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(seed_data())
