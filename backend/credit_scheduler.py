"""
Credit Reminder Scheduler - Background tasks for credit transaction reminders

This module handles:
1. Daily checks for credit transactions approaching or past due dates
2. Escalating email reminders at 0, 3, 7, and 14 days after due date
3. Status updates (pending → overdue) for past-due transactions
4. Deduplication via ReminderLog to prevent repeated notifications

Run as a background task using APScheduler.
"""

import asyncio
import logging
from datetime import datetime, date
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from database import async_session_maker
from models import (
    CreditTransaction, CreditTransactionStatus,
    ReminderLog, Customer, Tenant
)
from email_service import EmailService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REMINDER_STAGES = [0, 3, 7, 14]  # Days after due_date


async def check_and_send_credit_reminders():
    """
    Check all non-paid credit transactions and send due/overdue reminders.
    Runs on a schedule (every 6 hours) to catch reminders throughout the day.
    """
    logger.info("🔍 Starting credit reminder check...")

    async with async_session_maker() as db:
        email_service = EmailService()
        today = date.today()

        # Find all non-paid credit transactions with customer and tenant loaded
        result = await db.execute(
            select(CreditTransaction)
            .options(
                selectinload(CreditTransaction.customer),
                selectinload(CreditTransaction.customer).selectinload(Customer.credit_transactions)
            )
            .join(Tenant, CreditTransaction.tenant_id == Tenant.id)
            .where(CreditTransaction.status != CreditTransactionStatus.PAID)
        )
        transactions = result.scalars().all()

        logger.info(f"📊 Found {len(transactions)} non-paid credit transaction(s) to check")

        for txn in transactions:
            days_since_due = (today - txn.due_date).days

            # Skip transactions not yet due (future due dates with no stage 0 yet)
            if days_since_due < 0:
                continue

            # Update status to overdue if past due date
            if days_since_due > 0 and txn.status != CreditTransactionStatus.OVERDUE:
                txn.status = CreditTransactionStatus.OVERDUE

            # Get tenant for business name
            tenant_result = await db.execute(
                select(Tenant).where(Tenant.id == txn.tenant_id)
            )
            tenant = tenant_result.scalar_one_or_none()
            if not tenant:
                continue

            for stage in REMINDER_STAGES:
                if days_since_due < stage:
                    break  # Haven't reached this stage yet

                # Check if reminder already sent for this stage
                log_result = await db.execute(
                    select(ReminderLog).where(
                        ReminderLog.credit_transaction_id == txn.id,
                        ReminderLog.reminder_stage == stage
                    )
                )
                if log_result.scalar_one_or_none():
                    continue  # Already sent

                # Send email if customer has email
                success = False
                error_msg = None
                if txn.customer and txn.customer.email:
                    try:
                        success = await email_service.send_credit_reminder_email(
                            customer_email=txn.customer.email,
                            customer_name=txn.customer.name,
                            business_name=tenant.name,
                            amount_due=txn.amount_due,
                            due_date=txn.due_date.strftime("%B %d, %Y"),
                            days_overdue=stage,
                            currency=tenant.currency or "KES"
                        )
                        if success:
                            logger.info(f"✅ Sent stage-{stage} reminder to {txn.customer.email} for TXN #{txn.id}")
                        else:
                            logger.warning(f"⚠️ Failed to send reminder email for TXN #{txn.id}")
                            error_msg = "Email send returned False"
                    except Exception as e:
                        logger.error(f"❌ Error sending reminder for TXN #{txn.id}: {str(e)}")
                        error_msg = str(e)
                else:
                    # No email - log as success (nothing to send)
                    success = True
                    logger.debug(f"⏭️ Skipping TXN #{txn.id} stage {stage} - no customer email")

                # Create ReminderLog
                db.add(ReminderLog(
                    credit_transaction_id=txn.id,
                    reminder_stage=stage,
                    success=success,
                    error_message=error_msg
                ))

        await db.commit()

    logger.info("✅ Credit reminder check completed")


async def run_credit_reminder_checks():
    """Main entry point for credit reminder checks."""
    logger.info("=" * 60)
    logger.info("🚀 Starting credit reminder maintenance...")
    logger.info("=" * 60)

    try:
        await check_and_send_credit_reminders()
        logger.info("=" * 60)
        logger.info("✅ Credit reminder maintenance completed successfully")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"❌ Fatal error in credit reminder maintenance: {str(e)}")
        import traceback
        traceback.print_exc()


# ============================================================================
# Scheduler Setup (APScheduler)
# ============================================================================

def start_credit_scheduler():
    """
    Start the APScheduler background scheduler for credit reminders.
    Runs every 6 hours to check for due/overdue credit transactions.
    """
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        run_credit_reminder_checks,
        IntervalTrigger(hours=6),
        id='credit_reminder_checks',
        name='Credit Reminder Email Checks',
        replace_existing=True
    )

    scheduler.start()
    logger.info("📅 Credit reminder scheduler started - checks every 6 hours")

    return scheduler


# ============================================================================
# Manual Testing / CLI Execution
# ============================================================================

async def test_credit_reminders():
    """
    Test function to manually trigger credit reminder checks.
    Run with: python credit_scheduler.py
    """
    logger.info("🧪 Running credit reminder checks in test mode...")
    await run_credit_reminder_checks()


if __name__ == "__main__":
    asyncio.run(test_credit_reminders())
