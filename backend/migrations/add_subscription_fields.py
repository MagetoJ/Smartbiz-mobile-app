"""
Migration: Add subscription tracking fields to tenants table
Adds trial tracking, payment tracking, and Paystack integration fields
"""

from sqlalchemy import text
from database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def upgrade():
    """Add subscription fields to tenants table"""
    
    with engine.connect() as conn:
        try:
            logger.info("Adding subscription tracking fields to tenants table...")
            
            # Add trial tracking
            conn.execute(text("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial'
            """))
            conn.commit()
            logger.info("✅ Added trial tracking fields")
            
            # Add Paystack integration fields
            conn.execute(text("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(100),
                ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(100),
                ADD COLUMN IF NOT EXISTS paystack_plan_code VARCHAR(100)
            """))
            conn.commit()
            logger.info("✅ Added Paystack integration fields")
            
            # Add payment tracking fields
            conn.execute(text("""
                ALTER TABLE tenants 
                ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP,
                ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
                ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
                ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)
            """))
            conn.commit()
            logger.info("✅ Added payment tracking fields")
            
            # Set trial_ends_at for existing tenants (14 days from creation)
            conn.execute(text("""
                UPDATE tenants 
                SET trial_ends_at = created_at + INTERVAL '14 days',
                    subscription_status = 'trial'
                WHERE trial_ends_at IS NULL
            """))
            conn.commit()
            logger.info("✅ Set trial_ends_at for existing tenants")
            
            # Create indexes for performance
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_tenants_subscription_status 
                ON tenants(subscription_status)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends 
                ON tenants(trial_ends_at)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_tenants_next_billing 
                ON tenants(next_billing_date)
            """))
            conn.commit()
            logger.info("✅ Created performance indexes")
            
            logger.info("✅ Migration completed successfully!")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Migration failed: {e}")
            raise


def downgrade():
    """Remove subscription fields from tenants table"""
    
    with engine.connect() as conn:
        try:
            logger.info("Removing subscription fields...")
            
            # Drop indexes
            conn.execute(text("DROP INDEX IF EXISTS idx_tenants_subscription_status"))
            conn.execute(text("DROP INDEX IF EXISTS idx_tenants_trial_ends"))
            conn.execute(text("DROP INDEX IF EXISTS idx_tenants_next_billing"))
            
            # Remove columns
            conn.execute(text("""
                ALTER TABLE tenants 
                DROP COLUMN IF EXISTS trial_ends_at,
                DROP COLUMN IF EXISTS subscription_status,
                DROP COLUMN IF EXISTS paystack_customer_code,
                DROP COLUMN IF EXISTS paystack_subscription_code,
                DROP COLUMN IF EXISTS paystack_plan_code,
                DROP COLUMN IF EXISTS last_payment_date,
                DROP COLUMN IF EXISTS next_billing_date,
                DROP COLUMN IF EXISTS payment_method,
                DROP COLUMN IF EXISTS billing_cycle
            """))
            conn.commit()
            
            logger.info("✅ Downgrade completed successfully!")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Downgrade failed: {e}")
            raise


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        downgrade()
    else:
        upgrade()
