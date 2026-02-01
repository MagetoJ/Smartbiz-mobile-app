"""
Subscription Scheduler - Background tasks for subscription management

This module handles:
1. Daily checks for expiring subscriptions
2. Email notifications at 7 days, 3 days, and 1 day before expiry
3. Email notifications when subscriptions expire
4. Deactivation of expired branch subscriptions

Run as a background task using APScheduler or as a cron job.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker
from models import (
    Tenant,
    ActiveBranchSubscription,
    User
)
from email_service import EmailService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def check_and_notify_expiring_subscriptions():
    """
    Check for subscriptions expiring in 7, 3, or 1 day(s) and send notifications.
    This function should be run once daily.
    """
    logger.info("🔍 Starting daily subscription expiry check...")

    async with async_session_maker() as db:
        email_service = EmailService()
        now = datetime.utcnow()

        # Define notification windows (days before expiry)
        notification_windows = [7, 3, 1]

        for days_before in notification_windows:
            target_date = now + timedelta(days=days_before)
            # Check for subscriptions expiring on this target date (within a 1-hour window)
            start_window = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_window = start_window + timedelta(days=1)

            logger.info(f"📅 Checking for subscriptions expiring in {days_before} day(s)...")

            # Find tenants whose next_billing_date is within this window
            result = await db.execute(
                select(Tenant).where(
                    and_(
                        Tenant.next_billing_date >= start_window,
                        Tenant.next_billing_date < end_window,
                        Tenant.subscription_status == 'active',
                        Tenant.owner_email.isnot(None)
                    )
                )
            )
            expiring_tenants = result.scalars().all()

            for tenant in expiring_tenants:
                try:
                    # Get unpaid branches for this tenant
                    unpaid_branches = await get_unpaid_branches(db, tenant.id)
                    unpaid_branch_names = [b['name'] for b in unpaid_branches]

                    # Send expiring notification
                    success = await email_service.send_subscription_expiring_notification(
                        tenant_name=tenant.name,
                        tenant_subdomain=tenant.subdomain,
                        admin_email=tenant.owner_email,
                        days_remaining=days_before,
                        subscription_end_date=tenant.next_billing_date.strftime("%B %d, %Y"),
                        unpaid_branches=unpaid_branch_names if unpaid_branch_names else None
                    )

                    if success:
                        logger.info(f"✅ Sent {days_before}-day expiry notification to {tenant.owner_email} for tenant '{tenant.name}'")
                    else:
                        logger.warning(f"⚠️ Failed to send notification to {tenant.owner_email}")

                except Exception as e:
                    logger.error(f"❌ Error sending notification for tenant {tenant.id}: {str(e)}")

    logger.info("✅ Daily subscription expiry check completed")


async def check_and_deactivate_expired_subscriptions():
    """
    Check for expired subscriptions and:
    1. Send expired notification emails
    2. Deactivate expired branch subscriptions
    3. Update tenant subscription status

    This function should be run once daily.
    """
    logger.info("🔍 Starting expired subscription check...")

    async with async_session_maker() as db:
        email_service = EmailService()
        now = datetime.utcnow()

        # Find tenants whose subscription expired recently (within last 24 hours)
        # This prevents sending multiple emails for the same expiration
        yesterday = now - timedelta(days=1)

        result = await db.execute(
            select(Tenant).where(
                and_(
                    Tenant.next_billing_date < now,
                    Tenant.next_billing_date >= yesterday,
                    Tenant.subscription_status == 'active',  # Still marked active, needs to be updated
                    Tenant.owner_email.isnot(None)
                )
            )
        )
        expired_tenants = result.scalars().all()

        logger.info(f"📊 Found {len(expired_tenants)} tenant(s) with recently expired subscriptions")

        for tenant in expired_tenants:
            try:
                # Get all branches for this tenant
                branches_result = await db.execute(
                    select(Tenant).where(
                        or_(
                            Tenant.id == tenant.id,
                            Tenant.parent_tenant_id == tenant.id
                        )
                    )
                )
                all_branches = branches_result.scalars().all()
                branch_names = [b.name for b in all_branches]

                # Send expired notification
                success = await email_service.send_subscription_expired_notification(
                    tenant_name=tenant.name,
                    tenant_subdomain=tenant.subdomain,
                    admin_email=tenant.owner_email,
                    expired_date=tenant.next_billing_date.strftime("%B %d, %Y"),
                    affected_branches=branch_names
                )

                if success:
                    logger.info(f"✅ Sent expired notification to {tenant.owner_email} for tenant '{tenant.name}'")

                # Update tenant subscription status to expired
                tenant.subscription_status = 'expired'

                # Deactivate all active branch subscriptions for this tenant
                await db.execute(
                    select(ActiveBranchSubscription).where(
                        and_(
                            ActiveBranchSubscription.parent_tenant_id == tenant.id,
                            ActiveBranchSubscription.subscription_end_date < now,
                            ActiveBranchSubscription.is_active == True
                        )
                    ).execution_options(synchronize_session=False)
                )

                # Mark all expired active branch subscriptions as inactive
                branch_subs_result = await db.execute(
                    select(ActiveBranchSubscription).where(
                        and_(
                            ActiveBranchSubscription.parent_tenant_id == tenant.id,
                            ActiveBranchSubscription.subscription_end_date < now,
                            ActiveBranchSubscription.is_active == True
                        )
                    )
                )
                expired_branch_subs = branch_subs_result.scalars().all()

                for branch_sub in expired_branch_subs:
                    branch_sub.is_active = False
                    branch_sub.updated_at = now

                logger.info(f"🔒 Deactivated {len(expired_branch_subs)} branch subscription(s) for tenant '{tenant.name}'")

                await db.commit()

            except Exception as e:
                logger.error(f"❌ Error processing expired tenant {tenant.id}: {str(e)}")
                await db.rollback()

    logger.info("✅ Expired subscription check completed")


async def get_unpaid_branches(db: AsyncSession, parent_tenant_id: int) -> List[Dict]:
    """
    Get list of unpaid branches for a tenant.

    Args:
        db: Database session
        parent_tenant_id: ID of the parent tenant

    Returns:
        List of dicts with branch details: [{"id": int, "name": str}, ...]
    """
    now = datetime.utcnow()

    # Get all branches for this tenant
    all_branches_result = await db.execute(
        select(Tenant).where(
            or_(
                Tenant.id == parent_tenant_id,
                Tenant.parent_tenant_id == parent_tenant_id
            )
        )
    )
    all_branches = all_branches_result.scalars().all()

    # Get active (paid) branch subscriptions
    active_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            and_(
                ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
                ActiveBranchSubscription.is_active == True,
                ActiveBranchSubscription.subscription_end_date > now
            )
        )
    )
    active_subs = active_subs_result.scalars().all()
    paid_branch_ids = {sub.branch_tenant_id for sub in active_subs}

    # Find unpaid branches (branches not in paid list)
    unpaid_branches = [
        {"id": branch.id, "name": branch.name}
        for branch in all_branches
        if branch.id not in paid_branch_ids
    ]

    return unpaid_branches


async def run_daily_subscription_checks():
    """
    Main entry point for daily subscription checks.
    Runs both expiring and expired subscription checks.
    """
    logger.info("=" * 60)
    logger.info("🚀 Starting daily subscription maintenance tasks...")
    logger.info("=" * 60)

    try:
        # Check for expiring subscriptions (7, 3, 1 day warnings)
        await check_and_notify_expiring_subscriptions()

        # Check for expired subscriptions
        await check_and_deactivate_expired_subscriptions()

        logger.info("=" * 60)
        logger.info("✅ All subscription maintenance tasks completed successfully")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"❌ Fatal error in subscription maintenance: {str(e)}")
        import traceback
        traceback.print_exc()


# ============================================================================
# Scheduler Setup (APScheduler)
# ============================================================================

def start_subscription_scheduler():
    """
    Start the APScheduler background scheduler.
    This runs the daily subscription checks at 9:00 AM UTC every day.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler()

    # Schedule daily checks at 9:00 AM UTC
    scheduler.add_job(
        run_daily_subscription_checks,
        CronTrigger(hour=9, minute=0),
        id='daily_subscription_checks',
        name='Daily Subscription Expiry Checks',
        replace_existing=True
    )

    scheduler.start()
    logger.info("📅 Subscription scheduler started - daily checks at 09:00 UTC")

    return scheduler


# ============================================================================
# Manual Testing / CLI Execution
# ============================================================================

async def test_notifications():
    """
    Test function to manually trigger notification checks.
    Run with: python subscription_scheduler.py
    """
    logger.info("🧪 Running subscription checks in test mode...")
    await run_daily_subscription_checks()


if __name__ == "__main__":
    # Run checks immediately for testing
    asyncio.run(test_notifications())
