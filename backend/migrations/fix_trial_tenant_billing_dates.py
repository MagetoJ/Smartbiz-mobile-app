"""
Migration: Fix trial tenant billing dates
Sets next_billing_date = trial_ends_at for trial tenants that are missing next_billing_date

This fixes the "No billing cycle found" error when trial tenants try to add branches.
"""

from sqlalchemy import text
from database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def upgrade():
    """Fix trial tenants that have trial_ends_at but not next_billing_date"""

    with engine.connect() as conn:
        try:
            logger.info("=" * 60)
            logger.info("Fixing trial tenant billing dates...")
            logger.info("=" * 60)

            # First, count affected tenants
            result = conn.execute(text("""
                SELECT COUNT(*) FROM tenants
                WHERE subscription_status = 'trial'
                  AND trial_ends_at IS NOT NULL
                  AND next_billing_date IS NULL
            """))
            affected_count = result.scalar()
            logger.info(f"Found {affected_count} trial tenants with missing next_billing_date")

            if affected_count > 0:
                # Update trial tenants to set next_billing_date = trial_ends_at
                conn.execute(text("""
                    UPDATE tenants
                    SET next_billing_date = trial_ends_at
                    WHERE subscription_status = 'trial'
                      AND trial_ends_at IS NOT NULL
                      AND next_billing_date IS NULL
                """))
                conn.commit()
                logger.info(f"✅ Updated {affected_count} trial tenants")
            else:
                logger.info("✅ No tenants need fixing")

            # Also fix any tenants with trial status but missing trial_ends_at
            result = conn.execute(text("""
                SELECT COUNT(*) FROM tenants
                WHERE subscription_status = 'trial'
                  AND trial_ends_at IS NULL
            """))
            missing_trial_ends = result.scalar()

            if missing_trial_ends > 0:
                logger.info(f"Found {missing_trial_ends} trial tenants missing trial_ends_at")

                # Set trial_ends_at to 14 days from now for these tenants
                conn.execute(text("""
                    UPDATE tenants
                    SET trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '14 days',
                        next_billing_date = CURRENT_TIMESTAMP + INTERVAL '14 days'
                    WHERE subscription_status = 'trial'
                      AND trial_ends_at IS NULL
                """))
                conn.commit()
                logger.info(f"✅ Set trial period for {missing_trial_ends} tenants")

            logger.info("=" * 60)
            logger.info("✅ Migration completed successfully!")
            logger.info("=" * 60)

        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Migration failed: {e}")
            raise


def downgrade():
    """
    This migration is non-destructive, so downgrade is a no-op.
    We don't want to remove next_billing_date as it's needed for the app to function.
    """
    logger.info("Downgrade is a no-op for this migration (non-destructive change)")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        downgrade()
    else:
        upgrade()
