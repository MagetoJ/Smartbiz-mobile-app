"""
Export Current Inventory - Pre-Migration Backup

Exports current inventory state to CSV for backup before batch pricing migration.

Usage:
    python export_inventory.py [--output path/to/file.csv]
"""

import asyncio
import sys
import csv
from datetime import datetime
from sqlalchemy import text
from database import async_session_maker


async def export_inventory(output_file: str = None):
    """Export all products with current quantities and pricing"""

    if not output_file:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"inventory_backup_{timestamp}.csv"

    print("=" * 70)
    print("INVENTORY EXPORT")
    print("=" * 70)
    print(f"\nExporting to: {output_file}\n")

    async with async_session_maker() as db:
        try:
            # Get all products with current state
            result = await db.execute(text("""
                SELECT
                    p.id,
                    t.name as tenant_name,
                    t.subdomain,
                    p.name as product_name,
                    p.sku,
                    c.name as category_name,
                    p.unit,
                    p.description,
                    p.base_cost,
                    p.selling_price,
                    p.quantity,
                    p.reorder_level,
                    p.is_service,
                    p.is_available,
                    p.created_at,
                    p.updated_at
                FROM products p
                JOIN tenants t ON p.tenant_id = t.id
                LEFT JOIN categories c ON p.category_id = c.id
                ORDER BY t.name, p.name
            """))

            products = result.fetchall()

            if not products:
                print("⚠️  No products found to export")
                return False

            # Write to CSV
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)

                # Write header
                writer.writerow([
                    'Product ID',
                    'Tenant Name',
                    'Subdomain',
                    'Product Name',
                    'SKU',
                    'Category',
                    'Unit',
                    'Description',
                    'Base Cost',
                    'Selling Price',
                    'Current Quantity',
                    'Reorder Level',
                    'Is Service',
                    'Is Available',
                    'Created At',
                    'Updated At'
                ])

                # Write product data
                total_value = 0
                physical_count = 0
                service_count = 0

                for row in products:
                    writer.writerow(row)

                    if not row[12]:  # is_service
                        physical_count += 1
                        total_value += (row[8] * row[10]) if row[8] and row[10] else 0
                    else:
                        service_count += 1

            print(f"✅ Successfully exported {len(products)} products")
            print(f"\n📊 Summary:")
            print(f"   Physical products: {physical_count}")
            print(f"   Services: {service_count}")
            print(f"   Total inventory value: KES {total_value:,.2f}")
            print(f"\n💾 Backup saved to: {output_file}")
            print("")
            print("⚠️  IMPORTANT: Keep this file safe!")
            print("   You'll need it to verify data after migration.")
            print("")

            return True

        except Exception as e:
            print(f"❌ Export failed: {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    # Parse command line arguments
    output_file = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_file = sys.argv[idx + 1]

    success = asyncio.run(export_inventory(output_file))
    sys.exit(0 if success else 1)
