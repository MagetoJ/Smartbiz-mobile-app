"""
Tenant Management API Endpoints
Handles tenant registration, settings, and user management within tenants
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update, delete, func
from sqlalchemy.orm import selectinload
from datetime import datetime, date, timedelta
from typing import List
import asyncio

from database import get_db
from models import Tenant, User, tenant_users, Product, Sale, UserRole, StockMovement, BranchStock
from schemas import (
    TenantCreate, TenantResponse, TenantUpdate, TenantSummary,
    UserInvite, UserAdd, UserResponse, UserTenantInfo, TenantUsageStats, UserTenantUpdate,
    UserWithRoleResponse, ConvertToOrganizationRequest,
    BranchResponse, BranchCreate, BranchUpdate
)
from image_utils import process_and_upload_logo, delete_from_r2
from auth import (
    get_password_hash, get_current_active_user, get_current_tenant,
    require_admin_role, get_tenant_from_subdomain
)
from email_service import EmailService
from config import settings

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("/register", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def register_tenant(
    tenant_data: TenantCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    PUBLIC ENDPOINT: Register a new tenant/organization.
    Creates the tenant and the initial admin user.
    """
    # Check subdomain availability
    result = await db.execute(
        select(Tenant).where(Tenant.subdomain == tenant_data.subdomain)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Subdomain already taken"
        )
    
    # Check slug availability
    result = await db.execute(
        select(Tenant).where(Tenant.slug == tenant_data.slug)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Slug already taken"
        )
    
    # Check if admin username exists
    result = await db.execute(
        select(User).where(User.username == tenant_data.admin_username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Username already taken"
        )
    
    # Create tenant with trial period
    trial_end = datetime.utcnow() + timedelta(days=settings.TRIAL_PERIOD_DAYS)
    new_tenant = Tenant(
        name=tenant_data.name,
        subdomain=tenant_data.subdomain,
        slug=tenant_data.slug,
        owner_email=tenant_data.owner_email,
        phone=tenant_data.phone,
        address=tenant_data.address,
        business_type=tenant_data.business_type,
        subscription_status='trial',
        trial_ends_at=trial_end,
        next_billing_date=trial_end  # Set for consistency - trial ends at this date
    )
    db.add(new_tenant)
    await db.flush()  # Get tenant ID
    
    # Create admin user
    admin_user = User(
        username=tenant_data.admin_username,
        email=tenant_data.owner_email,
        hashed_password=get_password_hash(tenant_data.admin_password),
        full_name=tenant_data.admin_full_name,
        is_active=True
    )
    db.add(admin_user)
    await db.flush()  # Get user ID
    
    # Link user to tenant as admin
    await db.execute(
        insert(tenant_users).values(
            tenant_id=new_tenant.id,
            user_id=admin_user.id,
            role=UserRole.ADMIN,
            is_active=True
        )
    )
    
    await db.commit()
    await db.refresh(new_tenant)

    # Send welcome email to new business owner (fire and forget - non-blocking)
    if settings.POSTMARK_ENABLED:
        email_service = EmailService()

        # Use asyncio.create_task for fire-and-forget execution
        asyncio.create_task(
            email_service.send_welcome_email(
                user_email=tenant_data.owner_email,
                user_full_name=tenant_data.admin_full_name,
                business_name=tenant_data.name,
                subdomain=tenant_data.subdomain
            )
        )
        print(f"Queued welcome email to {tenant_data.owner_email} for business: {tenant_data.name}")

    return new_tenant


@router.get("/me", response_model=TenantResponse)
async def get_current_tenant_details(
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """Get current tenant details"""
    return current_tenant


@router.put("/me", response_model=TenantResponse)
async def update_current_tenant(
    updates: TenantUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Update current tenant settings (admin only)"""
    # Apply updates
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(current_tenant, key, value)
    
    current_tenant.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(current_tenant)

    return current_tenant


@router.post("/me/logo", response_model=TenantResponse)
async def upload_tenant_logo(
    file: UploadFile = File(..., description="Business logo image (max 5MB)"),
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload business logo to Cloudflare R2 (admin only).

    Automatically processes and creates optimized variants:
    - Original: Full resolution
    - Display: 400x400px for header/UI display
    """
    # Upload to R2 and get base path
    logo_url = await process_and_upload_logo(
        file=file,
        tenant_id=current_tenant.id,
        old_logo_url=current_tenant.logo_url
    )

    # Update tenant record
    current_tenant.logo_url = logo_url
    current_tenant.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(current_tenant)

    return current_tenant


@router.delete("/me/logo", response_model=TenantResponse)
async def delete_tenant_logo(
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Delete business logo from R2 (admin only)"""
    if current_tenant.logo_url:
        # Delete both variants from R2
        try:
            base_path = current_tenant.logo_url.replace('.jpg', '').replace('.png', '')
            ext = '.jpg'  # We always save as .jpg

            delete_tasks = [
                delete_from_r2(f"{base_path}{ext}"),  # Original
                delete_from_r2(f"{base_path}_display{ext}")  # Display variant
            ]
            await asyncio.gather(*delete_tasks, return_exceptions=True)
        except Exception as e:
            print(f"Warning: Failed to delete logo from R2: {e}")

    # Update tenant record
    current_tenant.logo_url = None
    current_tenant.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(current_tenant)

    return current_tenant


@router.get("/me/users", response_model=List[UserWithRoleResponse])
async def list_tenant_users(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """List all users in current tenant with their roles and branch assignments"""
    result = await db.execute(
        select(
            User,
            tenant_users.c.role,
            tenant_users.c.is_active,
            tenant_users.c.joined_at,
            tenant_users.c.branch_id,
            Tenant.name.label('branch_name')
        )
        .join(tenant_users, User.id == tenant_users.c.user_id)
        .outerjoin(Tenant, Tenant.id == tenant_users.c.branch_id)
        .where(tenant_users.c.tenant_id == current_tenant.id)
        .order_by(tenant_users.c.joined_at)
    )

    users_with_roles = []
    for row in result:
        user = row[0]
        role = row[1]
        
        # Compute role_type for each user
        role_type = "staff"  # Default
        if role == UserRole.ADMIN:
            if current_tenant.parent_tenant_id is None:
                role_type = "parent_org_admin"
            else:
                role_type = "branch_admin"
        
        user_dict = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "role": role,
            "role_type": role_type,
            "tenant_is_active": row[2],
            "joined_at": row[3],
            "branch_id": row[4],
            "branch_name": row[5]
        }
        users_with_roles.append(user_dict)

    return users_with_roles


@router.post("/me/users", response_model=UserResponse)
async def add_user_to_tenant(
    user_data: UserAdd,
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Manually add a user to the tenant with specified credentials (admin only).
    Does not send an email - user is given credentials directly.
    If user already exists, re-adds them to the tenant with the new password.
    """
    # Check if user already exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # User exists - check if they're already in this tenant
        result = await db.execute(
            select(tenant_users).where(
                tenant_users.c.tenant_id == current_tenant.id,
                tenant_users.c.user_id == existing_user.id
            )
        )
        existing_membership = result.first()

        if existing_membership:
            raise HTTPException(
                status_code=400,
                detail="User is already a member of this tenant"
            )

        # User exists but not in this tenant - update password and add to tenant
        existing_user.hashed_password = get_password_hash(user_data.password)
        existing_user.full_name = user_data.full_name
        user = existing_user
    else:
        # Create new user with provided password
        # Username is auto-generated from email (part before @)
        user = User(
            username=user_data.email.split('@')[0],
            email=user_data.email,
            hashed_password=get_password_hash(user_data.password),
            full_name=user_data.full_name,
            is_active=True
        )
        db.add(user)
        await db.flush()

    # Add user to tenant
    # If branch_id not specified, assign to current tenant (main location)
    branch_id = user_data.branch_id if user_data.branch_id else current_tenant.id

    await db.execute(
        insert(tenant_users).values(
            tenant_id=current_tenant.id,
            user_id=user.id,
            role=user_data.role,
            branch_id=branch_id,
            is_active=True
        )
    )

    await db.commit()
    await db.refresh(user)

    return user


@router.post("/me/users/invite", response_model=UserResponse)
async def invite_user_to_tenant(
    invite_data: UserInvite,
    background_tasks: BackgroundTasks,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Invite a user to the tenant (admin only).
    If user doesn't exist, creates a new user.
    If user exists, adds them to the tenant.
    Sends an invitation email with temporary password.
    """
    # Check if user already exists
    result = await db.execute(
        select(User).where(User.email == invite_data.email)
    )
    user = result.scalar_one_or_none()

    # Track if this is a new user (to send password in email)
    is_new_user = False
    temp_password = None

    if not user:
        # Create new user with temporary password
        is_new_user = True
        temp_password = f"temp{datetime.utcnow().timestamp()}"
        user = User(
            username=invite_data.email.split('@')[0],  # Use email prefix as username
            email=invite_data.email,
            hashed_password=get_password_hash(temp_password),
            full_name=invite_data.full_name,
            is_active=True
        )
        db.add(user)
        await db.flush()

    # Check if already a member
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == user.id
        )
    )
    existing = result.first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="User is already a member of this tenant"
        )
    
    # Add user to tenant
    # If branch_id not specified, assign to current tenant (main location)
    branch_id = invite_data.branch_id if invite_data.branch_id else current_tenant.id

    await db.execute(
        insert(tenant_users).values(
            tenant_id=current_tenant.id,
            user_id=user.id,
            role=invite_data.role,
            branch_id=branch_id,
            is_active=True
        )
    )

    # Send invitation email (only if new user with temp password)
    if is_new_user and temp_password and settings.POSTMARK_ENABLED:
        email_service = EmailService()

        # In test mode, send email synchronously to see output immediately
        # In production mode, use background task to avoid blocking the response
        if settings.EMAIL_TEST_MODE:
            print(f"DEBUG: Sending test email synchronously to {user.email}")
            await email_service.send_invitation_email(
                user_email=user.email,
                user_full_name=user.full_name,
                temp_password=temp_password,
                tenant_subdomain=current_tenant.subdomain,
                tenant_name=current_tenant.name,
                user_role=invite_data.role.value,
                invited_by=current_user.full_name
            )
        else:
            # Production: send in background
            background_tasks.add_task(
                email_service.send_invitation_email,
                user_email=user.email,
                user_full_name=user.full_name,
                temp_password=temp_password,
                tenant_subdomain=current_tenant.subdomain,
                tenant_name=current_tenant.name,
                user_role=invite_data.role.value,
                invited_by=current_user.full_name
            )

    await db.commit()
    await db.refresh(user)

    return user


@router.put("/me/users/{user_id}", response_model=UserResponse)
async def update_user_in_tenant(
    user_id: int,
    updates: UserTenantUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Update user's role, status, name, or email within the tenant (admin only)"""
    # Prevent modifying self
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot modify your own role or status"
        )

    # Check if user exists in tenant
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == user_id
        )
    )
    membership = result.first()

    if not membership:
        raise HTTPException(
            status_code=404,
            detail="User not found in this tenant"
        )

    # Get the user record for updating name/email
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one()

    # Update user's full_name if provided
    if updates.full_name is not None:
        user.full_name = updates.full_name

    # Update user's email if provided (with uniqueness check)
    if updates.email is not None and updates.email != user.email:
        # Check if email is already in use by another user
        result = await db.execute(
            select(User).where(
                User.email == updates.email,
                User.id != user_id
            )
        )
        existing_user = result.scalar_one_or_none()
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Email is already in use by another user"
            )
        user.email = updates.email

    # Build update dict for tenant_users table
    update_values = {}
    if updates.role is not None:
        update_values["role"] = updates.role
    if updates.is_active is not None:
        update_values["is_active"] = updates.is_active
    if updates.branch_id is not None:
        # Validate branch exists and belongs to current tenant
        if updates.branch_id > 0:
            result = await db.execute(
                select(Tenant).where(
                    Tenant.id == updates.branch_id,
                    Tenant.parent_tenant_id == current_tenant.id
                )
            )
            branch = result.scalar_one_or_none()
            if not branch:
                raise HTTPException(
                    status_code=400,
                    detail="Branch not found or does not belong to this tenant"
                )
        update_values["branch_id"] = updates.branch_id if updates.branch_id > 0 else None

    if update_values:
        await db.execute(
            update(tenant_users)
            .where(
                tenant_users.c.tenant_id == current_tenant.id,
                tenant_users.c.user_id == user_id
            )
            .values(**update_values)
        )

    await db.commit()
    await db.refresh(user)

    return user


@router.post("/me/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    new_password: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Reset a user's password (admin only)"""
    # Check if user exists in tenant
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == user_id
        )
    )
    membership = result.first()

    if not membership:
        raise HTTPException(
            status_code=404,
            detail="User not found in this tenant"
        )

    # Get user
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update password
    user.hashed_password = get_password_hash(new_password)
    await db.commit()

    return {"message": f"Password reset successfully for {user.email}"}


@router.get("/me/users/{user_id}/can-delete")
async def check_user_can_delete(
    user_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Check if a user can be deleted or only deactivated
    Returns information about what action is possible
    """
    # Prevent checking self
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove yourself from the tenant"
        )

    # Verify user is member of this tenant
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == user_id
        )
    )
    membership = result.first()

    if not membership:
        raise HTTPException(404, detail="User not found in this tenant")

    # Check if user has any data in this tenant
    # Check for sales created by this user
    sales_result = await db.execute(
        select(func.count(Sale.id)).where(
            Sale.tenant_id == current_tenant.id,
            Sale.user_id == user_id
        )
    )
    sales_count = sales_result.scalar() or 0

    # Check for stock movements by this user
    stock_movements_result = await db.execute(
        select(func.count(StockMovement.id))
        .select_from(StockMovement)
        .join(Product, StockMovement.product_id == Product.id)
        .where(
            Product.tenant_id == current_tenant.id,
            StockMovement.user_id == user_id
        )
    )
    stock_movements_count = stock_movements_result.scalar() or 0

    has_data = sales_count > 0 or stock_movements_count > 0

    return {
        "can_delete": not has_data,
        "can_deactivate": has_data,
        "has_data": has_data,
        "data_summary": {
            "sales": sales_count,
            "stock_movements": stock_movements_count
        }
    }


@router.delete("/me/users/{user_id}")
async def remove_user_from_tenant(
    user_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Remove or deactivate a user from the tenant (admin only)
    - If user has data (sales, stock movements), they will be deactivated
    - If user has no data, they will be removed from the tenant
    """
    # Prevent removing self
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove yourself from the tenant"
        )

    # Get user info for response message
    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(404, detail="User not found")

    # Check if user has any data in this tenant
    sales_result = await db.execute(
        select(func.count(Sale.id)).where(
            Sale.tenant_id == current_tenant.id,
            Sale.user_id == user_id
        )
    )
    sales_count = sales_result.scalar() or 0

    stock_movements_result = await db.execute(
        select(func.count(StockMovement.id))
        .select_from(StockMovement)
        .join(Product, StockMovement.product_id == Product.id)
        .where(
            Product.tenant_id == current_tenant.id,
            StockMovement.user_id == user_id
        )
    )
    stock_movements_count = stock_movements_result.scalar() or 0

    has_data = sales_count > 0 or stock_movements_count > 0

    if has_data:
        # User has data - only deactivate
        await db.execute(
            update(tenant_users)
            .where(
                tenant_users.c.tenant_id == current_tenant.id,
                tenant_users.c.user_id == user_id
            )
            .values(is_active=False)
        )
        await db.commit()

        return {
            "message": f"User '{user.full_name}' has been deactivated. Historical data preserved.",
            "action": "deactivated",
            "user_id": user_id,
            "data_summary": {
                "sales": sales_count,
                "stock_movements": stock_movements_count
            }
        }
    else:
        # User has no data - can be removed
        await db.execute(
            delete(tenant_users).where(
                tenant_users.c.tenant_id == current_tenant.id,
                tenant_users.c.user_id == user_id
            )
        )
        await db.commit()

        return {
            "message": f"User '{user.full_name}' removed from tenant",
            "action": "removed",
            "user_id": user_id
        }


@router.get("/me/usage", response_model=TenantUsageStats)
async def get_tenant_usage_stats(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get current usage statistics for subscription management"""
    # Count active users
    result = await db.execute(
        select(func.count(tenant_users.c.user_id)).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.is_active == True
        )
    )
    current_users = result.scalar() or 0
    
    # Count products
    result = await db.execute(
        select(func.count(Product.id)).where(
            Product.tenant_id == current_tenant.id
        )
    )
    current_products = result.scalar() or 0
    
    # This month's sales
    start_of_month = date.today().replace(day=1)
    result = await db.execute(
        select(
            func.count(Sale.id),
            func.sum(Sale.total)
        ).where(
            Sale.tenant_id == current_tenant.id,
            func.date(Sale.created_at) >= start_of_month
        )
    )
    row = result.first()
    sales_count = row[0] or 0
    revenue = float(row[1] or 0)
    
    return {
        "current_users": current_users,
        "max_users": current_tenant.max_users,
        "current_products": current_products,
        "max_products": current_tenant.max_products,
        "total_sales_this_month": sales_count,
        "total_revenue_this_month": revenue,
        "subscription_plan": current_tenant.subscription_plan,
        "subscription_expires_at": current_tenant.subscription_expires_at
    }


@router.delete("/me")
async def delete_tenant(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete the current tenant and all associated data (admin only).
    WARNING: This action is irreversible. All data will be permanently deleted.

    Also deletes user accounts if they only belong to this tenant.
    """
    tenant_id = current_tenant.id
    tenant_name = current_tenant.name

    # Get all users belonging to this tenant
    result = await db.execute(
        select(tenant_users.c.user_id)
        .where(tenant_users.c.tenant_id == tenant_id)
    )
    user_ids = [row[0] for row in result.all()]

    # Check each user - if they only belong to this tenant, delete the user account
    users_to_delete = []
    for user_id in user_ids:
        # Count how many tenants this user belongs to
        result = await db.execute(
            select(func.count(tenant_users.c.tenant_id))
            .where(tenant_users.c.user_id == user_id)
        )
        tenant_count = result.scalar()

        # If user only belongs to this tenant, mark for deletion
        if tenant_count == 1:
            users_to_delete.append(user_id)

    # Delete the tenant (cascade will handle related data like products, sales, etc.)
    await db.execute(
        delete(Tenant).where(Tenant.id == tenant_id)
    )

    # Delete user accounts that only belonged to this tenant
    if users_to_delete:
        await db.execute(
            delete(User).where(User.id.in_(users_to_delete))
        )

    await db.commit()

    return {
        "message": f"Business '{tenant_name}' has been permanently deleted",
        "deleted_tenant_id": tenant_id,
        "deleted_users_count": len(users_to_delete)
    }


@router.post("/me/convert-to-organization")
async def convert_tenant_to_organization(
    conversion_data: ConvertToOrganizationRequest,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """
    Convert an independent tenant into an organization (admin only).

    This process:
    1. Creates an organization record
    2. Migrates existing products → organization_products
    3. Migrates existing categories → organization_categories
    4. Creates branch_stock records for the current tenant
    5. Converts the tenant into the first branch
    6. Adds the current user as org_admin

    WARNING: This is a one-way conversion. The tenant will become a branch.
    """
    from models import Organization, OrganizationCategory, OrganizationProduct, BranchStock, Category, organization_users, OrgRole
    from schemas import ConvertToOrganizationResponse, OrganizationResponse, BranchResponse

    # Verify tenant is independent (not already part of an organization)
    if current_tenant.organization_id is not None:
        raise HTTPException(
            status_code=400,
            detail="This tenant is already part of an organization"
        )

    # Create organization
    new_org = Organization(
        name=conversion_data.organization_name,
        owner_email=current_user.email,
        currency=conversion_data.currency,
        tax_rate=conversion_data.tax_rate,
        timezone=conversion_data.timezone,
        subscription_plan=current_tenant.subscription_plan,
        max_branches=10 if current_tenant.subscription_plan == 'premium' else 3,
        is_active=True
    )
    db.add(new_org)
    await db.flush()  # Get organization ID

    # Add current user to organization as org_admin
    await db.execute(
        insert(organization_users).values(
            organization_id=new_org.id,
            user_id=current_user.id,
            role=OrgRole.ORG_ADMIN,
            is_active=True
        )
    )

    # Migrate categories
    result = await db.execute(
        select(Category).where(Category.tenant_id == current_tenant.id)
    )
    old_categories = result.scalars().all()
    category_mapping = {}  # old_id -> new_id

    for old_cat in old_categories:
        new_cat = OrganizationCategory(
            organization_id=new_org.id,
            name=old_cat.name,
            display_order=old_cat.display_order,
            icon=old_cat.icon,
            color=old_cat.color,
            is_active=old_cat.is_active,
            target_margin=old_cat.target_margin,
            minimum_margin=old_cat.minimum_margin
        )
        db.add(new_cat)
        await db.flush()
        category_mapping[old_cat.id] = new_cat.id

    # Migrate products
    result = await db.execute(
        select(Product).where(Product.tenant_id == current_tenant.id)
    )
    old_products = result.scalars().all()
    migrated_product_count = 0

    for old_prod in old_products:
        # Map category ID if exists
        new_category_id = None
        if old_prod.category_id and old_prod.category_id in category_mapping:
            new_category_id = category_mapping[old_prod.category_id]

        # Create organization product
        new_prod = OrganizationProduct(
            organization_id=new_org.id,
            name=old_prod.name,
            sku=old_prod.sku,
            description=old_prod.description,
            base_cost=old_prod.base_cost,
            selling_price=old_prod.selling_price,
            target_margin=old_prod.target_margin,
            minimum_margin=old_prod.minimum_margin,
            category_id=new_category_id,
            unit=old_prod.unit,
            image_url=old_prod.image_url,
            reorder_level=old_prod.reorder_level,
            is_available=old_prod.is_available,
            is_service=old_prod.is_service
        )
        db.add(new_prod)
        await db.flush()

        # Create branch stock for this tenant (preserving current stock quantity)
        branch_stock = BranchStock(
            tenant_id=current_tenant.id,
            org_product_id=new_prod.id,
            quantity=old_prod.quantity,
            override_selling_price=None  # Use org-level price
        )
        db.add(branch_stock)
        migrated_product_count += 1

    # Update tenant to become a branch
    current_tenant.organization_id = new_org.id
    current_tenant.branch_type = 'branch'
    current_tenant.updated_at = datetime.utcnow()

    # Delete old products and categories (data now in org tables)
    await db.execute(
        delete(Product).where(Product.tenant_id == current_tenant.id)
    )
    await db.execute(
        delete(Category).where(Category.tenant_id == current_tenant.id)
    )

    await db.commit()
    await db.refresh(new_org)
    await db.refresh(current_tenant)

    # Build response
    org_response = OrganizationResponse(
        id=new_org.id,
        name=new_org.name,
        owner_email=new_org.owner_email,
        currency=new_org.currency,
        tax_rate=new_org.tax_rate,
        timezone=new_org.timezone,
        subscription_plan=new_org.subscription_plan,
        max_branches=new_org.max_branches,
        is_active=new_org.is_active,
        created_at=new_org.created_at,
        updated_at=new_org.updated_at
    )

    branch_response = BranchResponse(
        id=current_tenant.id,
        organization_id=current_tenant.organization_id,
        name=current_tenant.name,
        subdomain=current_tenant.subdomain,
        is_active=current_tenant.is_active,
        created_at=current_tenant.created_at,
        updated_at=current_tenant.updated_at
    )

    return ConvertToOrganizationResponse(
        organization=org_response,
        branch=branch_response,
        migrated_products=migrated_product_count,
        migrated_categories=len(category_mapping),
        message=f"Successfully converted '{current_tenant.name}' to an organization with {migrated_product_count} products and {len(category_mapping)} categories migrated"
    )


# =============================================================================
# BRANCH MANAGEMENT
# =============================================================================

@router.get("/me/branches", response_model=List[BranchResponse])
async def list_branches(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """List all branch locations for the current business"""

    # Find main tenant (could be current or parent)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Get all branches for this business
    result = await db.execute(
        select(Tenant)
        .where(Tenant.parent_tenant_id == main_tenant_id)
        .order_by(Tenant.created_at)
    )
    branches = result.scalars().all()

    return branches


@router.post("/me/branches", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(
    branch_data: BranchCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Create a new branch location for the current business"""

    # Only main tenants (not branches) can create branches
    if current_tenant.parent_tenant_id is not None:
        raise HTTPException(400, detail="Only main locations can create branches")

    # Check if branch name already exists for this tenant
    existing_branch = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id == current_tenant.id,
            Tenant.name == branch_data.name
        )
    )
    if existing_branch.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"A branch with the name '{branch_data.name}' already exists. Please choose a different name."
        )

    # Auto-generate subdomain from name
    base_subdomain = branch_data.name.lower().replace(' ', '-').replace('_', '-')
    # Remove special characters, keep only alphanumeric and hyphens
    import re
    base_subdomain = re.sub(r'[^a-z0-9-]', '', base_subdomain)
    # Remove multiple consecutive hyphens
    base_subdomain = re.sub(r'-+', '-', base_subdomain)
    # Remove leading/trailing hyphens
    base_subdomain = base_subdomain.strip('-')[:30]

    # Ensure uniqueness by adding suffix if needed
    subdomain = base_subdomain
    counter = 1
    while True:
        result = await db.execute(
            select(Tenant).where(Tenant.subdomain == subdomain)
        )
        if not result.scalar_one_or_none():
            break
        subdomain = f"{base_subdomain}-{counter}"
        counter += 1

    # Create branch tenant
    new_branch = Tenant(
        name=branch_data.name,
        subdomain=subdomain,
        slug=subdomain,
        parent_tenant_id=current_tenant.id,  # Link to main business
        owner_email=current_tenant.owner_email,
        subscription_plan=current_tenant.subscription_plan,
        currency=current_tenant.currency,
        tax_rate=current_tenant.tax_rate,
        timezone=current_tenant.timezone,
        is_active=True
    )
    db.add(new_branch)
    await db.flush()  # Get branch ID

    # Determine branch admin
    admin_user_id = branch_data.admin_user_id or current_user.id

    # Link admin to branch
    await db.execute(
        insert(tenant_users).values(
            tenant_id=new_branch.id,
            user_id=admin_user_id,
            role=UserRole.ADMIN,
            branch_id=new_branch.id,
            is_active=True
        )
    )

    # Copy all products from main business to branch stock (quantity=0)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id
    result = await db.execute(
        select(Product).where(Product.tenant_id == main_tenant_id)
    )
    products = result.scalars().all()

    for product in products:
        branch_stock = BranchStock(
            tenant_id=new_branch.id,
            product_id=product.id,
            quantity=0,  # Start with 0 stock
            override_selling_price=None
        )
        db.add(branch_stock)

    await db.commit()
    await db.refresh(new_branch)

    return new_branch


@router.put("/me/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: int,
    updates: BranchUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Update branch settings (admin only)"""

    # Find main tenant (could be current or parent)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Get branch and verify it belongs to this business
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_id,
            Tenant.parent_tenant_id == main_tenant_id
        )
    )
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(404, detail="Branch not found or does not belong to your business")

    # Apply updates
    for key, value in updates.model_dump(exclude_unset=True).items():
        setattr(branch, key, value)

    branch.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(branch)

    return branch


@router.get("/me/branches/{branch_id}/can-delete")
async def check_branch_can_delete(
    branch_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Check if a branch can be deleted or only closed"""

    # Find main tenant (could be current or parent)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Get branch and verify it belongs to this business
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_id,
            Tenant.parent_tenant_id == main_tenant_id
        )
    )
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(404, detail="Branch not found or does not belong to your business")

    # Check if branch has any data
    sales_result = await db.execute(
        select(func.count(Sale.id)).where(Sale.tenant_id == branch_id)
    )
    sales_count = sales_result.scalar() or 0

    products_result = await db.execute(
        select(func.count(Product.id)).where(Product.tenant_id == branch_id)
    )
    products_count = products_result.scalar() or 0

    stock_movements_result = await db.execute(
        select(func.count(StockMovement.id))
        .select_from(StockMovement)
        .join(Product, StockMovement.product_id == Product.id)
        .where(Product.tenant_id == branch_id)
    )
    stock_movements_count = stock_movements_result.scalar() or 0

    has_data = sales_count > 0 or products_count > 0 or stock_movements_count > 0

    return {
        "can_delete": not has_data,
        "can_close": has_data,
        "has_data": has_data,
        "data_summary": {
            "sales": sales_count,
            "products": products_count,
            "stock_movements": stock_movements_count
        }
    }


@router.delete("/me/branches/{branch_id}")
async def delete_branch(
    branch_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    _: bool = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Delete or deactivate a branch (admin only)"""

    # Find main tenant (could be current or parent)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Get branch and verify it belongs to this business
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_id,
            Tenant.parent_tenant_id == main_tenant_id
        )
    )
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(404, detail="Branch not found or does not belong to your business")

    branch_name = branch.name

    # Check if branch has any data
    sales_result = await db.execute(
        select(func.count(Sale.id)).where(Sale.tenant_id == branch_id)
    )
    sales_count = sales_result.scalar() or 0

    products_result = await db.execute(
        select(func.count(Product.id)).where(Product.tenant_id == branch_id)
    )
    products_count = products_result.scalar() or 0

    stock_movements_result = await db.execute(
        select(func.count(StockMovement.id))
        .select_from(StockMovement)
        .join(Product, StockMovement.product_id == Product.id)
        .where(Product.tenant_id == branch_id)
    )
    stock_movements_count = stock_movements_result.scalar() or 0

    has_data = sales_count > 0 or products_count > 0 or stock_movements_count > 0

    if has_data:
        # Branch has data - only deactivate
        branch.is_active = False
        await db.commit()

        return {
            "message": f"Branch '{branch_name}' has been closed (deactivated). Historical data preserved.",
            "action": "closed",
            "branch_id": branch_id,
            "data_summary": {
                "sales": sales_count,
                "products": products_count,
                "stock_movements": stock_movements_count
            }
        }
    else:
        # Branch has no data - can be permanently deleted
        await db.execute(
            delete(Tenant).where(Tenant.id == branch_id)
        )
        await db.commit()

        return {
            "message": f"Branch '{branch_name}' permanently deleted",
            "action": "deleted",
            "branch_id": branch_id
        }


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================

@router.get("/check-subdomain/{subdomain}")
async def check_subdomain_availability(
    subdomain: str,
    db: AsyncSession = Depends(get_db)
):
    """PUBLIC ENDPOINT: Check if subdomain is available"""
    tenant = await get_tenant_from_subdomain(subdomain, db)
    return {
        "subdomain": subdomain,
        "available": tenant is None
    }


@router.get("/my-tenants", response_model=List[TenantSummary])
async def list_my_tenants(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all tenants the current user has access to"""
    result = await db.execute(
        select(Tenant)
        .join(tenant_users)
        .where(tenant_users.c.user_id == current_user.id)
        .where(tenant_users.c.is_active == True)
        .where(Tenant.is_active == True)
    )
    return result.scalars().all()
