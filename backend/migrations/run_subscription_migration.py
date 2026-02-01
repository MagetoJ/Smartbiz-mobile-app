"""
Subscription System Migration
Adds subscription and payment tracking fields to support 14-day trials and Paystack billing
"""

import asyncio
from sqlalchemy import text
from database import async_session_maker, engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_subscription_migration():
    """Add subscription fields to tenants table and create subscription_transactions table"""
    
    async with async_session_maker() as session:
        try:
            logger.info("Starting subscription system migration...")
            
            # Check dialect
            is_sqlite = engine.dialect.name == "sqlite"
            
            # 1. Add subscription fields to tenants table
            if not is_sqlite:
                logger.info("Adding subscription fields to tenants table...")
                
                await session.execute(text("""
                    ALTER TABLE tenants 
                    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial',
                    ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS paystack_plan_code VARCHAR(50),
                    ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
                    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)
                """))
                
                logger.info("✅ Subscription fields added to tenants table")
            else:
                logger.info("ℹ️ Skipping ALTER TABLE for SQLite (create_all handles this)")
            
            # 2. Create subscription_transactions table
            if not is_sqlite:
                logger.info("Creating subscription_transactions table...")
                
                await session.execute(text("""
                    CREATE TABLE IF NOT EXISTS subscription_transactions (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        amount DECIMAL(10, 2) NOT NULL,
                        currency VARCHAR(3) DEFAULT 'KES',
                        billing_cycle VARCHAR(20) NOT NULL,
                        paystack_reference VARCHAR(255) UNIQUE NOT NULL,
                        paystack_status VARCHAR(50) DEFAULT 'pending',
                        paystack_authorization_code VARCHAR(255),
                        paystack_customer_code VARCHAR(255),
                        payment_date TIMESTAMP,
                        subscription_start_date TIMESTAMP NOT NULL,
                        subscription_end_date TIMESTAMP NOT NULL,
                        channel VARCHAR(50),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                
                logger.info("✅ subscription_transactions table created")
            else:
                logger.info("ℹ️ Skipping CREATE TABLE for SQLite (create_all handles this)")
            
            # 3. Create index for faster queries
            if not is_sqlite:
                await session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_subscription_transactions_tenant 
                    ON subscription_transactions(tenant_id)
                """))
                
                await session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_subscription_transactions_reference 
                    ON subscription_transactions(paystack_reference)
                """))
                
                logger.info("✅ Indexes created")
            
            # 4. Set trial_ends_at for existing tenants (14 days from now)
            logger.info("Setting trial period for existing tenants...")

            if is_sqlite:
                await session.execute(text("""
                    UPDATE tenants
                    SET trial_ends_at = DATETIME('now', '+14 days'),
                        subscription_status = 'trial'
                    WHERE trial_ends_at IS NULL
                """))
            else:
                await session.execute(text("""
                    UPDATE tenants
                    SET trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '14 days',
                        subscription_status = 'trial'
                    WHERE trial_ends_at IS NULL
                """))

            logger.info("✅ Trial periods set for existing tenants")

            # 5. Fix trial tenants missing next_billing_date
            # This fixes "No billing cycle found" error when trial tenants add branches
            logger.info("Fixing trial tenants with missing next_billing_date...")

            await session.execute(text("""
                UPDATE tenants
                SET next_billing_date = trial_ends_at
                WHERE subscription_status = 'trial'
                  AND trial_ends_at IS NOT NULL
                  AND next_billing_date IS NULL
            """))

            logger.info("✅ Fixed trial tenant billing dates")
            
            await session.commit()
            
            logger.info("=" * 60)
            logger.info("✅ Subscription migration completed successfully!")
            logger.info("=" * 60)
            
        except Exception as e:
            await session.rollback()
            logger.error(f"❌ Migration failed: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(run_subscription_migration())
