"""
Platform Super Admin API Router

This module provides platform-wide administrative endpoints for monitoring
and managing all tenants, subscriptions, and platform metrics.

Access is restricted to super admin users only.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from database import get_db
from models import User, Tenant, Sale, Product, tenant_users, SubscriptionPlan, AdminActivityLog, ActiveBranchSubscription, Category, Unit
from auth import (
    get_password_hash,
    verify_password,
    create_super_admin_token,
    require_super_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_current_super_admin
)
import json

router = APIRouter(prefix="/api/platform", tags=["Platform Admin"])


# =============================================================================
# SCHEMAS
# =============================================================================

class SuperAdminRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    secret_key: str  # Extra security for super admin registration


class SuperAdminLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class BranchDetail(BaseModel):
    tenant_id: int
    name: str
    subdomain: str
    is_main: bool
    is_paid: bool
    is_cancelled: bool
    cancelled_at: Optional[str]
    subscription_end_date: Optional[str]
    is_active: bool


class SubscriptionMetrics(BaseModel):
    total_branches: int
    paid_branches: int
    cancelled_branches: int
    active_branches: int


class TenantStats(BaseModel):
    id: int
    name: str
    subdomain: str
    owner_email: str
    subscription_plan: str
    subscription_status: Optional[str]
    is_active: bool
    created_at: datetime
    subscription_expires_at: Optional[datetime]
    next_billing_date: Optional[datetime]
    user_count: int
    product_count: int
    total_sales: float
    branch_count: int
    parent_tenant_id: Optional[int]
    branch_details: Optional[List[BranchDetail]] = None
    subscription_metrics: Optional[SubscriptionMetrics] = None


class PlatformMetrics(BaseModel):
    total_tenants: int
    active_tenants: int
    inactive_tenants: int
    total_users: int
    total_products: int
    total_sales_amount: float
    total_sales_count: int
    tenants_by_plan: dict
    new_tenants_this_month: int
    new_tenants_this_week: int


class TenantUpdate(BaseModel):
    subscription_plan: Optional[SubscriptionPlan] = None
    is_active: Optional[bool] = None
    max_users: Optional[int] = None
    max_products: Optional[int] = None
    subscription_expires_at: Optional[datetime] = None


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str
    tenant: dict
    user: dict


class UnsubscribedTenantInfo(BaseModel):
    """Schema for unsubscribed tenant information"""
    id: int
    name: str
    subdomain: str
    owner_email: str
    subscription_status: Optional[str]
    trial_ends_at: Optional[datetime]
    next_billing_date: Optional[datetime]
    days_past_expiry: int
    is_past_grace_period: bool
    is_manually_blocked: bool
    manually_blocked_at: Optional[datetime]
    manual_block_reason: Optional[str]
    user_count: int
    product_count: int
    total_sales: float


class BlockTenantRequest(BaseModel):
    """Request schema for blocking a tenant"""
    reason: Optional[str] = None


# =============================================================================
# AUTHENTICATION ENDPOINTS
# =============================================================================

@router.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register_super_admin(
    data: SuperAdminRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new platform super admin.
    Requires a secret key for extra security.
    """
    # TODO: Store this in environment variable
    SUPER_ADMIN_SECRET = "your-super-secret-key-change-in-production-12345"
    
    if data.secret_key != SUPER_ADMIN_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid secret key"
        )
    
    # Check if username exists
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email exists
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create super admin user
    new_user = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        is_super_admin=True,
        is_active=True
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_super_admin_token(
        data={"sub": new_user.username},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/auth/login", response_model=Token)
async def login_super_admin(
    data: SuperAdminLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login as platform super admin.
    """
    # Get user
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin privileges required"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_super_admin_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


# =============================================================================
# PLATFORM METRICS ENDPOINTS
# =============================================================================

@router.get("/metrics", response_model=PlatformMetrics)
async def get_platform_metrics(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Get platform-wide key performance indicators and metrics.
    """
    # Total tenants
    total_tenants_result = await db.execute(select(func.count(Tenant.id)))
    total_tenants = total_tenants_result.scalar() or 0
    
    # Active/Inactive tenants
    active_tenants_result = await db.execute(
        select(func.count(Tenant.id)).where(Tenant.is_active == True)
    )
    active_tenants = active_tenants_result.scalar() or 0
    inactive_tenants = total_tenants - active_tenants
    
    # Total users across all tenants
    total_users_result = await db.execute(
        select(func.count(func.distinct(tenant_users.c.user_id)))
    )
    total_users = total_users_result.scalar() or 0
    
    # Total products
    total_products_result = await db.execute(select(func.count(Product.id)))
    total_products = total_products_result.scalar() or 0
    
    # Total sales
    total_sales_amount_result = await db.execute(
        select(func.coalesce(func.sum(Sale.total), 0))
    )
    total_sales_amount = float(total_sales_amount_result.scalar() or 0)
    
    total_sales_count_result = await db.execute(select(func.count(Sale.id)))
    total_sales_count = total_sales_count_result.scalar() or 0
    
    # Tenants by subscription plan
    plan_counts = {}
    for plan in SubscriptionPlan:
        result = await db.execute(
            select(func.count(Tenant.id)).where(Tenant.subscription_plan == plan)
        )
        plan_counts[plan.value] = result.scalar() or 0
    
    # New tenants this month
    month_ago = datetime.utcnow() - timedelta(days=30)
    new_month_result = await db.execute(
        select(func.count(Tenant.id)).where(Tenant.created_at >= month_ago)
    )
    new_tenants_this_month = new_month_result.scalar() or 0
    
    # New tenants this week
    week_ago = datetime.utcnow() - timedelta(days=7)
    new_week_result = await db.execute(
        select(func.count(Tenant.id)).where(Tenant.created_at >= week_ago)
    )
    new_tenants_this_week = new_week_result.scalar() or 0
    
    return PlatformMetrics(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        inactive_tenants=inactive_tenants,
        total_users=total_users,
        total_products=total_products,
        total_sales_amount=total_sales_amount,
        total_sales_count=total_sales_count,
        tenants_by_plan=plan_counts,
        new_tenants_this_month=new_tenants_this_month,
        new_tenants_this_week=new_tenants_this_week
    )


# =============================================================================
# TENANT MANAGEMENT ENDPOINTS
# =============================================================================

@router.get("/tenants", response_model=List[TenantStats])
async def list_all_tenants(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    subscription_plan: Optional[SubscriptionPlan] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    List all tenants with statistics.
    Supports filtering and pagination.
    """
    # Build query - only show parent organizations (branches shown in expanded view)
    query = select(Tenant).where(Tenant.parent_tenant_id.is_(None))
    
    # Apply filters
    conditions = []
    if search:
        search_pattern = f"%{search}%"
        conditions.append(
            or_(
                Tenant.name.ilike(search_pattern),
                Tenant.subdomain.ilike(search_pattern),
                Tenant.owner_email.ilike(search_pattern)
            )
        )
    
    if subscription_plan:
        conditions.append(Tenant.subscription_plan == subscription_plan)
    
    if is_active is not None:
        conditions.append(Tenant.is_active == is_active)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Order and paginate
    query = query.order_by(desc(Tenant.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    tenants = result.scalars().all()
    
    # Build statistics for each tenant
    tenant_stats = []
    for tenant in tenants:
        # User count
        user_count_result = await db.execute(
            select(func.count(tenant_users.c.user_id)).where(
                tenant_users.c.tenant_id == tenant.id
            )
        )
        user_count = user_count_result.scalar() or 0
        
        # Product count
        product_count_result = await db.execute(
            select(func.count(Product.id)).where(Product.tenant_id == tenant.id)
        )
        product_count = product_count_result.scalar() or 0
        
        # Total sales
        sales_result = await db.execute(
            select(func.coalesce(func.sum(Sale.total), 0)).where(
                Sale.tenant_id == tenant.id
            )
        )
        total_sales = float(sales_result.scalar() or 0)
        
        # Branch count
        branch_count_result = await db.execute(
            select(func.count(Tenant.id)).where(Tenant.parent_tenant_id == tenant.id)
        )
        branch_count = branch_count_result.scalar() or 0
        
        tenant_stats.append(TenantStats(
            id=tenant.id,
            name=tenant.name,
            subdomain=tenant.subdomain,
            owner_email=tenant.owner_email,
            subscription_plan=tenant.subscription_plan.value,
            subscription_status=tenant.subscription_status,
            is_active=tenant.is_active,
            created_at=tenant.created_at,
            subscription_expires_at=tenant.subscription_expires_at,
            next_billing_date=tenant.next_billing_date,
            user_count=user_count,
            product_count=product_count,
            total_sales=total_sales,
            branch_count=branch_count,
            parent_tenant_id=tenant.parent_tenant_id
        ))

    # Enrich tenant stats with branch subscription details
    tenant_stats_list = []
    for tenant_data in tenant_stats:
        # Convert Pydantic model to dict for modification
        tenant_dict = tenant_data.dict()

        # Determine parent tenant ID
        parent_tenant_id = tenant_dict['parent_tenant_id'] if tenant_dict['parent_tenant_id'] else tenant_dict['id']

        # Get all branches in organization (main + sub-branches)
        branches_result = await db.execute(
            select(Tenant).where(
                or_(
                    Tenant.id == parent_tenant_id,
                    Tenant.parent_tenant_id == parent_tenant_id
                )
            )
        )
        all_branches = branches_result.scalars().all()

        # Get active branch subscriptions with cancellation status
        active_subs_result = await db.execute(
            select(ActiveBranchSubscription).where(
                ActiveBranchSubscription.parent_tenant_id == parent_tenant_id
            )
        )
        active_subs = active_subs_result.scalars().all()
        active_subs_dict = {sub.branch_tenant_id: sub for sub in active_subs}

        # Build branch details list
        branch_details = []
        for branch in all_branches:
            is_main = (branch.id == parent_tenant_id)
            active_sub = active_subs_dict.get(branch.id)

            branch_details.append(BranchDetail(
                tenant_id=branch.id,
                name=branch.name,
                subdomain=branch.subdomain,
                is_main=is_main,
                is_paid=active_sub is not None and active_sub.is_active,
                is_cancelled=active_sub.is_cancelled if active_sub else False,
                cancelled_at=active_sub.cancelled_at.isoformat() if (active_sub and active_sub.cancelled_at) else None,
                subscription_end_date=active_sub.subscription_end_date.isoformat() if active_sub else None,
                is_active=active_sub.is_active if active_sub else False
            ))

        # Calculate per-organization subscription metrics
        paid_branches = sum(1 for b in branch_details if b.is_paid)
        cancelled_branches = sum(1 for b in branch_details if b.is_cancelled)
        active_branches = sum(1 for b in branch_details if b.is_active)

        subscription_metrics = SubscriptionMetrics(
            total_branches=len(branch_details),
            paid_branches=paid_branches,
            cancelled_branches=cancelled_branches,
            active_branches=active_branches
        )

        # Create updated TenantStats with branch details
        tenant_dict['branch_details'] = branch_details
        tenant_dict['subscription_metrics'] = subscription_metrics

        tenant_stats_list.append(TenantStats(**tenant_dict))

    return tenant_stats_list


class TenantLoginInfo(BaseModel):
    """Schema for tenant login information"""
    tenant_id: int
    tenant_name: str
    tenant_subdomain: str
    user_id: int
    username: str
    full_name: str
    role: str
    last_login_at: datetime


class TodayLoginsResponse(BaseModel):
    """Response schema for today's login activity"""
    total_logins: int
    unique_tenants: int
    unique_users: int
    logins: List[TenantLoginInfo]


@router.get("/logins-today", response_model=TodayLoginsResponse)
async def get_logins_today(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Get all tenant login activity for today.
    Returns list of tenants/users who logged in today with timestamps.
    """
    # Get start of today (UTC)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Query all logins from today
    result = await db.execute(
        select(
            Tenant.id.label('tenant_id'),
            Tenant.name.label('tenant_name'),
            Tenant.subdomain.label('tenant_subdomain'),
            User.id.label('user_id'),
            User.username,
            User.full_name,
            tenant_users.c.role,
            tenant_users.c.last_login_at
        )
        .join(tenant_users, Tenant.id == tenant_users.c.tenant_id)
        .join(User, User.id == tenant_users.c.user_id)
        .where(
            tenant_users.c.last_login_at >= today_start,
            Tenant.parent_tenant_id.is_(None)  # Only show parent tenants
        )
        .order_by(desc(tenant_users.c.last_login_at))
    )
    rows = result.all()

    logins = []
    unique_tenant_ids = set()
    unique_user_ids = set()

    for row in rows:
        unique_tenant_ids.add(row.tenant_id)
        unique_user_ids.add(row.user_id)
        logins.append(TenantLoginInfo(
            tenant_id=row.tenant_id,
            tenant_name=row.tenant_name,
            tenant_subdomain=row.tenant_subdomain,
            user_id=row.user_id,
            username=row.username,
            full_name=row.full_name,
            role=row.role.value if hasattr(row.role, 'value') else str(row.role),
            last_login_at=row.last_login_at
        ))

    return TodayLoginsResponse(
        total_logins=len(logins),
        unique_tenants=len(unique_tenant_ids),
        unique_users=len(unique_user_ids),
        logins=logins
    )


@router.get("/tenants/unsubscribed", response_model=List[UnsubscribedTenantInfo])
async def list_unsubscribed_tenants(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    List all tenants without active subscriptions.
    Shows businesses with expired/cancelled subscriptions, sorted by most overdue first.
    """
    now = datetime.utcnow()
    grace_period_days = 30

    # Query parent tenants (organizations) with inactive subscriptions
    # Include: expired, cancelled, or trial expired
    result = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id.is_(None),  # Only parent tenants
            or_(
                Tenant.subscription_status == 'expired',
                Tenant.subscription_status == 'cancelled',
                and_(
                    Tenant.subscription_status == 'trial',
                    Tenant.trial_ends_at < now
                )
            )
        )
    )
    tenants = result.scalars().all()

    unsubscribed_list = []
    for tenant in tenants:
        # Calculate days past expiry
        expiry_date = None
        if tenant.subscription_status == 'trial' and tenant.trial_ends_at:
            expiry_date = tenant.trial_ends_at
        elif tenant.next_billing_date:
            expiry_date = tenant.next_billing_date
        elif tenant.subscription_expires_at:
            expiry_date = tenant.subscription_expires_at

        days_past_expiry = 0
        if expiry_date:
            delta = now - expiry_date
            days_past_expiry = max(0, delta.days)

        is_past_grace_period = days_past_expiry > grace_period_days

        # Get user count
        user_count_result = await db.execute(
            select(func.count(tenant_users.c.user_id)).where(
                tenant_users.c.tenant_id == tenant.id
            )
        )
        user_count = user_count_result.scalar() or 0

        # Get product count
        product_count_result = await db.execute(
            select(func.count(Product.id)).where(Product.tenant_id == tenant.id)
        )
        product_count = product_count_result.scalar() or 0

        # Get total sales
        sales_result = await db.execute(
            select(func.coalesce(func.sum(Sale.total), 0)).where(
                Sale.tenant_id == tenant.id
            )
        )
        total_sales = float(sales_result.scalar() or 0)

        unsubscribed_list.append(UnsubscribedTenantInfo(
            id=tenant.id,
            name=tenant.name,
            subdomain=tenant.subdomain,
            owner_email=tenant.owner_email,
            subscription_status=tenant.subscription_status,
            trial_ends_at=tenant.trial_ends_at,
            next_billing_date=tenant.next_billing_date,
            days_past_expiry=days_past_expiry,
            is_past_grace_period=is_past_grace_period,
            is_manually_blocked=tenant.is_manually_blocked,
            manually_blocked_at=tenant.manually_blocked_at,
            manual_block_reason=tenant.manual_block_reason,
            user_count=user_count,
            product_count=product_count,
            total_sales=total_sales
        ))

    # Sort by most overdue first
    unsubscribed_list.sort(key=lambda x: x.days_past_expiry, reverse=True)

    return unsubscribed_list


@router.get("/tenants/{tenant_id}", response_model=TenantStats)
async def get_tenant_details(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Get detailed information about a specific tenant.
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Get statistics
    user_count_result = await db.execute(
        select(func.count(tenant_users.c.user_id)).where(
            tenant_users.c.tenant_id == tenant.id
        )
    )
    user_count = user_count_result.scalar() or 0
    
    product_count_result = await db.execute(
        select(func.count(Product.id)).where(Product.tenant_id == tenant.id)
    )
    product_count = product_count_result.scalar() or 0
    
    sales_result = await db.execute(
        select(func.coalesce(func.sum(Sale.total), 0)).where(
            Sale.tenant_id == tenant.id
        )
    )
    total_sales = float(sales_result.scalar() or 0)
    
    branch_count_result = await db.execute(
        select(func.count(Tenant.id)).where(Tenant.parent_tenant_id == tenant.id)
    )
    branch_count = branch_count_result.scalar() or 0
    
    return TenantStats(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        owner_email=tenant.owner_email,
        subscription_plan=tenant.subscription_plan.value,
        subscription_status=tenant.subscription_status,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        subscription_expires_at=tenant.subscription_expires_at,
        next_billing_date=tenant.next_billing_date,
        user_count=user_count,
        product_count=product_count,
        total_sales=total_sales,
        branch_count=branch_count,
        parent_tenant_id=tenant.parent_tenant_id
    )


@router.patch("/tenants/{tenant_id}", response_model=TenantStats)
async def update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Update tenant settings (subscription, status, limits).
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Update fields
    if data.subscription_plan is not None:
        tenant.subscription_plan = data.subscription_plan
    
    if data.is_active is not None:
        tenant.is_active = data.is_active
    
    if data.max_users is not None:
        tenant.max_users = data.max_users
    
    if data.max_products is not None:
        tenant.max_products = data.max_products
    
    if data.subscription_expires_at is not None:
        tenant.subscription_expires_at = data.subscription_expires_at
    
    tenant.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(tenant)
    
    # Return updated stats
    return await get_tenant_details(tenant_id, db, True)


@router.post("/tenants/{tenant_id}/extend-subscription")
async def extend_tenant_subscription(
    tenant_id: int,
    days: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    Extend a tenant's subscription by X days (emergency access/customer service).
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Extend next_billing_date
    if tenant.next_billing_date:
        tenant.next_billing_date = tenant.next_billing_date + timedelta(days=days)
    else:
        tenant.next_billing_date = datetime.utcnow() + timedelta(days=days)
    
    tenant.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(tenant)
    
    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="extend_subscription",
        target_type="tenant",
        target_id=tenant.id,
        details={"days_extended": days, "new_end_date": tenant.next_billing_date.isoformat()}
    )
    
    return {
        "success": True,
        "message": f"Subscription extended by {days} days",
        "new_end_date": tenant.next_billing_date.isoformat()
    }


@router.patch("/tenants/{tenant_id}/subscription")
async def update_tenant_subscription(
    tenant_id: int,
    subscription_status: Optional[str] = None,
    next_billing_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    Manually update tenant subscription status (activate/deactivate/cancel).
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    updates = {}
    
    if subscription_status:
        tenant.subscription_status = subscription_status
        updates['subscription_status'] = subscription_status
    
    if next_billing_date:
        tenant.next_billing_date = next_billing_date
        updates['next_billing_date'] = next_billing_date.isoformat()
    
    tenant.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(tenant)
    
    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="update_subscription",
        target_type="tenant",
        target_id=tenant.id,
        details=updates
    )
    
    return {
        "success": True,
        "message": "Subscription updated successfully",
        "subscription_status": tenant.subscription_status,
        "next_billing_date": tenant.next_billing_date.isoformat() if tenant.next_billing_date else None
    }


@router.post("/tenants/{tenant_id}/revoke-subscription")
async def revoke_tenant_subscription(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    Completely revoke a tenant's subscription.
    This will:
    - Deactivate all branch subscriptions
    - Set subscription status to 'expired'
    - Clear billing information
    - Prevent access until they resubscribe
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )

    # Count active subscriptions before revoking
    active_subs_result = await db.execute(
        select(func.count(ActiveBranchSubscription.id)).where(
            and_(
                ActiveBranchSubscription.parent_tenant_id == tenant_id,
                ActiveBranchSubscription.is_active == True
            )
        )
    )
    active_count = active_subs_result.scalar()

    # Deactivate all active branch subscriptions for this tenant
    await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == tenant_id
        )
    )
    branch_subs_result = await db.execute(
        select(ActiveBranchSubscription).where(
            ActiveBranchSubscription.parent_tenant_id == tenant_id
        )
    )
    branch_subs = branch_subs_result.scalars().all()

    for branch_sub in branch_subs:
        branch_sub.is_active = False
        branch_sub.updated_at = datetime.utcnow()

    # Update main tenant subscription status
    tenant.subscription_status = 'expired'
    tenant.next_billing_date = None
    tenant.billing_cycle = None
    tenant.updated_at = datetime.utcnow()

    await db.commit()

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="revoke_subscription",
        target_type="tenant",
        target_id=tenant.id,
        details={
            "revoked_by": current_admin.username,
            "branches_affected": len(branch_subs),
            "active_subs_revoked": active_count,
            "revoked_at": datetime.utcnow().isoformat()
        }
    )

    return {
        "success": True,
        "message": f"Subscription revoked successfully. {len(branch_subs)} branch(es) deactivated.",
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "branches_affected": len(branch_subs),
        "new_status": "expired"
    }


@router.post("/tenants/{tenant_id}/block")
async def block_tenant(
    tenant_id: int,
    data: BlockTenantRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    Manually block a tenant's transactions.
    Use this for businesses past their grace period after subscription expiry.
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )

    if tenant.is_manually_blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant is already blocked"
        )

    # Block the tenant
    tenant.is_manually_blocked = True
    tenant.manually_blocked_at = datetime.utcnow()
    tenant.manually_blocked_by = current_admin.id
    tenant.manual_block_reason = data.reason
    tenant.updated_at = datetime.utcnow()

    await db.commit()

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="block_tenant",
        target_type="tenant",
        target_id=tenant.id,
        details={
            "tenant_name": tenant.name,
            "tenant_subdomain": tenant.subdomain,
            "reason": data.reason,
            "blocked_at": tenant.manually_blocked_at.isoformat()
        }
    )

    return {
        "success": True,
        "message": f"Tenant '{tenant.name}' has been blocked",
        "tenant_id": tenant.id,
        "blocked_at": tenant.manually_blocked_at.isoformat()
    }


@router.post("/tenants/{tenant_id}/unblock")
async def unblock_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """
    Remove manual block from a tenant.
    Note: This only removes the manual block. The tenant still needs an active subscription.
    """
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )

    if not tenant.is_manually_blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant is not blocked"
        )

    previous_reason = tenant.manual_block_reason

    # Unblock the tenant
    tenant.is_manually_blocked = False
    tenant.manually_blocked_at = None
    tenant.manually_blocked_by = None
    tenant.manual_block_reason = None
    tenant.updated_at = datetime.utcnow()

    await db.commit()

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="unblock_tenant",
        target_type="tenant",
        target_id=tenant.id,
        details={
            "tenant_name": tenant.name,
            "tenant_subdomain": tenant.subdomain,
            "previous_block_reason": previous_reason
        }
    )

    return {
        "success": True,
        "message": f"Tenant '{tenant.name}' has been unblocked",
        "tenant_id": tenant.id
    }


@router.post("/tenants/{tenant_id}/impersonate", response_model=ImpersonateResponse)
async def impersonate_tenant_admin(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Generate an access token to impersonate a tenant admin for support purposes.
    This allows super admins to access the tenant's account to troubleshoot issues.
    """
    from auth import create_access_token
    
    # Get tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Find an admin user in this tenant
    result = await db.execute(
        select(User).join(tenant_users).where(
            and_(
                tenant_users.c.tenant_id == tenant_id,
                tenant_users.c.role == "admin",
                tenant_users.c.is_active == True,
                User.is_active == True
            )
        ).limit(1)
    )
    admin_user = result.scalar_one_or_none()
    
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active admin user found for this tenant"
        )
    
    # Create impersonation token (regular tenant token)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin_user.username},
        tenant_id=tenant.id,
        expires_delta=access_token_expires
    )
    
    return ImpersonateResponse(
        access_token=access_token,
        token_type="bearer",
        tenant={
            "id": tenant.id,
            "name": tenant.name,
            "subdomain": tenant.subdomain
        },
        user={
            "id": admin_user.id,
            "username": admin_user.username,
            "email": admin_user.email,
            "full_name": admin_user.full_name
        }
    )


# =============================================================================
# ANALYTICS ENDPOINTS
# =============================================================================

@router.get("/analytics/growth")
async def get_growth_analytics(
    period: str = "monthly",  # daily, weekly, monthly
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Get platform growth analytics over time.
    """
    # This would typically use more sophisticated date grouping
    # For now, return simple counts
    
    if period == "monthly":
        # Last 12 months
        months_data = []
        for i in range(12, 0, -1):
            date_threshold = datetime.utcnow() - timedelta(days=30 * i)
            result = await db.execute(
                select(func.count(Tenant.id)).where(
                    Tenant.created_at >= date_threshold
                )
            )
            count = result.scalar() or 0
            months_data.append({
                "period": date_threshold.strftime("%Y-%m"),
                "count": count
            })
        return {"period": "monthly", "data": months_data}
    
    return {"period": period, "data": []}


@router.get("/analytics/top-tenants")
async def get_top_performing_tenants(
    metric: str = "sales",  # sales, users, products
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_super_admin)
):
    """
    Get top performing tenants by various metrics.
    """
    if metric == "sales":
        # Top tenants by sales volume
        result = await db.execute(
            select(
                Tenant.id,
                Tenant.name,
                Tenant.subdomain,
                func.coalesce(func.sum(Sale.total), 0).label("total_sales")
            )
            .outerjoin(Sale, Sale.tenant_id == Tenant.id)
            .group_by(Tenant.id, Tenant.name, Tenant.subdomain)
            .order_by(desc("total_sales"))
            .limit(limit)
        )
        
        tenants = []
        for row in result:
            tenants.append({
                "id": row.id,
                "name": row.name,
                "subdomain": row.subdomain,
                "total_sales": float(row.total_sales)
            })
        
        return {"metric": "sales", "tenants": tenants}
    
    return {"metric": metric, "tenants": []}


# =============================================================================
# ADMIN MANAGEMENT ENDPOINTS
# =============================================================================

class AdminResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    is_active: bool
    is_super_admin: bool
    env_based: bool
    created_at: datetime


class AdminCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str


class AdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


class AdminPasswordReset(BaseModel):
    new_password: str


class ActivityLogResponse(BaseModel):
    id: int
    admin_user_id: int
    admin_username: str
    admin_full_name: str
    action: str
    target_type: Optional[str]
    target_id: Optional[int]
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime


# Helper function for activity logging
async def log_admin_activity(
    db: AsyncSession,
    admin_user_id: int,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Log admin activity for audit purposes"""
    activity_log = AdminActivityLog(
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=json.dumps(details) if details else None,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(activity_log)
    await db.commit()


@router.get("/admins", response_model=List[AdminResponse])
async def list_super_admins(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """List all platform super admins"""
    result = await db.execute(
        select(User).where(User.is_super_admin == True).order_by(User.created_at)
    )
    admins = result.scalars().all()
    
    return [AdminResponse(
        id=admin.id,
        username=admin.username,
        email=admin.email,
        full_name=admin.full_name,
        is_active=admin.is_active,
        is_super_admin=admin.is_super_admin,
        env_based=admin.env_based,
        created_at=admin.created_at
    ) for admin in admins]


@router.post("/admins", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
async def create_super_admin(
    data: AdminCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Create a new platform super admin (UI-based, not env-based)"""
    # Check if username exists
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check if email exists
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    
    # Create new admin user
    new_admin = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        is_super_admin=True,
        env_based=False,  # UI-created admins are NOT env-based
        is_active=True
    )
    
    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)
    
    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="create_admin",
        target_type="admin",
        target_id=new_admin.id,
        details={"created_email": new_admin.email, "created_username": new_admin.username}
    )
    
    return AdminResponse(
        id=new_admin.id,
        username=new_admin.username,
        email=new_admin.email,
        full_name=new_admin.full_name,
        is_active=new_admin.is_active,
        is_super_admin=new_admin.is_super_admin,
        env_based=new_admin.env_based,
        created_at=new_admin.created_at
    )


@router.patch("/admins/{admin_id}", response_model=AdminResponse)
async def update_super_admin(
    admin_id: int,
    data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Update a super admin (enable/disable, update name)"""
    result = await db.execute(
        select(User).where(User.id == admin_id, User.is_super_admin == True)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    # Prevent disabling env-based admins
    if data.is_active is False and admin.env_based:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot disable environment-based admin"
        )
    
    # Update fields
    if data.is_active is not None:
        admin.is_active = data.is_active
    
    if data.full_name is not None:
        admin.full_name = data.full_name
    
    await db.commit()
    await db.refresh(admin)
    
    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="update_admin",
        target_type="admin",
        target_id=admin.id,
        details={"is_active": admin.is_active, "full_name": admin.full_name}
    )
    
    return AdminResponse(
        id=admin.id,
        username=admin.username,
        email=admin.email,
        full_name=admin.full_name,
        is_active=admin.is_active,
        is_super_admin=admin.is_super_admin,
        env_based=admin.env_based,
        created_at=admin.created_at
    )


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_super_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Delete a super admin (cannot delete env-based or last admin)"""
    result = await db.execute(
        select(User).where(User.id == admin_id, User.is_super_admin == True)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    # Prevent deleting yourself
    if admin.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete your own admin account"
        )
    
    # Prevent deleting env-based admins
    if admin.env_based:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete environment-based admin. These are managed via environment variables."
        )
    
    # Prevent deleting the last admin
    admin_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_super_admin == True,
            User.is_active == True
        )
    )
    admin_count = admin_count_result.scalar() or 0
    
    if admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the last active admin"
        )
    
    # Log activity before deletion
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="delete_admin",
        target_type="admin",
        target_id=admin.id,
        details={"deleted_email": admin.email, "deleted_username": admin.username}
    )
    
    await db.delete(admin)
    await db.commit()
    
    return None


@router.post("/admins/{admin_id}/reset-password")
async def reset_admin_password(
    admin_id: int,
    data: AdminPasswordReset,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Reset another admin's password"""
    result = await db.execute(
        select(User).where(User.id == admin_id, User.is_super_admin == True)
    )
    admin = result.scalar_one_or_none()
    
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    # Prevent resetting env-based admin passwords
    if admin.env_based:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset password for environment-based admin. Update via environment variables."
        )
    
    # Update password
    admin.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    
    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="reset_admin_password",
        target_type="admin",
        target_id=admin.id,
        details={"target_email": admin.email}
    )
    
    return {"message": "Password reset successfully", "success": True}


@router.get("/activity-logs", response_model=List[ActivityLogResponse])
async def get_activity_logs(
    skip: int = 0,
    limit: int = 100,
    action: Optional[str] = None,
    admin_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Get admin activity logs with filtering and pagination"""
    query = select(AdminActivityLog, User).join(
        User, AdminActivityLog.admin_user_id == User.id
    )
    
    # Apply filters
    if action:
        query = query.where(AdminActivityLog.action == action)
    
    if admin_id:
        query = query.where(AdminActivityLog.admin_user_id == admin_id)
    
    # Order and paginate
    query = query.order_by(desc(AdminActivityLog.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    logs = result.all()
    
    return [ActivityLogResponse(
        id=log.AdminActivityLog.id,
        admin_user_id=log.AdminActivityLog.admin_user_id,
        admin_username=log.User.username,
        admin_full_name=log.User.full_name,
        action=log.AdminActivityLog.action,
        target_type=log.AdminActivityLog.target_type,
        target_id=log.AdminActivityLog.target_id,
        details=log.AdminActivityLog.details,
        ip_address=log.AdminActivityLog.ip_address,
        created_at=log.AdminActivityLog.created_at
    ) for log in logs]


# =============================================================================
# GLOBAL CATEGORIES MANAGEMENT (Super Admin Only)
# =============================================================================

from schemas import CategoryCreate, CategoryUpdate, CategoryResponse, UnitCreate, UnitUpdate, UnitResponse


class GlobalCategoryResponse(BaseModel):
    """Response schema for global categories"""
    id: int
    name: str
    display_order: int
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: bool
    target_margin: Optional[float] = None
    minimum_margin: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    product_count: int = 0
    effective_target_margin: float = 25.0
    effective_minimum_margin: float = 15.0

    class Config:
        from_attributes = True


class GlobalUnitResponse(BaseModel):
    """Response schema for global units"""
    id: int
    name: str
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    product_count: int = 0

    class Config:
        from_attributes = True


@router.get("/categories", response_model=List[GlobalCategoryResponse])
async def list_global_categories(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """List all global categories (super admin only)"""
    query = select(Category)
    if active_only:
        query = query.where(Category.is_active == True)
    query = query.order_by(Category.display_order, Category.name)

    result = await db.execute(query)
    categories = result.scalars().all()

    # Get product counts for each category
    response_categories = []
    for category in categories:
        # Count products using this category
        count_result = await db.execute(
            select(func.count(Product.id)).where(Product.category_id == category.id)
        )
        product_count = count_result.scalar() or 0

        response_categories.append(GlobalCategoryResponse(
            id=category.id,
            name=category.name,
            display_order=category.display_order,
            icon=category.icon,
            color=category.color,
            is_active=category.is_active,
            target_margin=category.target_margin,
            minimum_margin=category.minimum_margin,
            created_at=category.created_at,
            updated_at=category.updated_at,
            product_count=product_count,
            effective_target_margin=category.target_margin if category.target_margin is not None else 25.0,
            effective_minimum_margin=category.minimum_margin if category.minimum_margin is not None else 15.0
        ))

    return response_categories


@router.post("/categories", response_model=GlobalCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_global_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Create a new global category (super admin only)"""
    # Check for duplicate name
    existing = await db.execute(
        select(Category).where(Category.name == category_data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{category_data.name}' already exists"
        )

    new_category = Category(**category_data.model_dump())
    db.add(new_category)
    await db.commit()
    await db.refresh(new_category)

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="create_global_category",
        target_type="category",
        target_id=new_category.id,
        details={"name": new_category.name}
    )

    return GlobalCategoryResponse(
        id=new_category.id,
        name=new_category.name,
        display_order=new_category.display_order,
        icon=new_category.icon,
        color=new_category.color,
        is_active=new_category.is_active,
        target_margin=new_category.target_margin,
        minimum_margin=new_category.minimum_margin,
        created_at=new_category.created_at,
        updated_at=new_category.updated_at,
        product_count=0,
        effective_target_margin=new_category.target_margin if new_category.target_margin is not None else 25.0,
        effective_minimum_margin=new_category.minimum_margin if new_category.minimum_margin is not None else 15.0
    )


@router.patch("/categories/{category_id}", response_model=GlobalCategoryResponse)
async def update_global_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Update a global category (super admin only)"""
    result = await db.execute(
        select(Category).where(Category.id == category_id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    # Check for duplicate name if name is being changed
    if category_data.name and category_data.name != category.name:
        existing = await db.execute(
            select(Category).where(
                Category.name == category_data.name,
                Category.id != category_id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category '{category_data.name}' already exists"
            )

    # Update fields
    update_data = category_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    await db.commit()
    await db.refresh(category)

    # Get product count
    count_result = await db.execute(
        select(func.count(Product.id)).where(Product.category_id == category.id)
    )
    product_count = count_result.scalar() or 0

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="update_global_category",
        target_type="category",
        target_id=category.id,
        details=update_data
    )

    return GlobalCategoryResponse(
        id=category.id,
        name=category.name,
        display_order=category.display_order,
        icon=category.icon,
        color=category.color,
        is_active=category.is_active,
        target_margin=category.target_margin,
        minimum_margin=category.minimum_margin,
        created_at=category.created_at,
        updated_at=category.updated_at,
        product_count=product_count,
        effective_target_margin=category.target_margin if category.target_margin is not None else 25.0,
        effective_minimum_margin=category.minimum_margin if category.minimum_margin is not None else 15.0
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Delete a global category (super admin only)"""
    result = await db.execute(
        select(Category).where(Category.id == category_id)
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    # Check if category is in use
    count_result = await db.execute(
        select(func.count(Product.id)).where(Product.category_id == category_id)
    )
    product_count = count_result.scalar() or 0

    if product_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete category: {product_count} products are using it. Please reassign products first."
        )

    category_name = category.name
    await db.delete(category)
    await db.commit()

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="delete_global_category",
        target_type="category",
        target_id=category_id,
        details={"deleted_name": category_name}
    )

    return None


# =============================================================================
# GLOBAL UNITS MANAGEMENT (Super Admin Only)
# =============================================================================

@router.get("/units", response_model=List[GlobalUnitResponse])
async def list_global_units(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """List all global units (super admin only)"""
    query = select(Unit)
    if active_only:
        query = query.where(Unit.is_active == True)
    query = query.order_by(Unit.display_order, Unit.name)

    result = await db.execute(query)
    units = result.scalars().all()

    # Get product counts for each unit
    response_units = []
    for unit in units:
        # Count products using this unit
        count_result = await db.execute(
            select(func.count(Product.id)).where(Product.unit == unit.name)
        )
        product_count = count_result.scalar() or 0

        response_units.append(GlobalUnitResponse(
            id=unit.id,
            name=unit.name,
            display_order=unit.display_order,
            is_active=unit.is_active,
            created_at=unit.created_at,
            updated_at=unit.updated_at,
            product_count=product_count
        ))

    return response_units


@router.post("/units", response_model=GlobalUnitResponse, status_code=status.HTTP_201_CREATED)
async def create_global_unit(
    unit_data: UnitCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Create a new global unit (super admin only)"""
    # Check for duplicate name
    existing = await db.execute(
        select(Unit).where(Unit.name == unit_data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unit '{unit_data.name}' already exists"
        )

    new_unit = Unit(**unit_data.model_dump())
    db.add(new_unit)
    await db.commit()
    await db.refresh(new_unit)

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="create_global_unit",
        target_type="unit",
        target_id=new_unit.id,
        details={"name": new_unit.name}
    )

    return GlobalUnitResponse(
        id=new_unit.id,
        name=new_unit.name,
        display_order=new_unit.display_order,
        is_active=new_unit.is_active,
        created_at=new_unit.created_at,
        updated_at=new_unit.updated_at,
        product_count=0
    )


@router.patch("/units/{unit_id}", response_model=GlobalUnitResponse)
async def update_global_unit(
    unit_id: int,
    unit_data: UnitUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Update a global unit (super admin only)"""
    result = await db.execute(
        select(Unit).where(Unit.id == unit_id)
    )
    unit = result.scalar_one_or_none()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unit not found"
        )

    old_name = unit.name

    # Check for duplicate name if name is being changed
    if unit_data.name and unit_data.name != unit.name:
        existing = await db.execute(
            select(Unit).where(
                Unit.name == unit_data.name,
                Unit.id != unit_id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unit '{unit_data.name}' already exists"
            )

    # Update fields
    update_data = unit_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(unit, field, value)

    # If name changed, update products using the old unit name
    if unit_data.name and unit_data.name != old_name:
        await db.execute(
            select(Product).where(Product.unit == old_name)
        )
        # Update all products with the old unit name to use the new name
        from sqlalchemy import update as sql_update
        await db.execute(
            sql_update(Product).where(Product.unit == old_name).values(unit=unit_data.name)
        )

    await db.commit()
    await db.refresh(unit)

    # Get product count
    count_result = await db.execute(
        select(func.count(Product.id)).where(Product.unit == unit.name)
    )
    product_count = count_result.scalar() or 0

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="update_global_unit",
        target_type="unit",
        target_id=unit.id,
        details=update_data
    )

    return GlobalUnitResponse(
        id=unit.id,
        name=unit.name,
        display_order=unit.display_order,
        is_active=unit.is_active,
        created_at=unit.created_at,
        updated_at=unit.updated_at,
        product_count=product_count
    )


@router.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_unit(
    unit_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_super_admin)
):
    """Delete a global unit (super admin only)"""
    result = await db.execute(
        select(Unit).where(Unit.id == unit_id)
    )
    unit = result.scalar_one_or_none()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unit not found"
        )

    # Check if unit is in use
    count_result = await db.execute(
        select(func.count(Product.id)).where(Product.unit == unit.name)
    )
    product_count = count_result.scalar() or 0

    if product_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete unit: {product_count} products are using it. Please reassign products first."
        )

    unit_name = unit.name
    await db.delete(unit)
    await db.commit()

    # Log activity
    await log_admin_activity(
        db=db,
        admin_user_id=current_admin.id,
        action="delete_global_unit",
        target_type="unit",
        target_id=unit_id,
        details={"deleted_name": unit_name}
    )

    return None
