"""
Migration: Create subscription_transactions table
Tracks all subscription payment transactions
"""

from sqlalchemy import text
from database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def upgrade():
    """Create subscription_transactions table"""
    
    with engine.connect() as conn:
        try:
            logger.info("Creating subscription_transactions table...")
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS subscription_transactions (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    
                    -- Payment Details
                    amount FLOAT NOT NULL,
                    currency VARCHAR(3) DEFAULT 'KES' NOT NULL,
                    billing_cycle VARCHAR(20) NOT NULL,
                    
                    -- Paystack Details
                    paystack_reference VARCHAR(100) UNIQUE NOT NULL,
                    paystack_status VARCHAR(20) NOT NULL,
                    paystack_customer_code VARCHAR(100),
                    paystack_authorization_code VARCHAR(100),
                    
                    -- Metadata
                    payment_method VARCHAR(50),
                    channel VARCHAR(50),
                    ip_address VARCHAR(50),
                    
                    -- Subscription Period
                    subscription_start_date TIMESTAMP NOT NULL,
                    subscription_end_date TIMESTAMP NOT NULL,
                    
                    -- Timestamps
                    payment_date TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                )
            """))
            conn.commit()
            logger.info("✅ Created subscription_transactions table")
            
            # Create indexes
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_subscription_txn_tenant 
                ON subscription_transactions(tenant_id)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_subscription_txn_reference 
                ON subscription_transactions(paystack_reference)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_subscription_txn_status 
                ON subscription_transactions(paystack_status)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_subscription_txn_date 
                ON subscription_transactions(payment_date)
            """))
            conn.commit()
            logger.info("✅ Created indexes")
            
            logger.info("✅ Migration completed successfully!")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Migration failed: {e}")
            raise


def downgrade():
    """Drop subscription_transactions table"""
    
    with engine.connect() as conn:
        try:
            logger.info("Dropping subscription_transactions table...")
            
            conn.execute(text("DROP TABLE IF EXISTS subscription_transactions CASCADE"))
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
