"""
Subscription API Endpoints
Handles payment initialization, verification, and subscription management
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import logging

from database import get_db
from models import Tenant, User, SubscriptionTransaction, BranchSubscription, ActiveBranchSubscription, Expense
from auth import get_current_user
from paystack_service import paystack_service, SUBSCRIPTION_PLANS
from config import settings
from schemas import (
    SubscriptionInitializeRequest,
    SubscriptionInitializeResponse,
    SubscriptionVerifyResponse,
    SubscriptionStatusResponse,
    BranchSubscriptionStatus,
    SubscriptionStatusSummary,
    AvailableBranchesResponse,
    AvailableBranchesMainLocation,
    AvailableBranchInfo,
    AvailableBranchesPricing,
    AddBranchRequest,
    AddBranchResponse
)
import json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscription", tags=["subscription"])


@router.post("/initialize")
async def initialize_payment(
    request: SubscriptionInitializeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Initialize Paystack payment for subscription with per-branch selection"""

    # Get user's tenant (parent tenant)
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Validate selected_branch_ids - all must belong to organization
    selected_ids = request.selected_branch_ids
    branch_results = await db.execute(
        select(Tenant).where(
            Tenant.id.in_(selected_ids),
            ((Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id))
        )
    )
    selected_branches = branch_results.scalars().all()

    if len(selected_branches) != len(selected_ids):
        raise HTTPException(status_code=400, detail="Invalid branch selection")

    # Ensure main location is included
    main_included = any(b.id == parent_tenant_id for b in selected_branches)
    if not main_included:
        raise HTTPException(status_code=400, detail="Main location must be included in subscription")

    # Prepare branches data for pricing calculation
    branches_data = [
        {"id": b.id, "name": b.name, "is_main": b.id == parent_tenant_id}
        for b in selected_branches
    ]

    # Calculate pricing for selected branches
    pricing = paystack_service.calculate_total_for_selected_branches(
        request.billing_cycle,
        selected_ids,
        branches_data
    )

    # Initialize payment
    callback_url = f"{settings.FRONTEND_URL}/settings?tab=subscription&verify=true"

    payment_result = await paystack_service.initialize_transaction(
        email=tenant.owner_email,
        amount=pricing['total_amount_kobo'],
        billing_cycle=request.billing_cycle,
        tenant_id=parent_tenant_id,
        callback_url=callback_url
    )

    if payment_result['status']:
        # Get plan details for duration
        plan = paystack_service.get_plan_details(request.billing_cycle)

        # Create pending transaction record with branch selection metadata
        transaction = SubscriptionTransaction(
            tenant_id=parent_tenant_id,
            amount=pricing['total_amount_kes'],
            currency="KES",
            billing_cycle=request.billing_cycle,
            paystack_reference=payment_result['reference'],
            paystack_status='pending',
            subscription_start_date=datetime.utcnow(),
            subscription_end_date=datetime.utcnow() + timedelta(days=plan['duration_days']),
            num_branches_included=len(selected_ids),
            branch_selection_json=json.dumps(selected_ids),
            main_location_included=True
        )
        db.add(transaction)
        await db.commit()

        logger.info(f"✅ Payment initialized for tenant {parent_tenant_id}: {payment_result['reference']} - {len(selected_ids)} branches selected")

        return {
            "status": True,
            "authorization_url": payment_result['authorization_url'],
            "reference": payment_result['reference'],
            "pricing_breakdown": pricing
        }
    else:
        raise HTTPException(status_code=400, detail=payment_result.get('message', 'Payment initialization failed'))


@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Verify payment and activate subscription with per-branch records (idempotent)"""

    # Get transaction record first
    db_result = await db.execute(
        select(SubscriptionTransaction).where(
            SubscriptionTransaction.paystack_reference == reference
        )
    )
    transaction = db_result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Check if already verified - return existing data (idempotent behavior)
    if transaction.paystack_status == 'success':
        logger.info(f"🔄 Transaction {reference} already verified, returning cached result")
        return {
            "status": "success",
            "message": "Subscription already activated",
            "subscription_end_date": transaction.subscription_end_date,
            "amount_paid": transaction.amount
        }

    # Verify with Paystack
    result = await paystack_service.verify_transaction(reference)

    if not result['status']:
        raise HTTPException(status_code=400, detail="Verification failed")

    transaction_data = result['data']

    if transaction_data['status'] != 'success':
        raise HTTPException(status_code=400, detail="Payment not successful")

    # Update transaction
    transaction.paystack_status = 'success'
    transaction.payment_date = datetime.utcnow()
    transaction.paystack_customer_code = transaction_data['customer'].get('customer_code')
    transaction.channel = transaction_data.get('channel')

    if transaction_data.get('authorization'):
        transaction.paystack_authorization_code = transaction_data['authorization'].get('authorization_code')

    # Update parent tenant subscription
    parent_tenant_id = transaction.tenant_id
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    tenant = tenant_result.scalar_one()

    tenant.subscription_status = 'active'
    tenant.subscription_plan = 'PREMIUM'
    tenant.billing_cycle = transaction.billing_cycle
    tenant.last_payment_date = transaction.payment_date
    tenant.next_billing_date = transaction.subscription_end_date
    tenant.paystack_customer_code = transaction.paystack_customer_code
    tenant.payment_method = transaction_data.get('channel')

    # Parse selected branch IDs from transaction metadata
    selected_branch_ids = json.loads(transaction.branch_selection_json) if transaction.branch_selection_json else []

    # Create branch subscription records
    for branch_id in selected_branch_ids:
        # Check if branch exists
        branch_result = await db.execute(
            select(Tenant).where(Tenant.id == branch_id)
        )
        branch = branch_result.scalar_one_or_none()

        if not branch:
            logger.warning(f"Branch {branch_id} not found, skipping")
            continue

        is_main = (branch_id == parent_tenant_id)

        # Check if historical record already exists (idempotent)
        existing_branch_sub_result = await db.execute(
            select(BranchSubscription).where(
                BranchSubscription.transaction_id == transaction.id,
                BranchSubscription.tenant_id == branch_id
            )
        )
        existing_branch_sub = existing_branch_sub_result.scalar_one_or_none()

        # Create historical record only if it doesn't exist (branch_subscriptions)
        if not existing_branch_sub:
            branch_sub = BranchSubscription(
                transaction_id=transaction.id,
                tenant_id=branch_id,
                is_main_location=is_main
            )
            db.add(branch_sub)
        else:
            logger.info(f"🔄 BranchSubscription already exists for transaction {transaction.id}, branch {branch_id}")

        # Create or update active subscription record
        active_sub_result = await db.execute(
            select(ActiveBranchSubscription).where(
                ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
                ActiveBranchSubscription.branch_tenant_id == branch_id
            )
        )
        active_sub = active_sub_result.scalar_one_or_none()

        if active_sub:
            # Update existing record
            active_sub.is_active = True
            active_sub.subscription_start_date = transaction.subscription_start_date
            active_sub.subscription_end_date = transaction.subscription_end_date
            active_sub.last_transaction_id = transaction.id
            active_sub.updated_at = datetime.utcnow()
        else:
            # Create new record
            active_sub = ActiveBranchSubscription(
                parent_tenant_id=parent_tenant_id,
                branch_tenant_id=branch_id,
                is_active=True,
                subscription_start_date=transaction.subscription_start_date,
                subscription_end_date=transaction.subscription_end_date,
                last_transaction_id=transaction.id
            )
            db.add(active_sub)

    # AUTO-CREATE EXPENSE FOR SUBSCRIPTION PAYMENT
    # Subscription fees are business expenses and should be tracked for accurate Net Profit
    expense = Expense(
        tenant_id=parent_tenant_id,
        type="Software Subscription",
        amount=transaction.amount,
        description=f"{transaction.billing_cycle.title()} subscription payment - {len(selected_branch_ids)} location(s)",
        expense_date=transaction.payment_date.date()
    )
    db.add(expense)
    logger.info(f"💰 Expense record created for subscription payment: KES {transaction.amount}")

    await db.commit()

    logger.info(f"✅ Subscription activated for tenant {tenant.id} with {len(selected_branch_ids)} branches")

    # Send email notification if this was a branch addition (not regular subscription renewal)
    if transaction.main_location_included == False and transaction.num_branches_included == 1:
        # This is a single branch addition with pro-rata payment
        try:
            from email_service import EmailService

            email_service = EmailService()
            branch_id = selected_branch_ids[0]

            # Get branch details
            branch_result = await db.execute(
                select(Tenant).where(Tenant.id == branch_id)
            )
            branch = branch_result.scalar_one_or_none()

            if branch and tenant.owner_email:
                # Calculate days remaining
                days_remaining = (transaction.subscription_end_date - datetime.utcnow()).days

                await email_service.send_branch_added_confirmation(
                    tenant_name=tenant.name,
                    tenant_subdomain=tenant.subdomain,
                    admin_email=tenant.owner_email,
                    branch_name=branch.name,
                    amount_paid_kes=transaction.amount,
                    subscription_end_date=transaction.subscription_end_date.strftime("%B %d, %Y"),
                    is_prorata=True,
                    days_remaining=days_remaining
                )
                logger.info(f"📧 Branch addition confirmation email sent to {tenant.owner_email}")
        except Exception as e:
            logger.error(f"Failed to send branch addition email: {str(e)}")
            # Don't fail the entire transaction if email fails

    return {
        "status": "success",
        "message": "Subscription activated successfully!",
        "subscription_end_date": transaction.subscription_end_date,
        "amount_paid": transaction.amount
    }


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current subscription status with per-branch details"""

    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get all branches in the organization
    branches_result = await db.execute(
        select(Tenant).where(
            (Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id)
        ).order_by(Tenant.id)
    )
    all_branches = branches_result.scalars().all()

    # Get active branch subscriptions
    active_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.subscription_end_date > datetime.utcnow()
        )
    )
    active_subs = active_subs_result.scalars().all()
    active_subs_dict = {sub.branch_tenant_id: sub for sub in active_subs}

    # Build branch subscription status list
    branch_subscriptions = []
    paid_count = 0
    unpaid_count = 0

    for branch in all_branches:
        is_main = (branch.id == parent_tenant_id)
        active_sub = active_subs_dict.get(branch.id)

        is_paid = active_sub is not None
        is_cancelled = active_sub.is_cancelled if active_sub else False
        cancelled_at = active_sub.cancelled_at if active_sub else None

        if is_paid:
            paid_count += 1
        else:
            unpaid_count += 1

        branch_subscriptions.append(
            BranchSubscriptionStatus(
                tenant_id=branch.id,
                name=branch.name,
                subdomain=branch.subdomain,
                is_main=is_main,
                is_paid=is_paid,
                subscription_end_date=active_sub.subscription_end_date if active_sub else None,
                is_cancelled=is_cancelled,
                cancelled_at=cancelled_at
            )
        )

    # Calculate summary
    summary = SubscriptionStatusSummary(
        total_branches=len(all_branches),
        paid_branches=paid_count,
        unpaid_branches=unpaid_count
    )

    # Get parent tenant for overall status
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one()

    return SubscriptionStatusResponse(
        is_active=parent_tenant.subscription_status in ['trial', 'active'],
        subscription_status=parent_tenant.subscription_status,
        subscription_end_date=parent_tenant.next_billing_date,
        billing_cycle=parent_tenant.billing_cycle,
        branch_subscriptions=branch_subscriptions,
        summary=summary,
        trial_ends_at=parent_tenant.trial_ends_at,
        last_payment_date=parent_tenant.last_payment_date
    )


@router.get("/available-branches", response_model=AvailableBranchesResponse)
async def get_available_branches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all available branches with subscription status for selection UI"""

    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get all branches in the organization
    branches_result = await db.execute(
        select(Tenant).where(
            (Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id)
        ).order_by(Tenant.id)
    )
    all_branches = branches_result.scalars().all()

    # Get active branch subscriptions
    active_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.subscription_end_date > datetime.utcnow()
        )
    )
    active_subs = active_subs_result.scalars().all()
    active_subs_dict = {sub.branch_tenant_id: sub for sub in active_subs}

    # Separate main location and branches
    main_location = None
    branches = []

    for branch in all_branches:
        is_main = (branch.id == parent_tenant_id)
        active_sub = active_subs_dict.get(branch.id)
        is_paid = active_sub is not None

        if is_main:
            main_location = AvailableBranchesMainLocation(
                tenant_id=branch.id,
                name=branch.name,
                subdomain=branch.subdomain,
                is_paid=is_paid,
                required=True,
                subscription_end_date=active_sub.subscription_end_date if active_sub else None
            )
        else:
            branches.append(
                AvailableBranchInfo(
                    tenant_id=branch.id,
                    name=branch.name,
                    subdomain=branch.subdomain,
                    is_paid=is_paid,
                    is_active=branch.is_active,
                    subscription_end_date=active_sub.subscription_end_date if active_sub else None
                )
            )

    # Get pricing info (monthly as reference - base is KES 2,000/month)
    plan = paystack_service.get_plan_details('monthly')
    # Base price per month is KES 2,000
    base_price_kes = 2000  # Monthly base price for display
    branch_price_kes = base_price_kes * 0.8  # 20% discount for branches = KES 1,600

    pricing = AvailableBranchesPricing(
        main_price_kes=base_price_kes,
        branch_price_kes=branch_price_kes
    )

    return AvailableBranchesResponse(
        main_location=main_location,
        branches=branches,
        pricing=pricing
    )


@router.post("/add-branch", response_model=AddBranchResponse)
async def add_branch_to_subscription(
    request: AddBranchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a branch to existing subscription with pro-rata payment"""

    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get parent tenant
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one()

    # Check parent has active subscription
    if parent_tenant.subscription_status not in ['active', 'trial']:
        raise HTTPException(status_code=400, detail="No active subscription found. Please subscribe first.")

    # Determine billing end date based on subscription status
    # Trial tenants may have trial_ends_at but not next_billing_date
    if parent_tenant.subscription_status == 'trial':
        if not parent_tenant.trial_ends_at:
            raise HTTPException(status_code=400, detail="Trial period not configured. Please contact support.")
        billing_end_date = parent_tenant.trial_ends_at
        billing_cycle = parent_tenant.billing_cycle or 'monthly'  # Default for trial
    else:
        if not parent_tenant.next_billing_date:
            raise HTTPException(status_code=400, detail="No billing cycle found. Please contact support.")
        billing_end_date = parent_tenant.next_billing_date
        billing_cycle = parent_tenant.billing_cycle or 'monthly'

    # Validate branch belongs to organization
    branch_result = await db.execute(
        select(Tenant).where(
            Tenant.id == request.branch_id,
            ((Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id))
        )
    )
    branch = branch_result.scalar_one_or_none()

    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found or does not belong to your organization")

    # Check if branch is already subscribed
    existing_sub_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.branch_tenant_id == request.branch_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.subscription_end_date > datetime.utcnow()
        )
    )
    existing_sub = existing_sub_result.scalar_one_or_none()

    if existing_sub:
        raise HTTPException(status_code=400, detail="Branch is already subscribed")

    # Calculate days remaining in current cycle
    days_remaining = (billing_end_date - datetime.utcnow()).days

    if days_remaining <= 0:
        raise HTTPException(status_code=400, detail="Current subscription has expired. Please renew first.")
    prorata_pricing = paystack_service.calculate_prorata_price(billing_cycle, days_remaining)

    # Initialize payment with pro-rata amount
    callback_url = f"{settings.FRONTEND_URL}/settings?tab=subscription&verify=true"

    payment_result = await paystack_service.initialize_transaction(
        email=parent_tenant.owner_email,
        amount=prorata_pricing['prorata_amount_kobo'],
        billing_cycle=billing_cycle,
        tenant_id=parent_tenant_id,
        callback_url=callback_url
    )

    if payment_result['status']:
        # Create pending transaction with branch metadata
        transaction = SubscriptionTransaction(
            tenant_id=parent_tenant_id,
            amount=prorata_pricing['prorata_amount_kes'],
            currency="KES",
            billing_cycle=billing_cycle,
            paystack_reference=payment_result['reference'],
            paystack_status='pending',
            subscription_start_date=datetime.utcnow(),
            subscription_end_date=billing_end_date,  # Match existing subscription/trial end date
            num_branches_included=1,
            branch_selection_json=json.dumps([request.branch_id]),
            main_location_included=False  # This is a branch-only addition
        )
        db.add(transaction)
        await db.commit()

        logger.info(f"✅ Pro-rata payment initialized for branch {request.branch_id}: {payment_result['reference']}")

        return AddBranchResponse(
            authorization_url=payment_result['authorization_url'],
            reference=payment_result['reference'],
            amount_kes=prorata_pricing['prorata_amount_kes'],
            prorata_percentage=prorata_pricing['prorata_percentage'],
            days_remaining=days_remaining,
            message=f"Pro-rated payment for {days_remaining} days remaining in current cycle"
        )
    else:
        raise HTTPException(status_code=400, detail=payment_result.get('message', 'Payment initialization failed'))


@router.get("/history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment history for current tenant"""
    
    result = await db.execute(
        select(SubscriptionTransaction)
        .where(SubscriptionTransaction.tenant_id == current_user.tenants[0].id)
        .order_by(SubscriptionTransaction.created_at.desc())
    )
    transactions = result.scalars().all()
    
    return [
        {
            "id": t.id,
            "amount": t.amount,
            "currency": t.currency,
            "billing_cycle": t.billing_cycle,
            "status": t.paystack_status,
            "payment_date": t.payment_date.isoformat() if t.payment_date else None,
            "subscription_start_date": t.subscription_start_date.isoformat(),
            "subscription_end_date": t.subscription_end_date.isoformat(),
            "reference": t.paystack_reference
        }
        for t in transactions
    ]


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel subscription (will remain active until end of billing period)"""
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Allow cancellation of both 'active' paid subscriptions and 'trial' subscriptions
    if tenant.subscription_status not in ['active', 'trial']:
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    tenant.subscription_status = 'cancelled'
    await db.commit()
    
    logger.info(f"✅ Subscription cancelled for tenant {tenant.id}")
    
    return {
        "status": True,
        "message": "Subscription cancelled. Access will continue until end of billing period.",
        "access_until": tenant.next_billing_date.isoformat() if tenant.next_billing_date else None
    }


@router.post("/reactivate")
async def reactivate_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reactivate a cancelled subscription"""

    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if tenant.subscription_status != 'cancelled':
        raise HTTPException(status_code=400, detail="Only cancelled subscriptions can be reactivated")

    # Check if subscription hasn't expired yet
    if tenant.next_billing_date and tenant.next_billing_date < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Subscription has expired. Please purchase a new subscription."
        )

    # Reactivate the subscription - restore to original status (trial or active)
    # If trial_ends_at exists and hasn't passed, restore to 'trial', otherwise 'active'
    if tenant.trial_ends_at and tenant.trial_ends_at > datetime.utcnow():
        tenant.subscription_status = 'trial'
    else:
        tenant.subscription_status = 'active'

    await db.commit()

    logger.info(f"✅ Subscription reactivated for tenant {tenant.id} (status: {tenant.subscription_status})")

    return {
        "status": True,
        "message": "Subscription reactivated successfully!",
        "subscription_status": tenant.subscription_status,
        "next_billing_date": tenant.next_billing_date.isoformat() if tenant.next_billing_date else None
    }


@router.post("/cancel-branch/{branch_tenant_id}")
async def cancel_branch_subscription(
    branch_tenant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel subscription for a specific branch (will remain active until end of billing period)"""

    # Get the user's tenant (could be parent or branch)
    if not current_user.tenants:
        raise HTTPException(status_code=404, detail="User has no associated tenant")

    user_tenant = current_user.tenants[0]

    # Determine parent tenant ID (if user_tenant is branch, use its parent; otherwise use itself)
    parent_tenant_id = user_tenant.parent_tenant_id if user_tenant.parent_tenant_id else user_tenant.id

    # Get parent tenant object
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one_or_none()

    if not parent_tenant:
        raise HTTPException(status_code=404, detail="Parent organization not found")

    # Verify the branch belongs to this organization (either IS the main location OR has matching parent_tenant_id)
    branch_result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_tenant_id,
            ((Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id))
        )
    )
    branch_tenant = branch_result.scalar_one_or_none()

    if not branch_tenant:
        raise HTTPException(status_code=404, detail="Branch not found or does not belong to your organization")

    # Get the ActiveBranchSubscription record
    active_sub_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.branch_tenant_id == branch_tenant_id
        )
    )
    active_sub = active_sub_result.scalar_one_or_none()

    if not active_sub:
        raise HTTPException(status_code=404, detail="No active subscription found for this branch")

    # Validate not already cancelled
    if active_sub.is_cancelled:
        raise HTTPException(status_code=400, detail="Branch subscription is already cancelled")

    # Mark as cancelled
    active_sub.is_cancelled = True
    active_sub.cancelled_at = datetime.utcnow()

    # Remove from saved_branch_selection_json for auto-renewal
    if parent_tenant.saved_branch_selection_json:
        try:
            saved_branches = json.loads(parent_tenant.saved_branch_selection_json)
            if branch_tenant_id in saved_branches:
                saved_branches.remove(branch_tenant_id)
                parent_tenant.saved_branch_selection_json = json.dumps(saved_branches)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Failed to update saved_branch_selection_json: {e}")

    await db.commit()

    logger.info(f"✅ Branch subscription cancelled: Parent={parent_tenant_id}, Branch={branch_tenant_id}")

    # Check if this is the main location
    is_main_location = branch_tenant.is_main_location if hasattr(branch_tenant, 'is_main_location') else False

    return {
        "status": True,
        "message": "Branch subscription cancelled. Access will continue until end of billing period.",
        "access_until": active_sub.subscription_end_date.isoformat() if active_sub.subscription_end_date else None,
        "is_main_location": is_main_location,
        "branch_name": branch_tenant.name
    }


@router.post("/reactivate-branch/{branch_tenant_id}")
async def reactivate_branch_subscription(
    branch_tenant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reactivate a cancelled branch subscription (must not be expired)"""

    # Get the user's tenant (could be parent or branch)
    if not current_user.tenants:
        raise HTTPException(status_code=404, detail="User has no associated tenant")

    user_tenant = current_user.tenants[0]

    # Determine parent tenant ID (if user_tenant is branch, use its parent; otherwise use itself)
    parent_tenant_id = user_tenant.parent_tenant_id if user_tenant.parent_tenant_id else user_tenant.id

    # Get parent tenant object
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one_or_none()

    if not parent_tenant:
        raise HTTPException(status_code=404, detail="Parent organization not found")

    # Verify the branch belongs to this organization (either IS the main location OR has matching parent_tenant_id)
    branch_result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_tenant_id,
            ((Tenant.id == parent_tenant_id) | (Tenant.parent_tenant_id == parent_tenant_id))
        )
    )
    branch_tenant = branch_result.scalar_one_or_none()

    if not branch_tenant:
        raise HTTPException(status_code=404, detail="Branch not found or does not belong to your organization")

    # Get the ActiveBranchSubscription record
    active_sub_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.branch_tenant_id == branch_tenant_id
        )
    )
    active_sub = active_sub_result.scalar_one_or_none()

    if not active_sub:
        raise HTTPException(status_code=404, detail="No subscription found for this branch")

    # Validate is currently cancelled
    if not active_sub.is_cancelled:
        raise HTTPException(status_code=400, detail="Branch subscription is not cancelled")

    # Validate subscription hasn't expired
    if active_sub.subscription_end_date < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Branch subscription has expired. Please renew or add it to your subscription."
        )

    # Reactivate the branch
    active_sub.is_cancelled = False
    active_sub.cancelled_at = None

    # Add back to saved_branch_selection_json for auto-renewal
    if parent_tenant.saved_branch_selection_json:
        try:
            saved_branches = json.loads(parent_tenant.saved_branch_selection_json)
            if branch_tenant_id not in saved_branches:
                saved_branches.append(branch_tenant_id)
                parent_tenant.saved_branch_selection_json = json.dumps(saved_branches)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Failed to update saved_branch_selection_json: {e}")
    else:
        # Create new saved selection with just this branch
        parent_tenant.saved_branch_selection_json = json.dumps([branch_tenant_id])

    await db.commit()

    logger.info(f"✅ Branch subscription reactivated: Parent={parent_tenant_id}, Branch={branch_tenant_id}")

    return {
        "status": True,
        "message": "Branch subscription reactivated successfully!",
        "subscription_end_date": active_sub.subscription_end_date.isoformat() if active_sub.subscription_end_date else None,
        "branch_name": branch_tenant.name
    }


class UpgradeSubscriptionRequest(BaseModel):
    """Request to upgrade to a longer billing cycle"""
    new_billing_cycle: str  # 'quarterly', 'semi_annual', or 'annual'


@router.post("/upgrade")
async def upgrade_subscription(
    request: UpgradeSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upgrade from a shorter billing cycle to a longer one with pro-rata credit.

    Calculates remaining value of current subscription and applies it as credit
    toward the new longer-term plan.
    """
    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get parent tenant
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one()

    # Check if tenant has an active subscription
    if parent_tenant.subscription_status not in ['active', 'trial']:
        raise HTTPException(
            status_code=400,
            detail="No active subscription found. Please subscribe first."
        )

    current_billing_cycle = parent_tenant.billing_cycle
    new_billing_cycle = request.new_billing_cycle

    # Validate new billing cycle is longer than current
    cycle_order = {'monthly': 1, 'quarterly': 2, 'semi_annual': 3, 'annual': 4}

    if new_billing_cycle not in cycle_order:
        raise HTTPException(status_code=400, detail=f"Invalid billing cycle: {new_billing_cycle}")

    if current_billing_cycle and cycle_order.get(current_billing_cycle, 0) >= cycle_order[new_billing_cycle]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot upgrade from {current_billing_cycle} to {new_billing_cycle}. New plan must be longer."
        )

    # Get current and new plan details
    current_plan = SUBSCRIPTION_PLANS.get(current_billing_cycle) if current_billing_cycle else None
    new_plan = SUBSCRIPTION_PLANS.get(new_billing_cycle)

    if not new_plan:
        raise HTTPException(status_code=400, detail=f"Invalid billing cycle: {new_billing_cycle}")

    # Calculate days remaining in current subscription
    if parent_tenant.subscription_status == 'trial':
        if not parent_tenant.trial_ends_at:
            raise HTTPException(status_code=400, detail="Trial period not configured.")
        days_remaining = max(0, (parent_tenant.trial_ends_at - datetime.utcnow()).days)
        # For trial, no credit is given - they pay full price
        remaining_value_kobo = 0
    else:
        if not parent_tenant.next_billing_date:
            raise HTTPException(status_code=400, detail="No billing date found.")

        days_remaining = max(0, (parent_tenant.next_billing_date - datetime.utcnow()).days)

        # Calculate remaining value from current subscription
        if current_plan:
            total_days = current_plan['duration_days']
            current_amount = current_plan['amount']  # in kobo
            remaining_value_kobo = int((days_remaining / total_days) * current_amount)
        else:
            remaining_value_kobo = 0

    # Get active branch subscriptions to determine how many branches to include
    active_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.is_cancelled == False
        )
    )
    active_subs = active_subs_result.scalars().all()
    selected_branch_ids = [sub.branch_tenant_id for sub in active_subs]

    if not selected_branch_ids:
        # Default to just the main location
        selected_branch_ids = [parent_tenant_id]

    # Get branches data for pricing calculation
    branches_result = await db.execute(
        select(Tenant).where(Tenant.id.in_(selected_branch_ids))
    )
    branches = branches_result.scalars().all()
    branches_data = [
        {"id": b.id, "name": b.name, "is_main": (b.id == parent_tenant_id)}
        for b in branches
    ]

    # Calculate new plan cost
    pricing = paystack_service.calculate_total_for_selected_branches(
        new_billing_cycle,
        selected_branch_ids,
        branches_data
    )

    new_plan_cost_kobo = pricing['total_amount_kobo']

    # Calculate amount to pay (new plan cost minus remaining credit)
    amount_to_pay_kobo = max(0, new_plan_cost_kobo - remaining_value_kobo)

    # Initialize payment if amount > 0
    if amount_to_pay_kobo > 0:
        callback_url = f"{settings.FRONTEND_URL}/settings?tab=subscription&verify=true&upgrade=true"

        payment_result = await paystack_service.initialize_transaction(
            email=parent_tenant.owner_email,
            amount=amount_to_pay_kobo,
            billing_cycle=new_billing_cycle,
            tenant_id=parent_tenant_id,
            callback_url=callback_url
        )

        if payment_result['status']:
            # Create pending transaction record
            transaction = SubscriptionTransaction(
                tenant_id=parent_tenant_id,
                amount=amount_to_pay_kobo / 100,  # Convert to KES
                currency="KES",
                billing_cycle=new_billing_cycle,
                paystack_reference=payment_result['reference'],
                paystack_status='pending',
                subscription_start_date=datetime.utcnow(),
                subscription_end_date=datetime.utcnow() + timedelta(days=new_plan['duration_days']),
                num_branches_included=len(selected_branch_ids),
                branch_selection_json=json.dumps(selected_branch_ids),
                main_location_included=True
            )
            db.add(transaction)
            await db.commit()

            logger.info(f"✅ Upgrade payment initialized for tenant {parent_tenant_id}: {payment_result['reference']}")

            return {
                "status": True,
                "authorization_url": payment_result['authorization_url'],
                "reference": payment_result['reference'],
                "upgrade_details": {
                    "current_plan": current_billing_cycle,
                    "new_plan": new_billing_cycle,
                    "days_remaining": days_remaining,
                    "remaining_credit_kes": remaining_value_kobo / 100,
                    "new_plan_cost_kes": new_plan_cost_kobo / 100,
                    "amount_to_pay_kes": amount_to_pay_kobo / 100,
                    "branches_included": len(selected_branch_ids)
                }
            }
        else:
            raise HTTPException(status_code=400, detail=payment_result.get('message', 'Payment initialization failed'))
    else:
        # Credit covers the entire new plan - activate immediately
        parent_tenant.billing_cycle = new_billing_cycle
        parent_tenant.next_billing_date = datetime.utcnow() + timedelta(days=new_plan['duration_days'])

        # Update active branch subscriptions
        for active_sub in active_subs:
            active_sub.subscription_end_date = parent_tenant.next_billing_date

        await db.commit()

        logger.info(f"✅ Upgrade completed for tenant {parent_tenant_id} using credit")

        return {
            "status": True,
            "message": "Upgrade completed! Your remaining credit covered the new plan.",
            "upgrade_details": {
                "current_plan": current_billing_cycle,
                "new_plan": new_billing_cycle,
                "new_end_date": parent_tenant.next_billing_date.isoformat(),
                "credit_used_kes": remaining_value_kobo / 100
            }
        }


@router.get("/upgrade-preview/{new_billing_cycle}")
async def preview_upgrade(
    new_billing_cycle: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Preview upgrade costs without initiating payment.
    Shows pro-rata calculation for upgrading to a longer billing cycle.
    """
    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Determine parent tenant ID
    parent_tenant_id = tenant.parent_tenant_id if tenant.parent_tenant_id else tenant.id

    # Get parent tenant
    parent_result = await db.execute(
        select(Tenant).where(Tenant.id == parent_tenant_id)
    )
    parent_tenant = parent_result.scalar_one()

    current_billing_cycle = parent_tenant.billing_cycle

    # Validate new billing cycle
    cycle_order = {'monthly': 1, 'quarterly': 2, 'semi_annual': 3, 'annual': 4}

    if new_billing_cycle not in cycle_order:
        raise HTTPException(status_code=400, detail=f"Invalid billing cycle: {new_billing_cycle}")

    current_plan = SUBSCRIPTION_PLANS.get(current_billing_cycle) if current_billing_cycle else None
    new_plan = SUBSCRIPTION_PLANS.get(new_billing_cycle)

    if not new_plan:
        raise HTTPException(status_code=400, detail=f"Invalid billing cycle: {new_billing_cycle}")

    # Check if upgrade is possible
    can_upgrade = True
    upgrade_message = None

    if parent_tenant.subscription_status not in ['active', 'trial']:
        can_upgrade = False
        upgrade_message = "No active subscription. Please subscribe first."
    elif current_billing_cycle and cycle_order.get(current_billing_cycle, 0) >= cycle_order[new_billing_cycle]:
        can_upgrade = False
        upgrade_message = f"Already on {current_billing_cycle} plan or longer."

    # Calculate days remaining
    if parent_tenant.subscription_status == 'trial':
        days_remaining = max(0, (parent_tenant.trial_ends_at - datetime.utcnow()).days) if parent_tenant.trial_ends_at else 0
        remaining_value_kobo = 0
    elif parent_tenant.next_billing_date:
        days_remaining = max(0, (parent_tenant.next_billing_date - datetime.utcnow()).days)
        if current_plan:
            total_days = current_plan['duration_days']
            current_amount = current_plan['amount']
            remaining_value_kobo = int((days_remaining / total_days) * current_amount)
        else:
            remaining_value_kobo = 0
    else:
        days_remaining = 0
        remaining_value_kobo = 0

    # Get active branches
    active_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
            ActiveBranchSubscription.is_active == True,
            ActiveBranchSubscription.is_cancelled == False
        )
    )
    active_subs = active_subs_result.scalars().all()
    selected_branch_ids = [sub.branch_tenant_id for sub in active_subs] or [parent_tenant_id]

    # Get branches data
    branches_result = await db.execute(
        select(Tenant).where(Tenant.id.in_(selected_branch_ids))
    )
    branches = branches_result.scalars().all()
    branches_data = [
        {"id": b.id, "name": b.name, "is_main": (b.id == parent_tenant_id)}
        for b in branches
    ]

    # Calculate new plan cost
    pricing = paystack_service.calculate_total_for_selected_branches(
        new_billing_cycle,
        selected_branch_ids,
        branches_data
    )

    new_plan_cost_kobo = pricing['total_amount_kobo']
    amount_to_pay_kobo = max(0, new_plan_cost_kobo - remaining_value_kobo)

    return {
        "can_upgrade": can_upgrade,
        "message": upgrade_message,
        "current_plan": current_billing_cycle,
        "new_plan": new_billing_cycle,
        "new_plan_name": new_plan['name'],
        "days_remaining": days_remaining,
        "remaining_credit_kes": remaining_value_kobo / 100,
        "new_plan_cost_kes": new_plan_cost_kobo / 100,
        "amount_to_pay_kes": amount_to_pay_kobo / 100,
        "branches_included": len(selected_branch_ids),
        "new_duration_days": new_plan['duration_days'],
        "monthly_equivalent_kes": new_plan.get('monthly_equivalent', new_plan['amount'] / 100)
    }


@router.get("/plans")
async def get_available_plans():
    """Get all available subscription plans with monthly equivalent pricing"""

    # Savings map based on KES 2,000/month base price
    # Monthly: KES 2,000 x 1 = KES 2,000 (0 savings)
    # Quarterly: KES 2,000 x 3 = KES 6,000 - KES 5,400 = KES 600 savings
    # Semi-annual: KES 2,000 x 6 = KES 12,000 - KES 9,720 = KES 2,280 savings
    # Annual: KES 2,000 x 12 = KES 24,000 - KES 18,360 = KES 5,640 savings
    savings_map = {
        'monthly': 0,
        'quarterly': 600,
        'semi_annual': 2280,
        'annual': 5640
    }

    return {
        "plans": [
            {
                "id": key,
                "name": plan['name'],
                "amount": plan['amount'] / 100,  # Convert to KES (total price)
                "amount_kobo": plan['amount'],
                "monthly_equivalent": plan.get('monthly_equivalent', plan['amount'] / 100),
                "interval": plan['interval'],
                "duration_days": plan['duration_days'],
                "description": plan['description'],
                "savings": savings_map.get(key, 0)
            }
            for key, plan in SUBSCRIPTION_PLANS.items()
        ],
        "currency": "KES",
        "trial_period_days": settings.TRIAL_PERIOD_DAYS
    }


@router.get("/calculate-price/{billing_cycle}")
async def calculate_price(
    billing_cycle: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Calculate subscription price including branches (80% discount per branch)"""
    
    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Count number of branches
    branch_count_result = await db.execute(
        select(func.count(Tenant.id)).where(Tenant.parent_tenant_id == tenant.id)
    )
    num_branches = branch_count_result.scalar() or 0
    
    # Calculate total with branches
    pricing = paystack_service.calculate_total_with_branches(billing_cycle, num_branches)

    return pricing


# ==================== AUTO-RENEWAL ENDPOINTS ====================

@router.post("/enable-auto-renewal")
async def enable_auto_renewal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Enable auto-renewal for current subscription.
    Creates a Paystack subscription for automatic recurring payments.
    Requires an active subscription with saved payment authorization.
    """
    # Get user's tenant (parent)
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    parent_tenant_id = tenant.parent_tenant_id or tenant.id

    # Get parent tenant
    if parent_tenant_id != tenant.id:
        result = await db.execute(
            select(Tenant).where(Tenant.id == parent_tenant_id)
        )
        tenant = result.scalar_one()

    # Check if tenant has an active subscription
    if not tenant.next_billing_date or tenant.next_billing_date <= datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="No active subscription found. Please subscribe first before enabling auto-renewal."
        )

    # Check if already has auto-renewal enabled
    if tenant.auto_renewal_enabled and tenant.paystack_subscription_code:
        raise HTTPException(
            status_code=400,
            detail="Auto-renewal is already enabled for this subscription."
        )

    # Get the last successful transaction to retrieve authorization code
    last_tx_result = await db.execute(
        select(SubscriptionTransaction).where(
            SubscriptionTransaction.tenant_id == parent_tenant_id,
            SubscriptionTransaction.paystack_status == 'success',
            SubscriptionTransaction.paystack_authorization_code.isnot(None)
        ).order_by(SubscriptionTransaction.created_at.desc()).limit(1)
    )
    last_transaction = last_tx_result.scalar_one_or_none()

    if not last_transaction or not last_transaction.paystack_authorization_code:
        raise HTTPException(
            status_code=400,
            detail="No saved payment method found. Please make a payment first to enable auto-renewal."
        )

    # Get saved branch selection or use current active branches
    if tenant.saved_branch_selection_json:
        saved_branch_ids = json.loads(tenant.saved_branch_selection_json)
    else:
        # Use current active branch subscriptions (excluding cancelled branches)
        active_subs_result = await db.execute(
            select(ActiveBranchSubscription).where(
                ActiveBranchSubscription.parent_tenant_id == parent_tenant_id,
                ActiveBranchSubscription.is_active == True,
                ActiveBranchSubscription.is_cancelled == False
            )
        )
        active_subs = active_subs_result.scalars().all()
        saved_branch_ids = [sub.branch_tenant_id for sub in active_subs]

    # Calculate subscription amount
    branches_result = await db.execute(
        select(Tenant).where(
            Tenant.id.in_(saved_branch_ids)
        )
    )
    branches = branches_result.scalars().all()
    branches_data = [
        {"id": b.id, "name": b.name, "is_main": (b.id == parent_tenant_id)}
        for b in branches
    ]

    pricing = paystack_service.calculate_total_for_selected_branches(
        tenant.billing_cycle,
        saved_branch_ids,
        branches_data
    )

    # Create or get Paystack plan
    plan_code = f"{tenant.billing_cycle}-{len(saved_branch_ids)}branches-{pricing['total_amount_kobo']}"

    # Try to create plan (will fail silently if already exists)
    await paystack_service.create_subscription_plan(
        plan_code=plan_code,
        name=f"{tenant.billing_cycle.title()} Plan - {len(saved_branch_ids)} Branch(es)",
        amount=pricing['total_amount_kobo'],
        interval=tenant.billing_cycle if tenant.billing_cycle == 'monthly' else 'annually'
    )

    # Create Paystack subscription
    subscription_result = await paystack_service.create_subscription(
        customer_email=tenant.owner_email,
        plan_code=plan_code,
        authorization_code=last_transaction.paystack_authorization_code
    )

    if not subscription_result['status']:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to enable auto-renewal: {subscription_result.get('message')}"
        )

    # Update tenant with subscription details
    tenant.auto_renewal_enabled = True
    tenant.paystack_subscription_code = subscription_result['subscription_code']
    tenant.paystack_plan_code = plan_code
    tenant.saved_branch_selection_json = json.dumps(saved_branch_ids)

    await db.commit()

    logger.info(f"✅ Auto-renewal enabled for tenant {parent_tenant_id} - Subscription: {subscription_result['subscription_code']}")

    return {
        "status": "success",
        "message": "Auto-renewal enabled successfully",
        "subscription_code": subscription_result['subscription_code'],
        "next_payment_date": subscription_result.get('next_payment_date'),
        "branches_included": len(saved_branch_ids)
    }


# TODO: Webhook handler for Paystack recurring payments
# When implementing webhook endpoint (e.g., @router.post("/webhook/paystack")):
# 1. Load saved_branch_selection_json from parent tenant
# 2. Query ActiveBranchSubscription records for those branches
# 3. Filter out branches where is_cancelled = True
# 4. Process payment for remaining non-cancelled branches only
# 5. Delete ActiveBranchSubscription records for cancelled branches
# 6. Create new ActiveBranchSubscription records for renewed branches
# Note: The filtering in enable_auto_renewal and cancel_branch_subscription
# already ensures saved_branch_selection_json doesn't include cancelled branches


@router.post("/disable-auto-renewal")
async def disable_auto_renewal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Disable auto-renewal for current subscription.
    Cancels the Paystack subscription but keeps current access until expiry.
    """
    # Get user's tenant (parent)
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    parent_tenant_id = tenant.parent_tenant_id or tenant.id

    # Get parent tenant
    if parent_tenant_id != tenant.id:
        result = await db.execute(
            select(Tenant).where(Tenant.id == parent_tenant_id)
        )
        tenant = result.scalar_one()

    # Check if auto-renewal is enabled
    if not tenant.auto_renewal_enabled or not tenant.paystack_subscription_code:
        raise HTTPException(
            status_code=400,
            detail="Auto-renewal is not enabled for this subscription."
        )

    # Disable Paystack subscription (note: email_token not required for disable API)
    # We'll use the subscription management endpoint
    disable_result = await paystack_service.disable_subscription(
        subscription_code=tenant.paystack_subscription_code,
        email_token=""  # Email token not needed for disable with secret key
    )

    if not disable_result['status']:
        logger.warning(f"Failed to disable Paystack subscription: {disable_result.get('message')}")
        # Continue anyway to disable locally

    # Update tenant
    tenant.auto_renewal_enabled = False
    # Keep subscription_code for potential re-enablement

    await db.commit()

    logger.info(f"✅ Auto-renewal disabled for tenant {parent_tenant_id}")

    return {
        "status": "success",
        "message": "Auto-renewal disabled successfully. Your subscription will remain active until the end of the current billing period.",
        "current_period_end": tenant.next_billing_date
    }


@router.get("/auto-renewal-status")
async def get_auto_renewal_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get auto-renewal status for current subscription.
    """
    # Get user's tenant (parent)
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    parent_tenant_id = tenant.parent_tenant_id or tenant.id

    # Get parent tenant
    if parent_tenant_id != tenant.id:
        result = await db.execute(
            select(Tenant).where(Tenant.id == parent_tenant_id)
        )
        tenant = result.scalar_one()

    # Get saved branch selection
    saved_branch_ids = []
    if tenant.saved_branch_selection_json:
        saved_branch_ids = json.loads(tenant.saved_branch_selection_json)

    response = {
        "auto_renewal_enabled": tenant.auto_renewal_enabled or False,
        "subscription_code": tenant.paystack_subscription_code,
        "plan_code": tenant.paystack_plan_code,
        "billing_cycle": tenant.billing_cycle,
        "next_billing_date": tenant.next_billing_date,
        "saved_branch_ids": saved_branch_ids,
        "has_payment_method": bool(tenant.paystack_customer_code)
    }

    # If subscription exists, fetch current status from Paystack
    if tenant.paystack_subscription_code:
        paystack_status = await paystack_service.fetch_subscription(tenant.paystack_subscription_code)
        if paystack_status['status']:
            subscription_data = paystack_status['data']
            response["paystack_status"] = subscription_data.get('status')  # active, cancelled, etc.
            response["next_payment_date_paystack"] = subscription_data.get('next_payment_date')

    return response


# ==================== ADMIN DIAGNOSTICS ====================

@router.get("/config-status")
async def get_payment_config_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get Paystack configuration status (admin only).

    Returns diagnostic information without exposing actual API keys.
    Useful for troubleshooting "Invalid key" errors.
    """
    # Get user's tenant and verify admin role
    if not current_user.tenants:
        raise HTTPException(status_code=404, detail="User has no associated tenant")

    user_tenant = current_user.tenants[0]
    parent_tenant_id = user_tenant.parent_tenant_id if user_tenant.parent_tenant_id else user_tenant.id

    # Check if user is admin (simple check - could be enhanced with proper RBAC)
    from models import tenant_users, UserRole
    result = await db.execute(
        select(tenant_users.c.role).where(
            tenant_users.c.tenant_id == parent_tenant_id,
            tenant_users.c.user_id == current_user.id
        )
    )
    user_role = result.scalar_one_or_none()

    if user_role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get configuration status
    config_status = paystack_service.get_configuration_status()

    # Test credentials if configured
    credentials_valid = None
    if config_status['is_configured']:
        credentials_result = await paystack_service.verify_credentials()
        credentials_valid = credentials_result['status']
        config_status['credentials_test'] = credentials_result

    return {
        "paystack": config_status,
        "trial_period_days": settings.TRIAL_PERIOD_DAYS,
        "grace_period_days": settings.GRACE_PERIOD_DAYS,
        "recommendations": _get_config_recommendations(config_status, credentials_valid)
    }


def _get_config_recommendations(config_status: dict, credentials_valid: Optional[bool]) -> list:
    """Generate helpful recommendations based on configuration status"""
    recommendations = []

    if not config_status['is_configured']:
        recommendations.append({
            "severity": "error",
            "message": "Paystack API keys are not configured",
            "action": "Set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY environment variables in Render dashboard"
        })
    elif config_status['has_issues']:
        for issue in config_status['issues']:
            recommendations.append({
                "severity": "warning",
                "message": issue,
                "action": "Review and correct the Paystack key configuration in Render dashboard"
            })
    elif credentials_valid is False:
        recommendations.append({
            "severity": "error",
            "message": "Paystack credentials failed verification",
            "action": "Check if keys are correct and not expired in Paystack dashboard"
        })
    elif config_status['mode'] == 'test':
        recommendations.append({
            "severity": "info",
            "message": "Paystack is running in TEST mode",
            "action": "Switch to LIVE keys for production payments"
        })
    else:
        recommendations.append({
            "severity": "success",
            "message": "Paystack is properly configured",
            "action": None
        })

    return recommendations
