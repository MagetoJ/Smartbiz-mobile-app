"""
Backfill Subscription Expenses
Creates expense records for all historical subscription payments

This migration creates expense entries for all successful subscription transactions
that don't already have corresponding expense records. This ensures accurate
Net Profit calculations by including subscription costs in business expenses.

Run with: python -m migrations.backfill_subscription_expenses
"""

import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import sys
import os

# Add parent directory to path so we can import from backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import async_session_maker
from models import SubscriptionTransaction, Expense


async def backfill_subscription_expenses():
    """
    Create expense records for all successful subscription transactions
    that don't already have expense entries.
    
    This is idempotent - safe to run multiple times.
    """
    
    print("\n🔍 Starting backfill of subscription expenses...")
    print("=" * 60)
    
    async with async_session_maker() as db:
        # Get all successful transactions with payment dates
        result = await db.execute(
            select(SubscriptionTransaction).where(
                SubscriptionTransaction.paystack_status == 'success',
                SubscriptionTransaction.payment_date.isnot(None)
            ).order_by(SubscriptionTransaction.payment_date)
        )
        transactions = result.scalars().all()
        
        print(f"📊 Found {len(transactions)} successful subscription payments\n")
        
        if len(transactions) == 0:
            print("✅ No transactions to backfill")
            return
        
        created_count = 0
        skipped_count = 0
        
        for txn in transactions:
            # Check if expense already exists for this transaction
            # Match on tenant_id, type, amount, and date to avoid duplicates
            existing_result = await db.execute(
                select(Expense).where(
                    Expense.tenant_id == txn.tenant_id,
                    Expense.type == "Software Subscription",
                    Expense.amount == txn.amount,
                    Expense.expense_date == txn.payment_date.date()
                )
            )
            existing_expense = existing_result.scalar_one_or_none()
            
            if existing_expense:
                print(f"⏭️  Skipped: Tenant {txn.tenant_id} - KES {txn.amount} (already exists)")
                skipped_count += 1
                continue
            
            # Create expense record
            branch_count = txn.num_branches_included if txn.num_branches_included else 1
            
            expense = Expense(
                tenant_id=txn.tenant_id,
                type="Software Subscription",
                amount=txn.amount,
                description=f"{txn.billing_cycle.title()} subscription payment - {branch_count} location(s)",
                expense_date=txn.payment_date.date()
            )
            db.add(expense)
            
            print(f"✅ Created: Tenant {txn.tenant_id} - KES {txn.amount} ({txn.billing_cycle}) on {txn.payment_date.date()}")
            created_count += 1
        
        # Commit all changes
        await db.commit()
        
        print("\n" + "=" * 60)
        print(f"✅ Backfill complete!")
        print(f"   - Created: {created_count} expense records")
        print(f"   - Skipped: {skipped_count} existing records")
        print(f"   - Total:   {len(transactions)} transactions processed")
        print("=" * 60)
        
        if created_count > 0:
            print("\n💡 Your dashboard and expense reports now include all subscription costs!")
            print("   This will show accurate Net Profit calculations.\n")


async def main():
    """Main entry point for the migration"""
    try:
        await backfill_subscription_expenses()
    except Exception as e:
        print(f"\n❌ Error during backfill: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
