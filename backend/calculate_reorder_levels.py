"""
Reorder Level Auto-Calculation

This script automatically calculates reorder levels for all products based on:
- Sales data from the last 90 days
- Average daily sales
- Lead time (configurable per product, default 7 days)
- Safety stock (50% of demand during lead time)

Formula: Reorder Level = (Average Daily Sales × Lead Time) + Safety Stock

This should be run as a scheduled job (weekly or daily) to keep reorder levels up-to-date.
"""

import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import Product, Sale, SaleItem, Tenant
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def calculate_reorder_level_for_product(
    product: Product,
    db: AsyncSession,
    days_to_analyze: int = 90
) -> int:
    """
    Calculate optimal reorder level for a single product based on sales history.

    Args:
        product: Product model instance
        db: Database session
        days_to_analyze: Number of days to analyze (default 90)

    Returns:
        int: Calculated reorder level (minimum 5 units)
    """
    # Services don't need reorder levels
    if product.is_service:
        return 0

    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_to_analyze)

    # Get total quantity sold in the period
    result = await db.execute(
        select(func.sum(SaleItem.quantity))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            SaleItem.product_id == product.id,
            Sale.tenant_id == product.tenant_id,
            Sale.created_at >= start_date,
            Sale.created_at <= end_date,
            Sale.status == 'completed'  # Only count completed sales
        )
    )
    total_sold = result.scalar() or 0

    # If no sales history, use default
    if total_sold == 0:
        logger.info(f"Product {product.id} ({product.name}): No sales history, using default reorder level of 10")
        return 10

    # Calculate average daily sales
    avg_daily_sales = total_sold / days_to_analyze

    # Get lead time (default 7 days if not set)
    lead_time_days = product.lead_time_days or 7

    # Calculate demand during lead time
    demand_during_lead_time = avg_daily_sales * lead_time_days

    # Calculate safety stock (50% of demand during lead time)
    safety_stock = demand_during_lead_time * 0.5

    # Final reorder level
    reorder_level = demand_during_lead_time + safety_stock

    # Round up and enforce minimum of 5 units
    reorder_level = max(5, int(reorder_level + 0.5))

    logger.info(
        f"Product {product.id} ({product.name}): "
        f"Total sold in {days_to_analyze} days: {total_sold}, "
        f"Avg daily: {avg_daily_sales:.2f}, "
        f"Lead time: {lead_time_days} days, "
        f"Reorder level: {reorder_level}"
    )

    return reorder_level


async def calculate_reorder_levels_for_tenant(
    tenant_id: int,
    db: AsyncSession,
    days_to_analyze: int = 90
) -> dict:
    """
    Calculate reorder levels for all products in a tenant.

    Args:
        tenant_id: Tenant ID
        db: Database session
        days_to_analyze: Number of days to analyze

    Returns:
        dict: Statistics about the calculation
    """
    # Get all non-service products for tenant
    result = await db.execute(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.is_service == False
        )
    )
    products = result.scalars().all()

    if not products:
        logger.info(f"Tenant {tenant_id}: No products found")
        return {"products_processed": 0, "products_updated": 0}

    logger.info(f"Tenant {tenant_id}: Processing {len(products)} products")

    updated_count = 0
    for product in products:
        new_reorder_level = await calculate_reorder_level_for_product(product, db, days_to_analyze)

        # Update if changed
        if product.reorder_level != new_reorder_level:
            product.reorder_level = new_reorder_level
            updated_count += 1

    # Commit all changes
    await db.commit()

    return {
        "products_processed": len(products),
        "products_updated": updated_count
    }


async def calculate_reorder_levels_all_tenants(days_to_analyze: int = 90):
    """
    Calculate reorder levels for all active tenants.

    This is the main function to be called by a scheduled job.

    Args:
        days_to_analyze: Number of days to analyze (default 90)
    """
    logger.info("=" * 80)
    logger.info("Starting Reorder Level Auto-Calculation")
    logger.info(f"Analyzing sales data from the last {days_to_analyze} days")
    logger.info("=" * 80)

    async with AsyncSessionLocal() as db:
        # Get all active tenants
        result = await db.execute(
            select(Tenant).where(Tenant.is_active == True)
        )
        tenants = result.scalars().all()

        logger.info(f"Found {len(tenants)} active tenants")

        total_stats = {
            "tenants_processed": 0,
            "total_products_processed": 0,
            "total_products_updated": 0
        }

        for tenant in tenants:
            logger.info(f"\nProcessing tenant: {tenant.name} (ID: {tenant.id})")

            try:
                stats = await calculate_reorder_levels_for_tenant(
                    tenant.id,
                    db,
                    days_to_analyze
                )

                total_stats["tenants_processed"] += 1
                total_stats["total_products_processed"] += stats["products_processed"]
                total_stats["total_products_updated"] += stats["products_updated"]

                logger.info(
                    f"Tenant {tenant.name}: "
                    f"{stats['products_updated']}/{stats['products_processed']} products updated"
                )

            except Exception as e:
                logger.error(f"Error processing tenant {tenant.id}: {str(e)}")
                continue

    logger.info("\n" + "=" * 80)
    logger.info("Reorder Level Auto-Calculation Complete")
    logger.info("=" * 80)
    logger.info(f"Tenants processed: {total_stats['tenants_processed']}")
    logger.info(f"Total products processed: {total_stats['total_products_processed']}")
    logger.info(f"Total products updated: {total_stats['total_products_updated']}")
    logger.info("=" * 80)


if __name__ == "__main__":
    """
    Run this script manually or schedule it to run periodically.

    Examples:
    - Run daily: python calculate_reorder_levels.py
    - Use cron: 0 2 * * * cd /path/to/backend && python calculate_reorder_levels.py
    - Use systemd timer or APScheduler for more advanced scheduling
    """
    asyncio.run(calculate_reorder_levels_all_tenants())
