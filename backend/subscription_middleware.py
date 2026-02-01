"""
Subscription Middleware
Enforces read-only access for unpaid branches
"""

from fastapi import HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
import logging

from database import get_db
from models import Tenant, ActiveBranchSubscription
from auth import get_current_tenant

logger = logging.getLogger(__name__)


async def check_branch_subscription_active(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
) -> Tenant:
    """
    Dependency to check if current branch has active subscription.

    Blocks write operations for unpaid branches.
    Allows all operations for paid branches and during trial period.

    Raises:
        HTTPException 403: If branch subscription is inactive

    Returns:
        Tenant: The current tenant if subscription is active
    """

    # Determine parent tenant ID
    parent_tenant_id = current_tenant.parent_tenant_id if current_tenant.parent_tenant_id else current_tenant.id
    current_branch_id = current_tenant.id

    # Get parent tenant to check overall subscription status
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one_or_none()

    if not parent_tenant:
        raise HTTPException(
            status_code=404,
            detail="Organization not found"
        )

    # Check if parent tenant is manually blocked by super admin
    if parent_tenant.is_manually_blocked:
        logger.warning(f"Write operation blocked for manually blocked tenant {parent_tenant_id}")
        raise HTTPException(
            status_code=403,
            detail="Your account has been blocked due to subscription issues. Please contact support or renew your subscription."
        )

    # If in trial period, allow all operations
    if parent_tenant.subscription_status == 'trial':
        if parent_tenant.trial_ends_at and parent_tenant.trial_ends_at > datetime.utcnow():
            return current_tenant

    # Check if this specific branch has active subscription
    active_sub_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.branch_tenant_id == current_branch_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.subscription_end_date > datetime.utcnow()
        )
    )
    active_sub = active_sub_result.scalar_one_or_none()

    if not active_sub:
        # Branch subscription is inactive - block write operations
        logger.warning(f"Write operation blocked for unpaid branch {current_branch_id}")
        raise HTTPException(
            status_code=403,
            detail="This branch subscription is inactive. Read-only access only. Contact your administrator to add this branch to your subscription."
        )

    # Subscription is active
    return current_tenant


async def get_branch_subscription_status(
    tenant_id: int,
    db: AsyncSession
) -> bool:
    """
    Helper function to check branch subscription status without raising exceptions.

    Args:
        tenant_id: The branch tenant ID to check
        db: Database session

    Returns:
        bool: True if branch is paid/active, False if unpaid
    """

    # Get tenant
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        return False

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get parent tenant to check trial status
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one_or_none()

    if not parent_tenant:
        return False

    # Check manual block
    if parent_tenant.is_manually_blocked:
        return False

    # If in trial period, consider as paid
    if parent_tenant.subscription_status == 'trial':
        if parent_tenant.trial_ends_at and parent_tenant.trial_ends_at > datetime.utcnow():
            return True

    # Check active subscription
    active_sub_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.branch_tenant_id == tenant_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.subscription_end_date > datetime.utcnow()
        )
    )
    active_sub = active_sub_result.scalar_one_or_none()

    return active_sub is not None
