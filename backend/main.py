from fastapi import FastAPI, Depends, HTTPException, status, Request, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, insert, update
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta, date
from typing import List, Optional
import logging
import os

from database import get_db, init_db, async_session_maker
from models import (
    User, Product, Sale, SaleItem, StockMovement, Category, Unit,
    OrderStatus, StockMovementType, Tenant, tenant_users, UserRole,
    Organization, OrganizationProduct, OrganizationCategory, BranchStock,
    Permission,  # NEW: RBAC Permission enum
    Customer, CreditTransaction, CreditTransactionStatus, Payment, ReminderLog,
    Expense
)
from schemas import (
    UserResponse, UserWithRoleResponse, Token, LoginRequest,
    CategoryCreate, CategoryResponse, CategoryUpdate,
    UnitCreate, UnitResponse, UnitUpdate,
    ProductCreate, ProductResponse, ProductUpdate,
    SaleCreate, SaleResponse, SaleCustomerUpdate,
    StockMovementCreate, StockMovementResponse,
    PriceHistoryResponse,
    DashboardStats, FinancialReport, TenantSummary,
    AIClassifyRequest, AIClassifyResponse, StaffMember,
    StaffPerformanceReport, PriceVarianceReport, TenantSwitchRequest,
    UserTenantMembership, LoginWithTenantsResponse,
    OrganizationProductWithBranchStock,
    ForgotPasswordRequest, ResetPasswordRequest, PasswordResetResponse,
    CustomerCreate, CustomerUpdate, CustomerResponse,
    CreditTransactionResponse, PaymentCreate, PaymentResponse,
    ReminderLogResponse,
    ExpenseCreate, ExpenseUpdate, ExpenseResponse
)
from subscription_middleware import check_branch_subscription_active
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_active_user, get_current_tenant, get_current_branch_id,
    get_tenant_from_subdomain, ACCESS_TOKEN_EXPIRE_MINUTES,
    require_admin_role, get_current_user_role_in_tenant,
    # NEW: RBAC imports
    get_user_role_type, get_branch_scope, require_permission
)
from tenants import router as tenants_router
from platform_admin import router as platform_admin_router
from subscription_api import router as subscription_router
from fastapi.staticfiles import StaticFiles
from image_utils import process_and_upload_product_image, delete_from_r2
from sku_utils import generate_unique_sku
from timezone_utils import get_tenant_today, get_tenant_date_range, utc_to_tenant_date

app = FastAPI(title="StatBricks API", version="2.0.0")

# Setup logging
logger = logging.getLogger(__name__)

# CORS configuration - allow frontend domain from environment variable
# Strip whitespace from each origin to prevent configuration errors
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],  # Expose all headers to the browser
    max_age=3600,  # Cache preflight responses for 1 hour
)

# ==================== CUSTOM EXCEPTION HANDLERS ====================

@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Custom exception handler that ensures CORS headers are included in error responses.
    
    This fixes the issue where HTTPException raised in dependencies (like subscription checks)
    would return error responses without CORS headers, causing the browser to block the response.
    """
    # Get the default error response
    response = await http_exception_handler(request, exc)
    
    # Add CORS headers if origin is allowed
    origin = request.headers.get('origin')
    if origin and origin in CORS_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = '*'
        response.headers['Access-Control-Allow-Headers'] = '*'
    
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Catch-all exception handler for unexpected errors.
    Ensures CORS headers are present even on 500 errors.
    """
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    
    response = JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )
    
    # Add CORS headers
    origin = request.headers.get('origin')
    if origin and origin in CORS_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    
    return response

# ==================== END EXCEPTION HANDLERS ====================

# Include tenant management routes
app.include_router(tenants_router)

# Include platform super admin routes
app.include_router(platform_admin_router)

# Include subscription routes
app.include_router(subscription_router)

# Mount static files for uploads
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("=" * 60)
    logger.info("Starting application initialization...")
    logger.info("=" * 60)
    
    try:
        await init_db()
        logger.info("Database initialization successful!")
    except ConnectionRefusedError as e:
        logger.error("=" * 60)
        logger.error("CRITICAL: Database connection refused!")
        logger.error(f"Error: {e}")
        logger.error("Possible causes:")
        logger.error("1. Cloud SQL Auth Proxy not ready (if using Cloud Run)")
        logger.error("2. Incorrect DATABASE_URL format")
        logger.error("3. Database server not accessible")
        logger.error("4. Network/firewall issues")
        logger.error("=" * 60)
        raise
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"CRITICAL: Application startup failed: {e}")
        logger.error("=" * 60)
        raise
    
    # Create default tenant and admin user if not exists
    async with async_session_maker() as db:
        # Check if default tenant exists
        result = await db.execute(select(Tenant).where(Tenant.subdomain == "demo"))
        default_tenant = result.scalar_one_or_none()
        
        if not default_tenant:
            # Create default tenant with trial period
            from config import settings as app_settings
            trial_end = datetime.utcnow() + timedelta(days=app_settings.TRIAL_PERIOD_DAYS)
            default_tenant = Tenant(
                name="Demo Business",
                subdomain="demo",
                slug="demo",
                owner_email="admin@statbricks.com",
                is_active=True,
                subscription_status='trial',
                trial_ends_at=trial_end,
                next_billing_date=trial_end
            )
            db.add(default_tenant)
            await db.flush()
            
            # Create default admin user
            result = await db.execute(select(User).where(User.username == "admin"))
            admin_user = result.scalar_one_or_none()
            
            if not admin_user:
                admin_user = User(
                    username="admin",
                    email="admin@statbricks.com",
                    hashed_password=get_password_hash("admin123"),
                    full_name="Admin User",
                    is_active=True
                )
                db.add(admin_user)
                await db.flush()
            
            # Link admin to default tenant
            await db.execute(
                insert(tenant_users).values(
                    tenant_id=default_tenant.id,
                    user_id=admin_user.id,
                    role=UserRole.ADMIN,
                    is_active=True
                )
            )
            
            await db.commit()
            print(f"Default tenant created: demo.statbricks.com")
            print(f"Default admin user: admin/admin123")
        
        # Bootstrap environment-based super admin (disaster recovery)
        from config import settings
        if settings.BOOTSTRAP_SUPER_ADMIN_EMAIL and settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH:
            logger.info("=" * 60)
            logger.info("Bootstrapping environment-based super admin...")
            
            # Check if admin already exists
            result = await db.execute(
                select(User).where(User.email == settings.BOOTSTRAP_SUPER_ADMIN_EMAIL)
            )
            bootstrap_admin = result.scalar_one_or_none()
            
            if bootstrap_admin:
                # Update existing admin
                bootstrap_admin.username = settings.BOOTSTRAP_SUPER_ADMIN_EMAIL  # Use email as username
                bootstrap_admin.hashed_password = settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH
                bootstrap_admin.full_name = settings.BOOTSTRAP_SUPER_ADMIN_FULL_NAME
                bootstrap_admin.is_super_admin = True
                bootstrap_admin.env_based = True
                bootstrap_admin.is_active = True
                logger.info(f"✅ Updated bootstrap admin: {settings.BOOTSTRAP_SUPER_ADMIN_EMAIL}")
            else:
                # Create new admin
                bootstrap_admin = User(
                    username=settings.BOOTSTRAP_SUPER_ADMIN_EMAIL,  # Use email as username
                    email=settings.BOOTSTRAP_SUPER_ADMIN_EMAIL,
                    hashed_password=settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH,
                    full_name=settings.BOOTSTRAP_SUPER_ADMIN_FULL_NAME,
                    is_super_admin=True,
                    env_based=True,
                    is_active=True
                )
                db.add(bootstrap_admin)
                logger.info(f"✅ Created bootstrap admin: {settings.BOOTSTRAP_SUPER_ADMIN_EMAIL}")
            
            await db.commit()
            logger.info("Bootstrap super admin ready!")
            logger.info("=" * 60)
        
        # Run subscription migration (safe - uses IF NOT EXISTS)
        try:
            from migrations.run_subscription_migration import run_subscription_migration
            await run_subscription_migration()
        except Exception as e:
            logger.warning(f"Subscription migration skipped or already applied: {e}")
        
        # Auto-seed demo data if database is empty
        from seed_demo_data import seed_demo_data_on_startup
        await seed_demo_data_on_startup(db)

    # Start subscription scheduler for daily expiry checks
    try:
        from subscription_scheduler import start_subscription_scheduler
        start_subscription_scheduler()
        logger.info("✅ Subscription scheduler started successfully")
    except Exception as e:
        logger.error(f"⚠️ Failed to start subscription scheduler: {e}")
        # Don't fail startup if scheduler fails

    # Start credit reminder scheduler
    try:
        from credit_scheduler import start_credit_scheduler
        start_credit_scheduler()
        logger.info("✅ Credit reminder scheduler started successfully")
    except Exception as e:
        logger.error(f"⚠️ Failed to start credit scheduler: {e}")

    # Validate Paystack configuration
    try:
        from paystack_service import paystack_service
        config_status = paystack_service.get_configuration_status()

        logger.info("=" * 60)
        logger.info("Paystack Payment Configuration Status")
        logger.info("=" * 60)

        if config_status['is_configured']:
            logger.info(f"✅ Paystack keys are configured (mode: {config_status['mode']})")
            logger.info(f"   Secret key: {config_status['secret_key_preview']}")
            logger.info(f"   Public key: {config_status['public_key_preview']}")

            if config_status['has_issues']:
                logger.warning("⚠️ Configuration issues detected:")
                for issue in config_status['issues']:
                    logger.warning(f"   - {issue}")
        else:
            logger.warning("⚠️ Paystack is NOT configured - payments will be unavailable")
            logger.warning("   To enable payments, set these environment variables:")
            logger.warning("   - PAYSTACK_SECRET_KEY (e.g., sk_test_... or sk_live_...)")
            logger.warning("   - PAYSTACK_PUBLIC_KEY (e.g., pk_test_... or pk_live_...)")
            logger.warning("   Get keys from: https://dashboard.paystack.co/#/settings/developers")

        logger.info("=" * 60)
    except Exception as e:
        logger.warning(f"⚠️ Could not validate Paystack configuration: {e}")


# ==================== AUTH ROUTES ====================

@app.post("/auth/login")
async def login(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login endpoint with flexible tenant resolution.

    If subdomain provided: Returns Token with tenant context (existing flow)
    If no subdomain: Returns user's tenant list for selection
    """
    # Find user by username or email
    result = await db.execute(
        select(User)
        .options(selectinload(User.tenants))
        .where((User.username == login_data.username) | (User.email == login_data.username))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Case 1: No subdomain provided - return user's tenants for selection
    if not login_data.subdomain:
        # Get all active tenant memberships for this user
        result = await db.execute(
            select(
                Tenant,
                tenant_users.c.role,
                tenant_users.c.is_active,
                tenant_users.c.branch_id
            )
            .join(tenant_users, Tenant.id == tenant_users.c.tenant_id)
            .where(
                tenant_users.c.user_id == user.id,
                tenant_users.c.is_active == True,
                Tenant.is_active == True
            )
        )
        memberships = result.all()

        if not memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not belong to any active organization"
            )

        # Organize memberships by type
        parent_memberships = {}  # parent_id -> (tenant, role, branch_id)
        branch_memberships = {}  # parent_id -> [(branch, role, branch_id), ...]

        for tenant, role, is_active, branch_id in memberships:
            if tenant.parent_tenant_id is None:
                # This is a parent or independent tenant
                parent_memberships[tenant.id] = (tenant, role, branch_id)
            else:
                # This is a branch
                if tenant.parent_tenant_id not in branch_memberships:
                    branch_memberships[tenant.parent_tenant_id] = []
                branch_memberships[tenant.parent_tenant_id].append((tenant, role, branch_id))

        # Build the display list
        tenant_list = []

        # 1. Add all parent/independent tenants user is a member of
        for parent_id, (tenant, role, branch_id) in parent_memberships.items():
            tenant_list.append({
                "tenant_id": tenant.id,
                "tenant_name": tenant.name,
                "tenant_subdomain": tenant.subdomain,
                "tenant_logo_url": tenant.logo_url,
                "role": role,
                "is_active": True
            })

        # 2. Handle branch-only access (show parent, log into parent)
        for parent_id, branches in branch_memberships.items():
            if parent_id not in parent_memberships:
                # User has branch assignment but no direct parent access
                # Show parent tenant, user will log into parent (can switch to branch after)

                # Fetch parent tenant information
                parent_result = await db.execute(
                    select(Tenant).where(Tenant.id == parent_id)
                )
                parent_tenant = parent_result.scalar_one_or_none()

                if parent_tenant and parent_tenant.is_active:
                    # Get role from first branch assignment
                    first_branch_role = branches[0][1] if branches else "staff"

                    tenant_list.append({
                        "tenant_id": parent_id,  # Log into parent tenant
                        "tenant_name": parent_tenant.name,
                        "tenant_subdomain": parent_tenant.subdomain,
                        "tenant_logo_url": parent_tenant.logo_url,
                        "role": first_branch_role,
                        "is_active": True
                    })
                    # Only add parent once, even if user has multiple branch assignments

        return {
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
                "created_at": user.created_at
            },
            "tenants": tenant_list,
            "message": "Please select a business to continue"
        }

    # Case 2: Subdomain provided - existing flow
    tenant = await get_tenant_from_subdomain(login_data.subdomain, db)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    if not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is inactive"
        )

    # Verify user has access to this tenant
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == tenant.id,
            tenant_users.c.user_id == user.id,
            tenant_users.c.is_active == True
        )
    )
    membership = result.first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to this organization"
        )

    # Users always log into the parent tenant
    # Branch access is handled via tenant switching after login
    login_tenant_id = tenant.id
    login_tenant = tenant

    # Create access token with parent tenant and branch context
    access_token = create_access_token(
        data={"sub": user.username},
        tenant_id=login_tenant_id,
        branch_id=membership.branch_id,  # NEW: Include branch assignment from tenant_users
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Update last_login_at timestamp
    await db.execute(
        tenant_users.update()
        .where(
            tenant_users.c.tenant_id == tenant.id,
            tenant_users.c.user_id == user.id
        )
        .values(last_login_at=datetime.utcnow())
    )
    await db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "tenant": {
            "id": login_tenant.id,
            "name": login_tenant.name,
            "subdomain": login_tenant.subdomain,
            "slug": login_tenant.slug,
            "is_active": login_tenant.is_active,
            "logo_url": login_tenant.logo_url,
            "parent_tenant_id": login_tenant.parent_tenant_id  # For branch detection
        },
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "role": membership.role.value,
            "branch_id": membership.branch_id  # For frontend to detect branch assignment
        }
    }


@app.get("/auth/me", response_model=UserWithRoleResponse)
async def get_me(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Get current user info with role and branch assignment"""
    # Get user's role and branch assignment in current tenant
    result = await db.execute(
        select(
            tenant_users.c.role,
            tenant_users.c.is_active,
            tenant_users.c.joined_at,
            tenant_users.c.branch_id,
            Tenant.name.label('branch_name')
        )
        .outerjoin(Tenant, Tenant.id == tenant_users.c.branch_id)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id
        )
    )
    membership = result.first()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to this tenant"
        )

    # Compute role_type for frontend badge display
    role_type = "staff"  # Default
    if membership.role == UserRole.ADMIN:
        # Check if this is a parent org or branch
        if current_tenant.parent_tenant_id is None:
            role_type = "parent_org_admin"
        else:
            role_type = "branch_admin"

    # Return user data with role and branch info
    return {
        **current_user.__dict__,
        "role": membership.role,
        "role_type": role_type,
        "tenant_is_active": membership.is_active,
        "joined_at": membership.joined_at,
        "branch_id": membership.branch_id,
        "branch_name": membership.branch_name
    }


@app.get("/auth/my-tenants", response_model=List[UserTenantMembership])
async def get_my_tenants(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all tenants the current user belongs to"""
    # Get all active tenant memberships for this user
    result = await db.execute(
        select(Tenant, tenant_users.c.role, tenant_users.c.is_active)
        .join(tenant_users, Tenant.id == tenant_users.c.tenant_id)
        .where(
            tenant_users.c.user_id == current_user.id,
            tenant_users.c.is_active == True,
            Tenant.is_active == True
        )
    )
    memberships = result.all()

    # Build tenant list
    tenant_list = []
    for row in memberships:
        tenant_list.append({
            "tenant_id": row.Tenant.id,
            "tenant_name": row.Tenant.name,
            "tenant_subdomain": row.Tenant.subdomain,
            "tenant_logo_url": row.Tenant.logo_url,
            "role": row.role,
            "is_active": row.is_active
        })

    return tenant_list


@app.post("/auth/switch-tenant", response_model=Token)
async def switch_tenant(
    switch_data: TenantSwitchRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Switch to a different tenant (business) without logging out"""
    # Get the target tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == switch_data.tenant_id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    if not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is inactive"
        )

    # Verify user has access to this tenant
    # Try direct membership first
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == tenant.id,
            tenant_users.c.user_id == current_user.id,
            tenant_users.c.is_active == True
        )
    )
    membership = result.first()

    # If no direct membership and target is a branch, check parent membership with role-based access
    if not membership and tenant.parent_tenant_id:
        result = await db.execute(
            select(tenant_users).where(
                tenant_users.c.tenant_id == tenant.parent_tenant_id,
                tenant_users.c.user_id == current_user.id,
                tenant_users.c.is_active == True
            )
        )
        parent_membership = result.first()

        if parent_membership:
            # If admin in parent, grant access to any branch (super user)
            if parent_membership.role == UserRole.ADMIN:
                membership = parent_membership
            # If staff, only allow if assigned to this specific branch
            elif parent_membership.branch_id == tenant.id:
                membership = parent_membership

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to this organization"
        )

    # Create new access token with new tenant and branch context
    access_token = create_access_token(
        data={"sub": current_user.username},
        tenant_id=tenant.id,
        branch_id=membership.branch_id,  # NEW: Include branch assignment when switching
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "subdomain": tenant.subdomain,
            "slug": tenant.slug,
            "is_active": tenant.is_active,
            "logo_url": tenant.logo_url
        },
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "is_active": current_user.is_active,
            "created_at": current_user.created_at,
            "role": membership.role.value,
            "branch_id": membership.branch_id,  # NULL for parent admins
            "tenant_is_active": membership.is_active,
            "joined_at": membership.joined_at
        }
    }


@app.post("/auth/forgot-password", response_model=PasswordResetResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request password reset - sends email with reset token.
    Public endpoint (no authentication required).
    """
    import secrets
    from email_service import EmailService
    
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()
    
    # Always return success message (security: don't reveal if email exists)
    if not user:
        return PasswordResetResponse(
            message="If an account with that email exists, a password reset link has been sent.",
            success=True
        )
    
    # Generate secure reset token (32 bytes = 64 hex characters)
    reset_token = secrets.token_urlsafe(32)
    
    # Set token expiration (1 hour from now)
    token_expires = datetime.utcnow() + timedelta(hours=1)
    
    # Store token in database
    user.reset_token = reset_token
    user.reset_token_expires = token_expires
    await db.commit()
    
    # Send reset email (async, don't block)
    email_service = EmailService()
    import asyncio
    asyncio.create_task(
        email_service.send_password_reset_email(
            user_email=user.email,
            user_full_name=user.full_name,
            reset_token=reset_token
        )
    )
    
    logger.info(f"Password reset requested for user: {user.email}")
    
    return PasswordResetResponse(
        message="If an account with that email exists, a password reset link has been sent.",
        success=True
    )


@app.post("/auth/reset-password", response_model=PasswordResetResponse)
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password using token from email.
    Public endpoint (no authentication required).
    """
    # Validate passwords match
    if not request.passwords_match():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )
    
    # Find user by reset token
    result = await db.execute(
        select(User).where(
            User.reset_token == request.token,
            User.reset_token_expires.isnot(None)
        )
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    # Check if token has expired
    if user.reset_token_expires < datetime.utcnow():
        # Clear expired token
        user.reset_token = None
        user.reset_token_expires = None
        await db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new password reset."
        )
    
    # Update password
    user.hashed_password = get_password_hash(request.new_password)
    
    # Clear reset token
    user.reset_token = None
    user.reset_token_expires = None
    
    await db.commit()
    
    logger.info(f"Password successfully reset for user: {user.email}")
    
    return PasswordResetResponse(
        message="Password has been successfully reset. You can now log in with your new password.",
        success=True
    )


# ==================== CATEGORY ROUTES (Read-Only for Tenants) ====================
# NOTE: Categories are now global and managed by super admin.
# Tenants can only view categories, not create/edit/delete them.

@app.get("/categories", response_model=List[CategoryResponse])
async def get_categories(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    active_only: bool = True
):
    """Get all global categories (read-only for tenants)"""
    query = select(Category)

    if active_only:
        query = query.where(Category.is_active == True)

    query = query.order_by(Category.display_order, Category.name)
    result = await db.execute(query)
    categories = result.scalars().all()

    # Add product count (tenant-specific) and compute effective margins for each category
    response_categories = []
    for category in categories:
        count_result = await db.execute(
            select(func.count(Product.id)).where(
                Product.category_id == category.id,
                Product.tenant_id == current_tenant.id
            )
        )
        product_count = count_result.scalar() or 0

        # Create response with effective margins (resolved with system defaults)
        category_dict = {
            'id': category.id,
            'name': category.name,
            'display_order': category.display_order,
            'icon': category.icon,
            'color': category.color,
            'is_active': category.is_active,
            'target_margin': category.target_margin,
            'minimum_margin': category.minimum_margin,
            'created_at': category.created_at,
            'updated_at': category.updated_at,
            'product_count': product_count,
            'effective_target_margin': category.target_margin if category.target_margin is not None else 25.0,
            'effective_minimum_margin': category.minimum_margin if category.minimum_margin is not None else 15.0
        }
        response_categories.append(CategoryResponse(**category_dict))

    return response_categories


@app.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_403_FORBIDDEN)
async def create_category(
    category_data: CategoryCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Categories are now managed by platform admin. Use /api/platform/categories instead."""
    raise HTTPException(
        status_code=403,
        detail="Categories are now managed globally by platform administrators. Contact support to add new categories."
    )


@app.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Categories are now managed by platform admin. Use /api/platform/categories instead."""
    raise HTTPException(
        status_code=403,
        detail="Categories are now managed globally by platform administrators. Contact support to modify categories."
    )


@app.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Categories are now managed by platform admin. Use /api/platform/categories instead."""
    raise HTTPException(
        status_code=403,
        detail="Categories are now managed globally by platform administrators. Contact support to remove categories."
    )


# ==================== UNIT ROUTES (Read-Only for Tenants) ====================
# NOTE: Units are now global and managed by super admin.
# Tenants can only view units, not create/edit/delete them.

@app.get("/units", response_model=List[UnitResponse])
async def get_units(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    active_only: bool = True
):
    """Get all global units (read-only for tenants)"""
    query = select(Unit)

    if active_only:
        query = query.where(Unit.is_active == True)

    query = query.order_by(Unit.display_order, Unit.name)
    result = await db.execute(query)
    units = result.scalars().all()

    # Add product count (tenant-specific) for each unit
    response_units = []
    for unit in units:
        count_result = await db.execute(
            select(func.count(Product.id)).where(
                Product.tenant_id == current_tenant.id,
                Product.unit == unit.name
            )
        )
        product_count = count_result.scalar() or 0

        response_units.append(UnitResponse(
            id=unit.id,
            name=unit.name,
            display_order=unit.display_order,
            is_active=unit.is_active,
            created_at=unit.created_at,
            updated_at=unit.updated_at,
            product_count=product_count
        ))

    return response_units


@app.post("/units", response_model=UnitResponse, status_code=status.HTTP_403_FORBIDDEN)
async def create_unit(
    unit_data: UnitCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Units are now managed by platform admin. Use /api/platform/units instead."""
    raise HTTPException(
        status_code=403,
        detail="Units are now managed globally by platform administrators. Contact support to add new units."
    )


@app.put("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: int,
    unit_data: UnitUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Units are now managed by platform admin. Use /api/platform/units instead."""
    raise HTTPException(
        status_code=403,
        detail="Units are now managed globally by platform administrators. Contact support to modify units."
    )


@app.delete("/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    unit_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Units are now managed by platform admin. Use /api/platform/units instead."""
    raise HTTPException(
        status_code=403,
        detail="Units are now managed globally by platform administrators. Contact support to remove units."
    )


# NOTE: The /admin/migrate-categories endpoint has been removed.
# Categories are now global and managed by super admin via /api/platform/categories.
# Legacy category migration is handled automatically on app startup.


# ==================== PRODUCT ROUTES ====================

@app.get("/products")
async def get_products(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_branch_id: Optional[int] = Depends(get_current_branch_id),  # NEW: Get branch from JWT
    db: AsyncSession = Depends(get_db),
    category_id: int = None,
    available: bool = None,
    view_branch_id: Optional[int] = None  # NEW: Allow viewing other branches
):
    """
    Get all products for current tenant.
    SIMPLIFIED: If branch, returns parent products with branch stock.
    If main tenant, returns own products.

    Cross-branch viewing: Staff can view other branches via view_branch_id (read-only).
    """
    # Determine which branch's inventory to show
    display_branch_id = current_tenant.id
    is_read_only = False

    if current_tenant.parent_tenant_id:
        # Branch mode: Use current tenant's branch
        display_branch_id = current_tenant.id

        # Allow viewing other branches if requested
        if view_branch_id and view_branch_id != current_tenant.id:
            # Validate branch belongs to same parent
            result = await db.execute(
                select(Tenant).where(
                    Tenant.id == view_branch_id,
                    Tenant.parent_tenant_id == current_tenant.parent_tenant_id
                )
            )
            other_branch = result.scalar_one_or_none()
            if other_branch:
                display_branch_id = view_branch_id
                is_read_only = True  # Viewing other branch - read-only mode

    # Check if tenant is a branch (has parent_tenant_id)
    if current_tenant.parent_tenant_id:
        # BRANCH MODE: Query parent tenant's products with branch stock
        main_tenant_id = current_tenant.parent_tenant_id

        query = (
            select(Product, BranchStock)
            .outerjoin(
                BranchStock,
                and_(
                    BranchStock.product_id == Product.id,
                    BranchStock.tenant_id == display_branch_id  # NEW: Use display_branch_id for cross-branch viewing
                )
            )
            .where(Product.tenant_id == main_tenant_id)
            .options(selectinload(Product.category_rel))
        )

        if category_id:
            query = query.where(Product.category_id == category_id)
        if available is not None:
            query = query.where(Product.is_available == available)

        query = query.order_by(Product.name)
        result = await db.execute(query)

        # Transform to include branch stock quantity
        products = []
        for product, branch_stock in result:
            product_dict = {
                "id": product.id,
                "tenant_id": product.tenant_id,
                "name": product.name,
                "sku": product.sku,
                "description": product.description,
                "base_cost": product.base_cost,
                "selling_price": branch_stock.override_selling_price if (branch_stock and branch_stock.override_selling_price) else product.selling_price,
                "target_margin": product.target_margin,
                "minimum_margin": product.minimum_margin,
                "quantity": branch_stock.quantity if branch_stock else 0,
                "category_id": product.category_id,
                "unit": product.unit,
                "image_url": product.image_url,
                "reorder_level": product.reorder_level,
                "is_available": product.is_available,
                "is_service": product.is_service,
                "created_at": product.created_at,
                "updated_at": product.updated_at,
                "category_rel": product.category_rel,
                "read_only": is_read_only  # NEW: Flag for cross-branch viewing
            }
            products.append(product_dict)

        return products

    else:
        # MAIN TENANT MODE
        
        # Determine the target view ID (Specific Branch or Default)
        # If view_branch_id is set, use it.
        # Else if current_branch_id is set (Staff assigned to branch), default to that branch.
        # Else (Admin or unassigned), use Main Location (view_target_id = None).
        
        view_target_id = None
        if view_branch_id and view_branch_id != current_tenant.id:
            view_target_id = view_branch_id
        elif current_branch_id:
            # Force branch view for assigned staff
            view_target_id = current_branch_id
            
        if view_target_id:
            # Viewing a branch (either explicitly or implicitly via assignment)
            
            # Validate branch belongs to this parent (if explicit view)
            # For implicit assignment, it's already trusted from token
            
            target_branch = None
            if view_branch_id:
                result = await db.execute(
                    select(Tenant).where(
                        Tenant.id == view_target_id,
                        Tenant.parent_tenant_id == current_tenant.id
                    )
                )
                target_branch = result.scalar_one_or_none()
            elif current_branch_id:
                # Validate that the assigned branch exists and belongs to this parent
                result = await db.execute(
                    select(Tenant).where(
                        Tenant.id == current_branch_id,
                        Tenant.parent_tenant_id == current_tenant.id
                    )
                )
                target_branch = result.scalar_one_or_none()
                
                # If branch doesn't exist, log warning but don't fail
                # This can happen during tenant switching or if assignment is stale
                if not target_branch:
                    logger.warning(
                        f"Branch assignment mismatch: user assigned to branch {current_branch_id} "
                        f"but it doesn't exist or doesn't belong to tenant {current_tenant.id}. "
                        f"Falling back to parent inventory."
                    )
                    # Fall through to default query (parent inventory)
                    view_target_id = None

            
            if target_branch:
                # Use branch stock logic
                query = (
                    select(Product, BranchStock)
                    .outerjoin(
                        BranchStock,
                        and_(
                            BranchStock.product_id == Product.id,
                            BranchStock.tenant_id == view_target_id
                        )
                    )
                    .where(Product.tenant_id == current_tenant.id)
                    .options(selectinload(Product.category_rel))
                )
                
                if category_id:
                    query = query.where(Product.category_id == category_id)
                if available is not None:
                    query = query.where(Product.is_available == available)

                query = query.order_by(Product.name)
                result = await db.execute(query)

                # Determine read-only status
                # Read-only if viewing a branch that is NOT your assigned branch
                is_read_only = False
                if current_branch_id and current_branch_id != view_target_id:
                    is_read_only = True

                # Transform results
                products = []
                for product, branch_stock in result:
                    product_dict = {
                        "id": product.id,
                        "tenant_id": product.tenant_id,
                        "name": product.name,
                        "sku": product.sku,
                        "description": product.description,
                        "base_cost": product.base_cost,
                        "selling_price": branch_stock.override_selling_price if (branch_stock and branch_stock.override_selling_price) else product.selling_price,
                        "target_margin": product.target_margin,
                        "minimum_margin": product.minimum_margin,
                        "quantity": branch_stock.quantity if branch_stock else 0,
                        "category_id": product.category_id,
                        "unit": product.unit,
                        "image_url": product.image_url,
                        "reorder_level": product.reorder_level,
                        "is_available": product.is_available,
                        "is_service": product.is_service,
                        "created_at": product.created_at,
                        "updated_at": product.updated_at,
                        "category_rel": product.category_rel,
                        "read_only": is_read_only,
                        "branch_id": view_target_id,
                        "branch_name": target_branch.name
                    }
                    products.append(product_dict)
                
                return products

        # Default: Query own products (Parent Inventory) - Only for Admins/Unassigned
        query = select(Product).where(Product.tenant_id == current_tenant.id).options(
            selectinload(Product.category_rel)
        )

        if category_id:
            query = query.where(Product.category_id == category_id)
        if available is not None:
            query = query.where(Product.is_available == available)

        query = query.order_by(Product.name)
        result = await db.execute(query)
        
        products = []
        for product in result.scalars().all():
            product_dict = {
                **product.__dict__,
                "read_only": False # Admins can edit parent inventory
            }
            products.append(product_dict)
            
        return products


# ==================== AI CLASSIFICATION ROUTES ====================

async def get_or_create_category(db: AsyncSession, tenant_id: int, name: str) -> Category:
    """Get existing category or create new one"""
    result = await db.execute(
        select(Category).where(
            Category.tenant_id == tenant_id,
            Category.name == name
        )
    )
    category = result.scalar_one_or_none()

    if not category:
        category = Category(
            tenant_id=tenant_id,
            name=name,
            display_order=999,
            icon="sparkles",  # AI-generated indicator
            color="purple-500",
            is_active=True,
            target_margin=None,  # Use system defaults (25%)
            minimum_margin=None  # Use system defaults (15%)
        )
        db.add(category)
        await db.flush()
        logger.info(f"Auto-created category '{name}' for tenant {tenant_id}")

    return category


async def get_or_create_unit(db: AsyncSession, tenant_id: int, name: str) -> Unit:
    """Get existing unit or create new one"""
    result = await db.execute(
        select(Unit).where(
            Unit.tenant_id == tenant_id,
            Unit.name == name
        )
    )
    unit = result.scalar_one_or_none()

    if not unit:
        unit = Unit(
            tenant_id=tenant_id,
            name=name,
            display_order=999,
            is_active=True
        )
        db.add(unit)
        await db.flush()
        logger.info(f"Auto-created unit '{name}' for tenant {tenant_id}")

    return unit


@app.post("/ai/classify-product", response_model=AIClassifyResponse)
async def classify_product_endpoint(
    request: AIClassifyRequest,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    AI-powered product classification endpoint.

    Classifies a product name and auto-creates category/unit if they don't exist.
    Returns IDs and names for immediate use in product creation.
    """
    from ai_classifier import classify_product, get_fallback_classification, AIClassificationError

    # Try AI classification first
    try:
        classification = await classify_product(request.name)
    except AIClassificationError as e:
        logger.warning(f"AI classification failed, using fallback: {e}")
        classification = get_fallback_classification(request.name)
    except Exception as e:
        logger.error(f"Unexpected error in classification: {e}")
        classification = get_fallback_classification(request.name)

    # Begin transaction for atomic category/unit creation
    try:
        async with db.begin_nested():
            # 1. Handle Category (create if doesn't exist)
            category = await get_or_create_category(db, current_tenant.id, classification["category"])

            # 2. Handle Unit (create if doesn't exist)
            unit = await get_or_create_unit(db, current_tenant.id, classification["unit"])

        # Commit the transaction
        await db.commit()

        # Return response with IDs and all necessary data
        return AIClassifyResponse(
            category_id=category.id,
            category_name=category.name,
            unit=unit.name,
            is_service=classification["is_service"],
            description=classification["description"],
            ai_confidence=classification["confidence"]
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in AI classification transaction: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process classification: {str(e)}")


@app.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    product_data: ProductCreate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.MANAGE_INVENTORY))
):
    """Create a new product in current tenant"""
    # Prevent product creation in branches - catalog is centrally managed
    if current_tenant.parent_tenant_id is not None:
        raise HTTPException(
            status_code=403,
            detail="Product catalog is managed centrally. Only parent/organization admins can create products. "
                   "Branch users can only manage stock quantities for existing products."
        )

    # Validate category if provided (categories are global, no tenant check needed)
    target_margin = 25.0  # System default
    minimum_margin = 15.0  # System default
    if product_data.category_id is not None:
        category_result = await db.execute(
            select(Category).where(
                Category.id == product_data.category_id,
                Category.is_active == True
            )
        )
        category = category_result.scalar_one_or_none()
        if not category:
            raise HTTPException(status_code=400, detail="Invalid category or category not found")
        # Inherit margins from category if set
        if category.target_margin is not None:
            target_margin = category.target_margin
        if category.minimum_margin is not None:
            minimum_margin = category.minimum_margin

    # AUTO-GENERATE SKU if not provided
    if not product_data.sku:
        product_data.sku = await generate_unique_sku(current_tenant.id, db)
    else:
        # If manual SKU provided, validate uniqueness (backwards compatibility)
        result = await db.execute(
            select(Product).where(
                Product.tenant_id == current_tenant.id,
                Product.sku == product_data.sku
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="SKU already exists in your organization")

    # Create product with optional pricing (start with quantity=0, use "Receive Stock" to add inventory)
    new_product = Product(
        tenant_id=current_tenant.id,
        name=product_data.name,
        sku=product_data.sku,
        barcode=product_data.barcode,
        description=product_data.description,
        base_cost=product_data.base_cost if product_data.base_cost is not None else 0.0,
        selling_price=product_data.selling_price if product_data.selling_price is not None else 0.0,
        quantity=0,  # Always start at 0 - use "Receive Stock" to add inventory
        category_id=product_data.category_id,
        unit=product_data.unit,
        image_url=product_data.image_url,
        reorder_level=10,  # Default value, will be auto-calculated later
        is_available=product_data.is_available,
        is_service=product_data.is_service,
        target_margin=target_margin,  # Inherited from category or system default
        minimum_margin=minimum_margin,  # Inherited from category or system default
        lead_time_days=7  # Default lead time for reorder calculation
    )
    db.add(new_product)
    await db.flush()  # Get product ID before committing

    # If pricing was provided (and not zero), create initial price history entry
    if (product_data.base_cost is not None and product_data.base_cost > 0 and 
        product_data.selling_price is not None and product_data.selling_price > 0):
        from models import PriceHistory
        price_history = PriceHistory(
            product_id=new_product.id,
            user_id=current_user.id,
            base_cost=product_data.base_cost,
            selling_price=product_data.selling_price,
            source="manual_update",
            reference="Initial pricing during product creation",
            notes=None
        )
        db.add(price_history)

    # Auto-sync new product to all existing branches with 0 stock
    branches_result = await db.execute(
        select(Tenant).where(Tenant.parent_tenant_id == current_tenant.id)
    )
    branches = branches_result.scalars().all()

    for branch in branches:
        branch_stock = BranchStock(
            tenant_id=branch.id,
            product_id=new_product.id,
            quantity=0,  # Branches start with 0 stock
            override_selling_price=None
        )
        db.add(branch_stock)

    await db.commit()
    await db.refresh(new_product)

    # Eagerly load category_rel for response serialization
    result = await db.execute(
        select(Product)
        .where(Product.id == new_product.id)
        .options(selectinload(Product.category_rel))
    )
    product_with_category = result.scalar_one()

    return product_with_category


@app.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),  # Need user for price history tracking
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.MANAGE_INVENTORY))
):
    """Update a product"""
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == current_tenant.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Validate category if it's being updated
    if product_data.category_id is not None:
        category_result = await db.execute(
            select(Category).where(
                Category.id == product_data.category_id,
                Category.tenant_id == current_tenant.id,
                Category.is_active == True
            )
        )
        if not category_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid category or category not found")

    # Track if pricing changed for price history
    old_base_cost = product.base_cost
    old_selling_price = product.selling_price
    pricing_changed = False

    update_data = product_data.model_dump(exclude_unset=True)

    # Check if pricing is being updated
    if 'base_cost' in update_data or 'selling_price' in update_data:
        new_base_cost = update_data.get('base_cost', old_base_cost)
        new_selling_price = update_data.get('selling_price', old_selling_price)

        # Pricing changed if both values are provided and at least one is different
        if (new_base_cost is not None and new_selling_price is not None and
            (new_base_cost != old_base_cost or new_selling_price != old_selling_price)):
            pricing_changed = True

    # Apply updates
    for key, value in update_data.items():
        setattr(product, key, value)

    product.updated_at = datetime.utcnow()

    # Create price history entry if pricing changed
    if pricing_changed:
        from models import PriceHistory
        price_history = PriceHistory(
            product_id=product.id,
            user_id=current_user.id,
            base_cost=product.base_cost,
            selling_price=product.selling_price,
            source="manual_update",
            reference="Product pricing updated",
            notes=None
        )
        db.add(price_history)

    await db.commit()

    # Eagerly load category_rel for response serialization
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.category_rel))
    )
    product_with_category = result.scalar_one()

    return product_with_category


@app.get("/products/search-by-barcode")
async def search_product_by_barcode(
    barcode: str,
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """
    Search for product by barcode (manufacturer barcode first, then SKU fallback).
    Returns first match found within current tenant.
    """
    # Determine product source (parent if branch, current if main)
    is_branch_mode = current_tenant.parent_tenant_id is not None
    product_source_tenant_id = current_tenant.parent_tenant_id if is_branch_mode else current_tenant.id

    # Priority 1: Search by barcode field
    result = await db.execute(
        select(Product).where(
            Product.tenant_id == product_source_tenant_id,
            Product.barcode == barcode,
            Product.is_available == True
        ).limit(1)
    )
    product = result.scalar_one_or_none()

    # Priority 2: Fallback to SKU search (backward compatibility)
    if not product:
        result = await db.execute(
            select(Product).where(
                Product.tenant_id == product_source_tenant_id,
                Product.sku == barcode,
                Product.is_available == True
            ).limit(1)
        )
        product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@app.post("/products/{product_id}/image", response_model=ProductResponse)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(..., description="Product image (JPG, PNG, WebP, max 5MB)"),
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.MANAGE_INVENTORY))
):
    """
    Upload product image with automatic optimization.

    Creates 3 variants:
    - Original (stored as-is)
    - Optimized (800x800px for detail views)
    - Thumbnail (300x300px for cards and lists)

    Security:
    - Validates product belongs to current tenant
    - Validates file type and size
    - Stores in tenant-specific R2 folder

    Returns: Updated product with new image_url
    """
    # Verify product exists and belongs to tenant
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == current_tenant.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Process and upload image to R2
    try:
        image_path = await process_and_upload_product_image(
            file=file,
            tenant_id=current_tenant.id,
            product_id=product_id,
            old_image_path=product.image_url
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process image: {str(e)}"
        )

    # Update product with new image path
    product.image_url = image_path
    product.updated_at = datetime.utcnow()
    await db.commit()

    # Eagerly load category_rel for response
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.category_rel))
    )
    product_with_category = result.scalar_one()

    return product_with_category


@app.delete("/products/{product_id}/image", response_model=ProductResponse)
async def delete_product_image(
    product_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.MANAGE_INVENTORY))
):
    """
    Delete product image from R2 and database.

    Security:
    - Validates product belongs to current tenant

    Deletes all variants:
    - Original
    - Optimized (800x800)
    - Thumbnail (300x300)

    Returns: Updated product with image_url set to None
    """
    # Verify product exists and belongs to tenant
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == current_tenant.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Delete image from R2 if it exists
    if product.image_url:
        try:
            await delete_from_r2(product.image_url)
        except Exception as e:
            # Log but don't fail the request if R2 deletion fails
            print(f"Warning: Failed to delete image from R2: {e}")

    # Update product to remove image reference
    product.image_url = None
    product.updated_at = datetime.utcnow()
    await db.commit()

    # Eagerly load category_rel for response
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.category_rel))
    )
    product_with_category = result.scalar_one()

    return product_with_category


@app.get("/products/{product_id}/price-history", response_model=List[PriceHistoryResponse])
async def get_product_price_history(
    product_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get price history for a product.
    Returns all pricing changes with margin calculations and user information.
    """
    # Verify product belongs to tenant
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == current_tenant.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Fetch price history
    from models import PriceHistory
    result = await db.execute(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(desc(PriceHistory.created_at))
    )
    history_records = result.scalars().all()

    # Fetch user information for each record
    user_ids = [h.user_id for h in history_records if h.user_id is not None]
    users_result = await db.execute(
        select(User).where(User.id.in_(user_ids))
    )
    users_dict = {u.id: u for u in users_result.scalars().all()}

    # Build response with computed fields
    response = []
    for record in history_records:
        # Calculate margin percentage
        margin = None
        if record.selling_price > 0:
            margin = ((record.selling_price - record.base_cost) / record.selling_price) * 100

        # Get user name
        user_name = None
        if record.user_id and record.user_id in users_dict:
            user_name = users_dict[record.user_id].full_name

        response.append(PriceHistoryResponse(
            id=record.id,
            product_id=record.product_id,
            user_id=record.user_id,
            base_cost=record.base_cost,
            selling_price=record.selling_price,
            source=record.source,
            reference=record.reference,
            notes=record.notes,
            created_at=record.created_at,
            margin_percentage=margin,
            user_full_name=user_name
        ))

    return response


# ==================== STOCK ROUTES ====================

@app.post("/stock/movement", response_model=StockMovementResponse)
async def create_stock_movement(
    movement_data: StockMovementCreate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    current_branch_id: Optional[int] = Depends(get_current_branch_id),  # NEW: Get branch from JWT
    db: AsyncSession = Depends(get_db)
):
    """
    Record stock movement (IN/OUT/ADJUSTMENT).
    Handles both Main Location stock (Product.quantity) and Branch Stock (BranchStock.quantity).

    Branch targeting (uses get_user_role_type() for proper permission check):
    - Owner (is_owner=True or admin without branch): Can specify any branch via target_branch_id
    - Branch Admin/Staff (branch_id assigned): Can only adjust their assigned branch
    """
    # Determine the product source tenant (Parent or Current)
    is_branch_mode = current_tenant.parent_tenant_id is not None
    main_tenant_id = current_tenant.parent_tenant_id if is_branch_mode else current_tenant.id

    # Get user's role type to determine permissions
    # Owners can target any branch, non-owners are restricted to their assigned branch
    role_type = await get_user_role_type(current_user, current_tenant, db)
    is_owner = (role_type == "owner")

    # Determine target branch for stock update
    target_branch_id = None

    if movement_data.target_branch_id is not None:
        # User explicitly requested a target branch
        requested_branch_id = movement_data.target_branch_id

        # Validate the requested branch belongs to this business
        result = await db.execute(
            select(Tenant).where(
                Tenant.id == requested_branch_id,
                or_(
                    Tenant.id == main_tenant_id,  # Main location
                    Tenant.parent_tenant_id == main_tenant_id  # Branch of this business
                )
            )
        )
        target_branch = result.scalar_one_or_none()

        if not target_branch:
            raise HTTPException(
                status_code=404,
                detail="Branch not found or does not belong to your business"
            )

        # Only non-owners are restricted to their assigned branch
        if not is_owner and current_branch_id and current_branch_id != requested_branch_id:
            raise HTTPException(
                status_code=403,
                detail="You can only manage stock for your assigned branch"
            )

        # If target is the main tenant, stock goes to Main Location (target_branch_id = None)
        # Otherwise, it goes to the branch
        target_branch_id = requested_branch_id if requested_branch_id != main_tenant_id else None
    else:
        # Backward compatibility: use existing logic
        # If logged in as branch -> current_tenant.id
        # If logged in as parent but assigned to branch -> current_branch_id
        # If logged in as parent and not assigned -> None (Main Location)
        target_branch_id = current_tenant.id if is_branch_mode else current_branch_id

        # Only non-owners are restricted to their assigned branch
        if not is_owner and current_branch_id and target_branch_id != current_branch_id:
            raise HTTPException(
                status_code=403,
                detail="You can only manage stock for your assigned branch"
            )

    # Use main_tenant_id as the product source
    product_source_tenant_id = main_tenant_id

    # Get product from source tenant
    result = await db.execute(
        select(Product).where(
            Product.id == movement_data.product_id,
            Product.tenant_id == product_source_tenant_id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Prevent stock movements for services
    if product.is_service:
        raise HTTPException(
            status_code=400,
            detail="Cannot track stock for service products. Services don't require inventory management."
        )

    branch_stock = None
    
    if target_branch_id:
        # BRANCH STOCK UPDATE
        # Get or create BranchStock record
        result = await db.execute(
            select(BranchStock).where(
                BranchStock.tenant_id == target_branch_id,
                BranchStock.product_id == product.id
            )
        )
        branch_stock = result.scalar_one_or_none()
        
        if not branch_stock:
            # Create if missing (should exist if product synced, but safe to create)
            branch_stock = BranchStock(
                tenant_id=target_branch_id,
                product_id=product.id,
                quantity=0
            )
            db.add(branch_stock)
            await db.flush()
            
        previous_stock = branch_stock.quantity
    else:
        # MAIN LOCATION UPDATE
        previous_stock = product.quantity

    # Calculate new stock
    new_stock = previous_stock
    
    if movement_data.movement_type == StockMovementType.IN:
        new_stock += movement_data.quantity
    elif movement_data.movement_type == StockMovementType.OUT:
        new_stock -= movement_data.quantity
    elif movement_data.movement_type == StockMovementType.ADJUSTMENT:
        new_stock += movement_data.quantity  # Adjustment adds the diff? 
        # Wait, usually adjustment means "set to X". 
        # But StockMovement logic above was: new_stock += quantity. 
        # If quantity is negative, it reduces.
        # Let's keep existing behavior: quantity is the delta.
    
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    # Apply update
    if target_branch_id:
        branch_stock.quantity = new_stock
    else:
        product.quantity = new_stock

    # Update pricing if provided (for receipts or adjustments)
    pricing_updated = False
    if movement_data.base_cost is not None and movement_data.selling_price is not None:
        # Update product pricing to latest values
        product.base_cost = movement_data.base_cost
        product.selling_price = movement_data.selling_price
        pricing_updated = True

    # Record movement with pricing information
    movement = StockMovement(
        product_id=movement_data.product_id,
        user_id=current_user.id,
        movement_type=movement_data.movement_type,
        quantity=movement_data.quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        base_cost=movement_data.base_cost,
        selling_price=movement_data.selling_price,
        supplier=movement_data.supplier,
        reference=movement_data.reference,
        notes=movement_data.notes,
        branch_stock_id=branch_stock.id if branch_stock else None  # Link to branch stock if applicable
    )

    db.add(movement)

    # Create price history entry if pricing was provided
    if pricing_updated:
        from models import PriceHistory

        # Determine source based on movement type
        if movement_data.movement_type == StockMovementType.IN:
            source = "receipt"
        elif movement_data.movement_type == StockMovementType.ADJUSTMENT:
            source = "adjustment"
        else:
            source = "manual_update"

        price_history = PriceHistory(
            product_id=product.id,
            user_id=current_user.id,
            base_cost=movement_data.base_cost,
            selling_price=movement_data.selling_price,
            source=source,
            reference=movement_data.reference or movement_data.supplier,
            notes=movement_data.notes
        )
        db.add(price_history)

    await db.commit()
    await db.refresh(movement)
    
    result = await db.execute(
        select(StockMovement)
        .options(
            selectinload(StockMovement.product).selectinload(Product.category_rel),
            selectinload(StockMovement.user)
        )
        .where(StockMovement.id == movement.id)
    )
    return result.scalar_one()


@app.get("/stock/history", response_model=List[StockMovementResponse])
async def get_stock_history(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    product_id: int = None
):
    """Get stock movement history for current tenant"""
    query = select(StockMovement).join(Product).where(
        Product.tenant_id == current_tenant.id
    ).options(
        selectinload(StockMovement.product).selectinload(Product.category_rel),
        selectinload(StockMovement.user)
    ).order_by(desc(StockMovement.created_at))
    
    if product_id:
        query = query.where(StockMovement.product_id == product_id)
    
    result = await db.execute(query)
    return result.scalars().all()


# ==================== BRANCH ROUTES ====================

@app.get("/branches/{branch_id}/stock")
async def get_branch_stock(
    branch_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_branch_id: Optional[int] = Depends(get_current_branch_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get stock levels for a specific branch.
    - Admins: Can view any branch under their business
    - Branch staff: Can view any branch (read-only for other branches)
    """
    # Determine main tenant ID (parent or self)
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Validate branch belongs to the same business
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_id,
            or_(
                Tenant.id == main_tenant_id,  # Main tenant viewing itself
                Tenant.parent_tenant_id == main_tenant_id  # Branch under this business
            )
        )
    )
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=404,
            detail="Branch not found or does not belong to your business"
        )

    # Check if requesting main location stock (not a branch)
    is_main_location = branch_id == main_tenant_id

    # Get all products from main business with branch-specific stock
    query = (
        select(Product, BranchStock)
        .outerjoin(
            BranchStock,
            and_(
                BranchStock.product_id == Product.id,
                BranchStock.tenant_id == branch_id
            )
        )
        .where(Product.tenant_id == main_tenant_id)
        .options(selectinload(Product.category_rel))
        .order_by(Product.name)
    )

    result = await db.execute(query)

    # Determine if this is read-only view
    is_read_only = current_branch_id and current_branch_id != branch_id

    # Build response with branch stock info
    products = []
    for product, branch_stock in result:
        # For main location, use Product.quantity (actual stock)
        # For branches, use BranchStock.quantity (branch-specific stock)
        if is_main_location:
            quantity = product.quantity  # Main location uses Product table
        else:
            quantity = branch_stock.quantity if branch_stock else 0  # Branches use BranchStock table
        
        product_dict = {
            "id": product.id,
            "tenant_id": product.tenant_id,
            "name": product.name,
            "sku": product.sku,
            "description": product.description,
            "base_cost": product.base_cost,
            "selling_price": branch_stock.override_selling_price if (branch_stock and branch_stock.override_selling_price) else product.selling_price,
            "quantity": quantity,
            "category_id": product.category_id,
            "unit": product.unit,
            "image_url": product.image_url,
            "reorder_level": product.reorder_level,
            "is_available": product.is_available,
            "is_service": product.is_service,
            "category_rel": product.category_rel,
            "read_only": is_read_only,  # Flag for frontend
            "branch_id": branch_id,
            "branch_name": branch.name
        }
        products.append(product_dict)

    return products


@app.put("/branches/{branch_id}/stock/{product_id}")
async def update_branch_stock(
    branch_id: int,
    product_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_branch_id: Optional[int] = Depends(get_current_branch_id),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    quantity: int = None,
    override_selling_price: Optional[float] = None
):
    """
    Update branch stock quantity and/or override selling price.
    - Admins: Can update any branch
    - Branch staff: Can only update their assigned branch
    """
    # Enforce branch lock for staff
    if current_branch_id and current_branch_id != branch_id:
        raise HTTPException(
            status_code=403,
            detail="You can only modify stock for your assigned branch"
        )

    # Determine main tenant ID
    main_tenant_id = current_tenant.parent_tenant_id or current_tenant.id

    # Validate branch belongs to business
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == branch_id,
            or_(
                Tenant.id == main_tenant_id,
                Tenant.parent_tenant_id == main_tenant_id
            )
        )
    )
    branch = result.scalar_one_or_none()

    if not branch:
        raise HTTPException(
            status_code=404,
            detail="Branch not found or does not belong to your business"
        )

    # Validate product belongs to business
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.tenant_id == main_tenant_id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found or does not belong to your business"
        )

    # Get or create BranchStock
    result = await db.execute(
        select(BranchStock).where(
            BranchStock.tenant_id == branch_id,
            BranchStock.product_id == product_id
        )
    )
    branch_stock = result.scalar_one_or_none()

    if not branch_stock:
        # Create new BranchStock record
        branch_stock = BranchStock(
            tenant_id=branch_id,
            product_id=product_id,
            quantity=quantity if quantity is not None else 0,
            override_selling_price=override_selling_price
        )
        db.add(branch_stock)
    else:
        # Update existing BranchStock
        previous_quantity = branch_stock.quantity

        if quantity is not None:
            branch_stock.quantity = quantity

            # Create stock movement for audit trail
            movement = StockMovement(
                product_id=product_id,
                branch_stock_id=branch_stock.id,
                user_id=current_user.id,
                movement_type=StockMovementType.ADJUSTMENT,
                quantity=quantity - previous_quantity,
                previous_stock=previous_quantity,
                new_stock=quantity,
                notes=f"Branch stock adjustment for {branch.name}"
            )
            db.add(movement)

        if override_selling_price is not None:
            branch_stock.override_selling_price = override_selling_price

    await db.commit()
    await db.refresh(branch_stock)

    return {
        "id": branch_stock.id,
        "tenant_id": branch_stock.tenant_id,
        "product_id": branch_stock.product_id,
        "quantity": branch_stock.quantity,
        "override_selling_price": branch_stock.override_selling_price,
        "branch_name": branch.name,
        "product_name": product.name
    }


# ==================== SALES ROUTES ====================

@app.post("/sales", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
async def create_sale(
    sale_data: SaleCreate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    current_branch_id: Optional[int] = Depends(get_current_branch_id),  # Get branch from JWT (may be stale)
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new sale.
    SIMPLIFIED: Works with branch products or main tenant products.
    Tracks which branch created the sale via branch_id.
    Customer info can be added later from Sales History.
    
    IMPORTANT: Queries database for user's current branch assignment
    to prevent sales being recorded to wrong branch due to stale JWT tokens.
    """
    subtotal = 0
    sale_items_data = []

    # Check if tenant is a branch (has parent_tenant_id)
    is_branch_mode = current_tenant.parent_tenant_id is not None

    # Determine sale's branch:
    # - If current tenant is a branch, use its ID
    # - Otherwise, query database for user's CURRENT branch assignment (not JWT which may be stale)
    if is_branch_mode:
        sale_branch_id = current_tenant.id
    else:
        # Query database for user's current branch assignment
        result = await db.execute(
            select(tenant_users.c.branch_id)
            .where(
                tenant_users.c.tenant_id == current_tenant.id,
                tenant_users.c.user_id == current_user.id,
                tenant_users.c.is_active == True
            )
        )
        db_branch_id = result.scalar_one_or_none()
        sale_branch_id = db_branch_id  # Use database value, not JWT

    # Validate staff can only create sales for their assigned branch
    if current_branch_id and sale_branch_id != current_branch_id:
        raise HTTPException(
            status_code=403,
            detail="You can only create sales for your assigned branch"
        )

    # Determine the product source tenant (Parent or Current)
    product_source_tenant_id = current_tenant.parent_tenant_id if is_branch_mode else current_tenant.id

    for item in sale_data.items:
        # Get product from source tenant
        result = await db.execute(
            select(Product).where(
                Product.id == item.product_id,
                Product.tenant_id == product_source_tenant_id
            )
        )
        product = result.scalar_one_or_none()

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        # Determine Price and Stock Source
        branch_stock = None

        # Determine standard price (before custom override)
        standard_price = product.selling_price

        # If this is a branch sale (either logged in as branch OR staff assigned to branch), use BranchStock
        if sale_branch_id:
            # Get branch stock
            result = await db.execute(
                select(BranchStock).where(
                    BranchStock.tenant_id == sale_branch_id,
                    BranchStock.product_id == product.id
                )
            )
            branch_stock = result.scalar_one_or_none()

            # Use branch price override if available
            if branch_stock and branch_stock.override_selling_price:
                standard_price = branch_stock.override_selling_price

            # Check stock against BranchStock
            if not product.is_service:
                current_stock = branch_stock.quantity if branch_stock else 0
                if current_stock < item.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock for {product.name} at this branch. Available: {current_stock}"
                    )
        else:
            # Main Location Sale - Check stock against Global Product Quantity
            if not product.is_service and product.quantity < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.name}. Available: {product.quantity}"
                )

        # Check for custom price override
        if item.custom_price is not None:
            # Allow custom price (even below cost - frontend shows warning)
            selling_price = item.custom_price
        else:
            selling_price = standard_price

        item_subtotal = selling_price * item.quantity
        subtotal += item_subtotal

        sale_items_data.append({
            "product": product,
            "branch_stock": branch_stock,
            "quantity": item.quantity,
            "price": selling_price,
            "subtotal": item_subtotal
        })

    # VAT-INCLUSIVE CALCULATION
    # Product prices already include VAT, so we extract it
    total = subtotal  # Total is the sum of all items (VAT already included)
    # Extract VAT from the total price
    subtotal_excl_vat = total / (1 + current_tenant.tax_rate)
    tax = total - subtotal_excl_vat
    
    # Update subtotal to be VAT-exclusive for storage
    subtotal = subtotal_excl_vat

    # Credit payment validation
    credit_customer = None
    if sale_data.payment_method == "Credit":
        if not sale_data.customer_id:
            raise HTTPException(status_code=400, detail="customer_id is required for Credit payment")
        # Fetch customer scoped to tenant
        result = await db.execute(
            select(Customer).where(
                Customer.id == sale_data.customer_id,
                Customer.tenant_id == current_tenant.id
            )
        )
        credit_customer = result.scalar_one_or_none()
        if not credit_customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        # Enforce credit limit if set
        if credit_customer.credit_limit is not None:
            if credit_customer.current_balance + total > credit_customer.credit_limit:
                raise HTTPException(
                    status_code=400,
                    detail=f"Credit limit exceeded. Limit: {credit_customer.credit_limit}, Current balance: {credit_customer.current_balance}, Sale total: {total}"
                )

    # Create Sale
    new_sale = Sale(
        tenant_id=current_tenant.id,
        user_id=current_user.id,
        branch_id=sale_branch_id,  # NEW: Track which branch created this sale
        customer_id=sale_data.customer_id if sale_data.payment_method == "Credit" else None,
        customer_name=getattr(sale_data, 'customer_name', None),
        customer_email=getattr(sale_data, 'customer_email', None),
        customer_phone=getattr(sale_data, 'customer_phone', None),
        payment_method=sale_data.payment_method,
        notes=getattr(sale_data, 'notes', None),
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=OrderStatus.COMPLETED
    )

    db.add(new_sale)
    await db.commit()
    await db.refresh(new_sale)

    # Create SaleItems and update stock
    for item_data in sale_items_data:
        product = item_data["product"]
        branch_stock = item_data.get("branch_stock") # May be None if main location sale
        quantity = item_data["quantity"]

        # Only deduct stock for physical products
        if not product.is_service:
            if sale_branch_id:
                # BRANCH SALE: Deduct from BranchStock
                if not branch_stock:
                    # Should have been caught in validation, but double check
                    # Auto-create if missing (e.g. if validation was skipped for some reason)
                    branch_stock = BranchStock(
                        tenant_id=sale_branch_id,
                        product_id=product.id,
                        quantity=0
                    )
                    db.add(branch_stock)
                    await db.flush()

                previous_stock = branch_stock.quantity
                branch_stock.quantity -= quantity
                
                # Create stock movement for Branch
                movement = StockMovement(
                    product_id=product.id,
                    branch_stock_id=branch_stock.id,
                    user_id=current_user.id,
                    movement_type=StockMovementType.OUT,
                    quantity=quantity,
                    previous_stock=previous_stock,
                    new_stock=branch_stock.quantity,
                    notes=f"Sale #{new_sale.id} (Branch)"
                )
                db.add(movement)
                
            else:
                # MAIN LOCATION SALE: Deduct from Product (Global/Main Stock)
                previous_stock = product.quantity
                product.quantity -= quantity

                movement = StockMovement(
                    product_id=product.id,
                    user_id=current_user.id,
                    movement_type=StockMovementType.OUT,
                    quantity=quantity,
                    previous_stock=previous_stock,
                    new_stock=product.quantity,
                    notes=f"Sale #{new_sale.id}"
                )
                db.add(movement)

        # Create sale item
        sale_item = SaleItem(
            sale_id=new_sale.id,
            product_id=product.id,
            branch_stock_id=branch_stock.id if branch_stock else None,
            quantity=quantity,
            price=item_data["price"],
            subtotal=item_data["subtotal"]
        )
        db.add(sale_item)

    # Create CreditTransaction if payment method is Credit
    if sale_data.payment_method == "Credit" and credit_customer:
        credit_due_date = sale_data.due_date or (date.today() + timedelta(days=30))
        credit_txn = CreditTransaction(
            tenant_id=current_tenant.id,
            customer_id=credit_customer.id,
            sale_id=new_sale.id,
            original_amount=total,
            amount_paid=0.0,
            amount_due=total,
            due_date=credit_due_date,
            status=CreditTransactionStatus.PENDING
        )
        db.add(credit_txn)
        # Update customer balance
        credit_customer.current_balance += total

    await db.commit()

    # Fetch complete sale with relationships for response
    result = await db.execute(
        select(Sale)
        .options(
            selectinload(Sale.sale_items).selectinload(SaleItem.product).selectinload(Product.category_rel),
            selectinload(Sale.user),
            selectinload(Sale.branch)
        )
        .where(Sale.id == new_sale.id)
    )
    complete_sale = result.scalar_one()

    return complete_sale


@app.get("/sales", response_model=List[SaleResponse])
async def get_sales(
    days: Optional[int] = None,  # Date range filter
    staff_id: Optional[int] = None,  # Admin can filter by specific staff
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sales for current tenant with optional date and staff filtering"""
    # Get user's role
    user_role = await get_current_user_role_in_tenant(current_user, current_tenant, db)

    # Build query conditions
    conditions = [Sale.tenant_id == current_tenant.id]

    # Role-based filtering
    if user_role == 'staff':
        # Staff can only see their own sales
        conditions.append(Sale.user_id == current_user.id)
    elif user_role == 'admin' and staff_id:
        # Admin can optionally filter by specific staff member
        conditions.append(Sale.user_id == staff_id)

    # Date range filtering (if specified)
    if days is not None:
        start_date = datetime.utcnow() - timedelta(days=days)
        conditions.append(Sale.created_at >= start_date)

    # Build and execute query
    query = select(Sale).where(
        *conditions
    ).options(
        selectinload(Sale.sale_items).selectinload(SaleItem.product).selectinload(Product.category_rel),
        selectinload(Sale.user),
        selectinload(Sale.branch)
    ).order_by(desc(Sale.created_at))

    result = await db.execute(query)
    return result.scalars().all()


@app.get("/sales/summary")
async def get_sales_summary(
    days: Optional[int] = None,
    staff_id: Optional[int] = None,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sales summary (total revenue and total sales count)"""
    # Get user's role
    user_role = await get_current_user_role_in_tenant(current_user, current_tenant, db)

    # Build conditions
    conditions = [Sale.tenant_id == current_tenant.id]

    if user_role == 'staff':
        conditions.append(Sale.user_id == current_user.id)
    elif user_role == 'admin' and staff_id:
        conditions.append(Sale.user_id == staff_id)

    if days is not None:
        start_date = datetime.utcnow() - timedelta(days=days)
        conditions.append(Sale.created_at >= start_date)

    # Total revenue
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Sale.total), 0))
        .where(*conditions)
    )
    total_revenue = float(revenue_result.scalar() or 0)

    # Total sales count
    sales_result = await db.execute(
        select(func.count(Sale.id))
        .where(*conditions)
    )
    total_sales = sales_result.scalar() or 0

    return {
        "total_revenue": total_revenue,
        "total_sales": total_sales
    }


@app.put("/sales/{sale_id}/customer", response_model=SaleResponse)
async def update_sale_customer(
    sale_id: int,
    customer_data: SaleCustomerUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update customer information for an existing sale"""
    # Get sale
    result = await db.execute(
        select(Sale)
        .options(
            selectinload(Sale.sale_items).selectinload(SaleItem.product).selectinload(Product.category_rel),
            selectinload(Sale.user),
            selectinload(Sale.branch)
        )
        .where(Sale.id == sale_id, Sale.tenant_id == current_tenant.id)
    )
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Update customer fields
    if customer_data.customer_name is not None:
        sale.customer_name = customer_data.customer_name
    if customer_data.customer_email is not None:
        sale.customer_email = customer_data.customer_email
    if customer_data.customer_phone is not None:
        sale.customer_phone = customer_data.customer_phone
    
    await db.commit()
    await db.refresh(sale)
    
    return sale


@app.post("/sales/{sale_id}/send-email")
async def send_email_receipt(
    sale_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send email receipt for an existing sale"""
    # Get sale with relationships
    result = await db.execute(
        select(Sale)
        .options(
            selectinload(Sale.sale_items).selectinload(SaleItem.product).selectinload(Product.category_rel),
            selectinload(Sale.user),
            selectinload(Sale.branch)
        )
        .where(Sale.id == sale_id, Sale.tenant_id == current_tenant.id)
    )
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if not sale.customer_email:
        raise HTTPException(status_code=400, detail="No customer email on file for this sale")
    
    # Send email
    from email_service import EmailService
    email_service = EmailService()
    
    try:
        await email_service.send_receipt_email(
            customer_email=sale.customer_email,
            sale=sale,
            tenant=current_tenant,
            cashier_name=current_user.full_name
        )
        
        # Mark as sent
        sale.email_sent = True
        await db.commit()
        
        return {"message": f"Receipt sent to {sale.customer_email}", "success": True}
    except Exception as e:
        logger.error(f"Failed to send email receipt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@app.post("/sales/{sale_id}/mark-whatsapp-sent")
async def mark_whatsapp_sent(
    sale_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark WhatsApp receipt as sent for tracking purposes"""
    result = await db.execute(
        select(Sale).where(Sale.id == sale_id, Sale.tenant_id == current_tenant.id)
    )
    sale = result.scalar_one_or_none()
    
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    sale.whatsapp_sent = True
    await db.commit()
    
    return {"message": "WhatsApp receipt marked as sent", "success": True}


# ==================== CUSTOMER CREDIT ROUTES ====================

@app.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    customer_data: CustomerCreate,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new customer in the current tenant"""
    new_customer = Customer(
        tenant_id=current_tenant.id,
        name=customer_data.name,
        email=customer_data.email,
        phone=customer_data.phone,
        credit_limit=customer_data.credit_limit,
        notes=customer_data.notes
    )
    db.add(new_customer)
    await db.commit()
    await db.refresh(new_customer)
    return new_customer


@app.get("/customers", response_model=List[CustomerResponse])
async def get_customers(
    search: Optional[str] = None,
    has_balance: Optional[bool] = None,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List customers for the current tenant with optional search and balance filter"""
    query = select(Customer).where(Customer.tenant_id == current_tenant.id)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Customer.name.ilike(search_term),
                Customer.email.ilike(search_term)
            )
        )

    if has_balance is not None:
        if has_balance:
            query = query.where(Customer.current_balance > 0)
        else:
            query = query.where(Customer.current_balance == 0)

    query = query.order_by(desc(Customer.current_balance), Customer.name)
    result = await db.execute(query)
    return result.scalars().all()


@app.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single customer by ID"""
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == current_tenant.id
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@app.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    customer_data: CustomerUpdate,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a customer"""
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == current_tenant.id
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    for field, value in customer_data.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)

    await db.commit()
    await db.refresh(customer)
    return customer


@app.get("/customers/{customer_id}/credit", response_model=List[CreditTransactionResponse])
async def get_customer_credit(
    customer_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get credit transactions for a customer"""
    # Verify customer belongs to tenant
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == current_tenant.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.customer_id == customer_id,
            CreditTransaction.tenant_id == current_tenant.id
        ).order_by(desc(CreditTransaction.created_at))
    )
    return result.scalars().all()


@app.post("/customers/{customer_id}/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    customer_id: int,
    payment_data: PaymentCreate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a payment against a credit transaction"""
    # Verify customer
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == current_tenant.id
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Verify credit transaction belongs to customer and tenant
    result = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.id == payment_data.credit_transaction_id,
            CreditTransaction.customer_id == customer_id,
            CreditTransaction.tenant_id == current_tenant.id
        )
    )
    credit_txn = result.scalar_one_or_none()
    if not credit_txn:
        raise HTTPException(status_code=404, detail="Credit transaction not found")

    # Validate payment amount
    if payment_data.amount > credit_txn.amount_due:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ({payment_data.amount}) exceeds amount due ({credit_txn.amount_due})"
        )

    # Create payment
    new_payment = Payment(
        tenant_id=current_tenant.id,
        customer_id=customer_id,
        credit_transaction_id=credit_txn.id,
        amount=payment_data.amount,
        payment_method=payment_data.payment_method,
        payment_date=payment_data.payment_date,
        notes=payment_data.notes
    )
    db.add(new_payment)

    # Update credit transaction
    credit_txn.amount_paid += payment_data.amount
    credit_txn.amount_due -= payment_data.amount

    if credit_txn.amount_due <= 0:
        credit_txn.status = CreditTransactionStatus.PAID
        credit_txn.amount_due = 0.0
    else:
        credit_txn.status = CreditTransactionStatus.PARTIALLY_PAID

    # Update customer balance
    customer.current_balance -= payment_data.amount
    if customer.current_balance < 0:
        customer.current_balance = 0.0

    await db.commit()
    await db.refresh(new_payment)
    return new_payment


@app.get("/customers/{customer_id}/payments", response_model=List[PaymentResponse])
async def get_customer_payments(
    customer_id: int,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment history for a customer"""
    # Verify customer belongs to tenant
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == current_tenant.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(Payment).where(
            Payment.customer_id == customer_id,
            Payment.tenant_id == current_tenant.id
        ).order_by(desc(Payment.created_at))
    )
    return result.scalars().all()


@app.get("/credit/reminders", response_model=List[ReminderLogResponse])
async def get_reminder_logs(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_admin_role)
):
    """Get reminder logs (admin only)"""
    result = await db.execute(
        select(ReminderLog)
        .join(CreditTransaction, ReminderLog.credit_transaction_id == CreditTransaction.id)
        .where(CreditTransaction.tenant_id == current_tenant.id)
        .order_by(desc(ReminderLog.sent_at))
    )
    return result.scalars().all()


# ==================== DASHBOARD ROUTES ====================

@app.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    role_type: str = Depends(get_user_role_type),  # NEW: RBAC role type
    branch_scope: Optional[int] = Depends(get_branch_scope),  # NEW: RBAC branch scope
    staff_id: Optional[int] = None,  # Owner/admin can filter by specific staff member
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.VIEW_DASHBOARD))  # NEW: Permission check
):
    """
    Get dashboard statistics for current tenant (RBAC filtering).
    - Owner: Tenant-wide access
    - Branch Admin: Branch-specific access
    - Staff: No access (permission denied)
    """

    # Determine which user's sales to show
    if role_type == "staff":
        # Staff can only see their own data (though they shouldn't reach here due to permission check)
        filter_user_id = current_user.id
    elif staff_id:
        # Owner/admin filtering by specific staff member
        filter_user_id = staff_id
    else:
        # Owner/admin viewing overall data
        filter_user_id = None

    # Determine which tenant IDs to include (main + branches for aggregated view)
    tenant_ids = [current_tenant.id]

    # Branch filtering based on RBAC scope
    filter_branch_id = branch_scope  # None for owner, branch_id for branch_admin

    # If owner and no branch filter, include all branches
    if role_type == "owner" and not filter_branch_id:
        branches_result = await db.execute(
            select(Tenant.id).where(Tenant.parent_tenant_id == current_tenant.id)
        )
        branch_ids = [row[0] for row in branches_result.all()]
        tenant_ids.extend(branch_ids)

    # Total revenue and sales (with optional user and branch filters)
    query = select(func.sum(Sale.total), func.count(Sale.id)).where(
        Sale.tenant_id.in_(tenant_ids),  # Include main + all branches
        Sale.status == OrderStatus.COMPLETED
    )
    if filter_user_id:
        query = query.where(Sale.user_id == filter_user_id)
    if filter_branch_id:
        # FIXED: Handle main location (branch_id is None) vs actual branches
        if filter_branch_id == current_tenant.id:
            # Filtering by main location: include sales where branch_id is None OR equals main tenant
            query = query.where(or_(Sale.branch_id == None, Sale.branch_id == current_tenant.id))
        else:
            # Filtering by actual branch: exact match
            query = query.where(Sale.branch_id == filter_branch_id)

    result = await db.execute(query)
    total_revenue, total_sales = result.one()
    total_revenue = float(total_revenue or 0)
    total_sales = int(total_sales or 0)

    # Total products and low stock (not filtered by user)
    result = await db.execute(
        select(func.count(Product.id)).where(Product.tenant_id == current_tenant.id)
    )
    total_products = result.scalar() or 0

    # Only count low stock for physical products
    result = await db.execute(
        select(func.count(Product.id))
        .where(
            Product.tenant_id == current_tenant.id,
            Product.is_service == False,
            Product.quantity <= Product.reorder_level
        )
    )
    low_stock_items = result.scalar() or 0

    # Stock value - only calculate for owner/branch_admin users (sensitive data)
    if role_type in ["owner", "branch_admin"]:
        result = await db.execute(
            select(func.sum(Product.base_cost * Product.quantity))
            .where(
                Product.tenant_id == current_tenant.id,
                Product.is_service == False
            )
        )
        total_stock_value = float(result.scalar() or 0)
    else:
        # Don't expose stock value to staff
        total_stock_value = None

    # Today's stats (with optional user and branch filters) - TIMEZONE AWARE
    # Use tenant's timezone for "today" calculation
    start_today_utc, end_today_utc = get_tenant_date_range(1, current_tenant.timezone)
    today_query = select(func.sum(Sale.total), func.count(Sale.id)).where(
        Sale.tenant_id.in_(tenant_ids),  # Include main + all branches
        Sale.status == OrderStatus.COMPLETED,
        Sale.created_at >= start_today_utc,
        Sale.created_at <= end_today_utc
    )
    if filter_user_id:
        today_query = today_query.where(Sale.user_id == filter_user_id)
    if filter_branch_id:
        # FIXED: Handle main location (branch_id is None) vs actual branches
        if filter_branch_id == current_tenant.id:
            # Filtering by main location: include sales where branch_id is None OR equals main tenant
            today_query = today_query.where(or_(Sale.branch_id == None, Sale.branch_id == current_tenant.id))
        else:
            # Filtering by actual branch: exact match
            today_query = today_query.where(Sale.branch_id == filter_branch_id)

    result = await db.execute(today_query)
    today_revenue, today_sales = result.one()
    today_revenue = float(today_revenue or 0)
    today_sales = int(today_sales or 0)

    return {
        "total_revenue": total_revenue,
        "total_sales": total_sales,
        "total_products": total_products,
        "low_stock_items": low_stock_items,
        "total_stock_value": total_stock_value,
        "today_revenue": today_revenue,
        "today_sales": today_sales
    }


@app.get("/reports/financial", response_model=FinancialReport)
async def get_financial_report(
    days: int = 30,
    branch_id: Optional[int] = Query(None, description="Filter by branch (owners only)"),  # NEW: Branch filter parameter
    staff_id: Optional[int] = None,  # Owner/admin can filter by specific staff member
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    role_type: str = Depends(get_user_role_type),  # NEW: RBAC role type
    branch_scope: Optional[int] = Depends(get_branch_scope),  # NEW: RBAC branch scope
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(require_permission(Permission.VIEW_REPORTS))  # NEW: Permission check
):
    """
    Get financial report for current tenant (RBAC filtering).
    - Owner: Can view tenant-wide or filter by specific branch
    - Branch Admin: Can only view their branch data
    - Staff: No access (permission denied)
    """
    # TIMEZONE AWARE: Use tenant's timezone for date range
    start_date_utc, end_date_utc = get_tenant_date_range(days, current_tenant.timezone)

    # Determine filtering scope
    if role_type == "staff":
        # Staff can only see their own data (though they shouldn't reach here due to permission check)
        filter_user_id = current_user.id
    elif staff_id:
        # Owner/admin filtering by specific staff member
        filter_user_id = staff_id
    else:
        # Owner/admin viewing overall data
        filter_user_id = None

    # Determine which tenant IDs to include (main + branches for aggregated view)
    tenant_ids = [current_tenant.id]

    # Branch filtering logic
    filter_branch_id = None
    if branch_scope:
        # Branch admin: forced to their branch
        filter_branch_id = branch_scope
    elif role_type == "owner":
        if branch_id:
            # Owner filtering by specific branch
            filter_branch_id = branch_id
        else:
            # Owner viewing all branches
            branches_result = await db.execute(
                select(Tenant.id).where(Tenant.parent_tenant_id == current_tenant.id)
            )
            branch_ids = [row[0] for row in branches_result.all()]
            tenant_ids.extend(branch_ids)

    # Base WHERE conditions for all Sale queries - TIMEZONE AWARE
    base_conditions = [
        Sale.tenant_id.in_(tenant_ids),  # Include main + all branches
        Sale.status == OrderStatus.COMPLETED,
        Sale.created_at >= start_date_utc,
        Sale.created_at <= end_date_utc
    ]
    if filter_user_id:
        base_conditions.append(Sale.user_id == filter_user_id)
    if filter_branch_id:
        # FIXED: Handle main location (branch_id is None) vs actual branches
        if filter_branch_id == current_tenant.id:
            # Filtering by main location: include sales where branch_id is None OR equals main tenant
            base_conditions.append(or_(Sale.branch_id == None, Sale.branch_id == current_tenant.id))
        else:
            # Filtering by actual branch: exact match
            base_conditions.append(Sale.branch_id == filter_branch_id)

    # Revenue by date
    result = await db.execute(
        select(
            func.date(Sale.created_at).label("date"),
            func.sum(Sale.total).label("revenue"),
            func.count(Sale.id).label("orders")
        )
        .where(*base_conditions)
        .group_by(func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at))
    )
    revenue_by_date = [
        {"date": str(row.date), "revenue": float(row.revenue), "orders": int(row.orders)}
        for row in result.all()
    ]

    # Total Profit
    result = await db.execute(
        select(
            func.sum((SaleItem.price - Product.base_cost) * SaleItem.quantity)
        )
        .join(Product, Product.id == SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*base_conditions)
    )
    total_profit = float(result.scalar() or 0)

    # Quantity Sold by Date
    result = await db.execute(
        select(
            func.date(Sale.created_at).label("date"),
            func.sum(SaleItem.quantity).label("quantity")
        )
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*base_conditions)
        .group_by(func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at))
    )
    quantity_by_date = [
        {"date": str(row.date), "quantity": int(row.quantity or 0)}
        for row in result.all()
    ]

    # Profit by Date
    result = await db.execute(
        select(
            func.date(Sale.created_at).label("date"),
            func.sum((SaleItem.price - Product.base_cost) * SaleItem.quantity).label("profit")
        )
        .select_from(SaleItem)
        .join(Product, Product.id == SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*base_conditions)
        .group_by(func.date(Sale.created_at))
        .order_by(func.date(Sale.created_at))
    )
    profit_by_date = [
        {"date": str(row.date), "profit": float(row.profit or 0)}
        for row in result.all()
    ]

    # Top Selling Products (with profit)
    result = await db.execute(
        select(
            Product.name,
            func.sum(SaleItem.quantity).label("quantity"),
            func.sum(SaleItem.subtotal).label("revenue"),
            func.sum((SaleItem.price - Product.base_cost) * SaleItem.quantity).label("profit")
        )
        .join(Product, Product.id == SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*base_conditions)
        .group_by(Product.name)
        .order_by(desc(func.sum(SaleItem.quantity)))
        .limit(10)
    )
    top_selling_products = [
        {"name": row.name, "quantity": int(row.quantity), "revenue": float(row.revenue), "profit": float(row.profit)}
        for row in result.all()
    ]
    
    # CHANGED: Low Stock Products (physical products only)
    result = await db.execute(
        select(Product)
        .where(
            Product.tenant_id == current_tenant.id,
            Product.is_service == False,
            Product.quantity <= Product.reorder_level
        )
        .options(selectinload(Product.category_rel))
        .limit(10)
    )
    low_stock_products = result.scalars().all()

    # ========== NON-MOVING PRODUCTS QUERY ==========

    # Step 1: Subquery - Get product IDs that HAVE been sold in the time period
    sold_product_subquery_conditions = [
        Sale.tenant_id == current_tenant.id,
        Sale.status == OrderStatus.COMPLETED,
        Sale.created_at >= start_date_utc,
        Sale.created_at <= end_date_utc
    ]
    if filter_user_id:
        sold_product_subquery_conditions.append(Sale.user_id == filter_user_id)

    sold_product_ids_subquery = (
        select(SaleItem.product_id)
        .distinct()
        .join(Sale)
        .where(*sold_product_subquery_conditions)
    )

    # Step 2: Get products NOT in that list (physical, active, unsold)
    result = await db.execute(
        select(Product)
        .where(
            Product.tenant_id == current_tenant.id,
            Product.is_service == False,  # Physical products only
            Product.is_available == True,  # Active products only
            ~Product.id.in_(sold_product_ids_subquery)  # NOT sold in period
        )
        .options(selectinload(Product.category_rel))  # Eager load category
        .order_by(Product.quantity.desc())  # Show highest inventory first
        .limit(50)  # Limit for UI display
    )
    non_moving_products = result.scalars().all()

    # Step 3: Get total count (before limit)
    result = await db.execute(
        select(func.count(Product.id))
        .where(
            Product.tenant_id == current_tenant.id,
            Product.is_service == False,
            Product.is_available == True,
            ~Product.id.in_(sold_product_ids_subquery)
        )
    )
    non_moving_products_count = result.scalar() or 0

    # Step 4: Calculate days_without_sales for each product
    non_moving_products_list = []
    for product in non_moving_products:
        # Find last sale date for this product (any time, not just in period)
        last_sale_result = await db.execute(
            select(func.max(Sale.created_at))
            .join(SaleItem)
            .where(
                SaleItem.product_id == product.id,
                Sale.tenant_id == current_tenant.id,
                Sale.status == OrderStatus.COMPLETED
            )
        )
        last_sale_date = last_sale_result.scalar()

        if last_sale_date:
            # Product was sold before, calculate days since last sale
            days_without_sales = (date.today() - last_sale_date.date()).days
        else:
            # Product never sold, calculate days since creation
            days_without_sales = (date.today() - product.created_at.date()).days

        non_moving_products_list.append({
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "category_name": product.category_rel.name if product.category_rel else None,
            "base_cost": product.base_cost if product.base_cost is not None else 0.0,
            "selling_price": product.selling_price if product.selling_price is not None else 0.0,
            "quantity": product.quantity,
            "days_without_sales": days_without_sales
        })

    # Total Revenue
    result = await db.execute(
        select(func.sum(Sale.total))
        .where(*base_conditions)
    )
    total_revenue = float(result.scalar() or 0)

    # Total Expenses - Now supports branch filtering
    expense_conditions = [
        Expense.tenant_id == current_tenant.id,
        Expense.expense_date >= start_date_utc.date(),
        Expense.expense_date <= end_date_utc.date()
    ]
    # Apply branch filtering to expenses
    if filter_branch_id:
        if filter_branch_id == current_tenant.id:
            # Main location: branch_id is None OR equals main tenant
            expense_conditions.append(or_(Expense.branch_id == None, Expense.branch_id == current_tenant.id))
        else:
            # Specific branch
            expense_conditions.append(Expense.branch_id == filter_branch_id)
    result = await db.execute(
        select(func.sum(Expense.amount))
        .where(*expense_conditions)
    )
    total_expenses = float(result.scalar() or 0)

    return {
        "total_revenue": total_revenue,
        "total_profit": total_profit,
        "total_expenses": total_expenses,
        "revenue_by_date": revenue_by_date,
        "quantity_by_date": quantity_by_date,
        "profit_by_date": profit_by_date,
        "top_selling_products": top_selling_products,
        "low_stock_products": low_stock_products,
        "non_moving_products_count": non_moving_products_count,
        "non_moving_products": non_moving_products_list
    }


@app.get("/staff/list", response_model=List[StaffMember])
async def get_staff_list(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: str = Depends(require_admin_role),  # Admin only endpoint
    db: AsyncSession = Depends(get_db)
):
    """Get list of all staff members in current tenant (admin only)"""

    result = await db.execute(
        select(
            User.id,
            User.full_name,
            User.username,
            tenant_users.c.role
        )
        .join(tenant_users, User.id == tenant_users.c.user_id)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.is_active == True
        )
        .order_by(User.full_name)
    )

    staff_members = []
    for row in result:
        staff_members.append(StaffMember(
            id=row.id,
            full_name=row.full_name,
            username=row.username,
            role=row.role
        ))

    return staff_members


@app.get("/dashboard/branch-performance")
async def get_branch_performance(
    days: int = 30,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: str = Depends(require_admin_role),
    db: AsyncSession = Depends(get_db)
):
    """Get performance metrics (revenue, sales, profit) by branch"""
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Get all branches for this tenant
    result = await db.execute(
        select(Tenant).where(
            Tenant.parent_tenant_id == current_tenant.id
        ).order_by(Tenant.name)
    )
    branches = result.scalars().all()

    if not branches or len(branches) == 0:
        return []

    branch_metrics = []

    # Add main location metrics (sales without branch_id or branch_id == main tenant)
    main_sales_result = await db.execute(
        select(
            func.count(Sale.id).label('total_sales'),
            func.coalesce(func.sum(Sale.total), 0).label('total_revenue'),
            func.coalesce(func.sum(Sale.subtotal - func.coalesce(
                select(func.sum(SaleItem.quantity * Product.base_cost))
                .where(SaleItem.sale_id == Sale.id)
                .join(Product, Product.id == SaleItem.product_id)
                .correlate(Sale)
                .scalar_subquery()
            , 0)), 0).label('total_profit')
        )
        .where(
            Sale.tenant_id == current_tenant.id,
            Sale.status == OrderStatus.COMPLETED,
            Sale.created_at >= start_date,
            Sale.created_at <= end_date,
            or_(Sale.branch_id == None, Sale.branch_id == current_tenant.id)
        )
    )
    main_stats = main_sales_result.first()

    branch_metrics.append({
        "branch_id": current_tenant.id,
        "branch_name": current_tenant.name + " (Main)",
        "total_sales": int(main_stats.total_sales or 0),
        "total_revenue": float(main_stats.total_revenue or 0),
        "total_profit": float(main_stats.total_profit or 0)
    })

    # Calculate metrics for each branch
    for branch in branches:
        # Get sales for this branch (using branch_id field)
        sales_result = await db.execute(
            select(
                func.count(Sale.id).label('total_sales'),
                func.coalesce(func.sum(Sale.total), 0).label('total_revenue'),
                func.coalesce(func.sum(Sale.subtotal - func.coalesce(
                    select(func.sum(SaleItem.quantity * Product.base_cost))
                    .where(SaleItem.sale_id == Sale.id)
                    .join(Product, Product.id == SaleItem.product_id)
                    .correlate(Sale)
                    .scalar_subquery()
                , 0)), 0).label('total_profit')
            )
            .where(
                Sale.branch_id == branch.id,
                Sale.status == OrderStatus.COMPLETED,
                Sale.created_at >= start_date,
                Sale.created_at <= end_date
            )
        )
        stats = sales_result.first()

        branch_metrics.append({
            "branch_id": branch.id,
            "branch_name": branch.name,
            "total_sales": int(stats.total_sales or 0),
            "total_revenue": float(stats.total_revenue or 0),
            "total_profit": float(stats.total_profit or 0)
        })

    return branch_metrics


@app.get("/reports/staff-performance", response_model=StaffPerformanceReport)
async def get_staff_performance_report(
    days: int = 30,  # Default to last 30 days
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    _: str = Depends(require_admin_role),  # Admin only
    db: AsyncSession = Depends(get_db)
):
    """
    Get comparative performance metrics for all staff members.
    Admin-only endpoint for staff performance reports.
    """
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Get all active staff members in tenant
    staff_result = await db.execute(
        select(
            User.id,
            User.full_name,
            User.username,
            tenant_users.c.role
        )
        .join(tenant_users, User.id == tenant_users.c.user_id)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.is_active == True,
            User.is_active == True
        )
        .order_by(User.full_name)
    )
    staff_list = staff_result.all()

    staff_metrics = []

    for staff_row in staff_list:
        # Base conditions for this staff member
        base_conditions = [
            Sale.tenant_id == current_tenant.id,
            Sale.user_id == staff_row.id,
            Sale.created_at >= start_date
        ]

        # Total revenue
        revenue_result = await db.execute(
            select(func.coalesce(func.sum(Sale.total), 0))
            .where(*base_conditions)
        )
        total_revenue = float(revenue_result.scalar() or 0)

        # Total sales (transaction count)
        sales_result = await db.execute(
            select(func.count(Sale.id))
            .where(*base_conditions)
        )
        total_sales = sales_result.scalar() or 0

        # Total units sold
        units_result = await db.execute(
            select(func.coalesce(func.sum(SaleItem.quantity), 0))
            .select_from(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*base_conditions)
        )
        total_units_sold = int(units_result.scalar() or 0)

        # Total profit
        profit_result = await db.execute(
            select(
                func.coalesce(
                    func.sum((SaleItem.price - Product.base_cost) * SaleItem.quantity),
                    0
                )
            )
            .select_from(SaleItem)
            .join(Product, Product.id == SaleItem.product_id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*base_conditions)
        )
        total_profit = float(profit_result.scalar() or 0)

        # Average sale value
        avg_sale_value = total_revenue / total_sales if total_sales > 0 else 0.0

        # Revenue trend (by date)
        trend_result = await db.execute(
            select(
                func.date(Sale.created_at).label("date"),
                func.coalesce(func.sum(Sale.total), 0).label("revenue"),
                func.count(Sale.id).label("orders")
            )
            .where(*base_conditions)
            .group_by(func.date(Sale.created_at))
            .order_by(func.date(Sale.created_at))
        )
        revenue_trend = [
            {"date": str(row.date), "revenue": float(row.revenue), "orders": row.orders}
            for row in trend_result.all()
        ]

        staff_metrics.append({
            "staff_id": staff_row.id,
            "full_name": staff_row.full_name,
            "username": staff_row.username,
            "role": staff_row.role,
            "total_revenue": total_revenue,
            "total_sales": total_sales,
            "total_units_sold": total_units_sold,
            "total_profit": total_profit,
            "avg_sale_value": avg_sale_value,
            "revenue_trend": revenue_trend
        })

    return {
        "staff_metrics": staff_metrics,
        "date_range_days": days,
        "generated_at": datetime.utcnow().isoformat()
    }


@app.get("/reports/price-variance", response_model=PriceVarianceReport)
async def get_price_variance_report(
    days: int = 30,
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate price variance report showing standard vs actual sale prices.

    Analyzes sales where SaleItem.price differs from Product.selling_price
    (or BranchStock.override_selling_price for branch sales).

    Breaks down variance by:
    - Product (which products have most overrides)
    - Staff member (who gives most discounts)
    - Branch (if applicable)
    """
    start_date = datetime.utcnow() - timedelta(days=days)

    # Query: All completed sales in date range
    sales_query = (
        select(Sale)
        .where(Sale.tenant_id == current_tenant.id)
        .where(Sale.status == OrderStatus.COMPLETED)
        .where(func.date(Sale.created_at) >= start_date.date())
        .options(
            selectinload(Sale.sale_items).selectinload(SaleItem.product).selectinload(Product.category_rel),
            selectinload(Sale.user),
            selectinload(Sale.branch)
        )
    )
    result = await db.execute(sales_query)
    sales = result.scalars().all()

    # Calculate variance metrics - FIXED: Count SALES not ITEMS
    total_sales = len(sales)
    overridden_sales = 0
    total_variance = 0.0

    product_stats = {}  # product_id -> stats dict
    staff_stats = {}    # user_id -> stats dict
    branch_stats = {}   # branch_id -> stats dict
    
    # Track sales per product/staff/branch to avoid double-counting
    product_sale_ids = {}  # product_id -> set of sale_ids
    staff_sale_ids = {}    # user_id -> set of sale_ids
    branch_sale_ids = {}   # branch_id -> set of sale_ids

    for sale in sales:
        sale_has_override = False
        sale_variance = 0.0
        
        # Track products in this sale
        sale_products = set()

        for item in sale.sale_items:
            sale_products.add(item.product_id)
            
            # Determine standard price for this item
            standard_price = item.product.selling_price
            if sale.branch_id:
                # Check for branch override
                branch_stock_query = (
                    select(BranchStock.override_selling_price)
                    .where(BranchStock.tenant_id == sale.branch_id)
                    .where(BranchStock.product_id == item.product_id)
                )
                branch_override_result = await db.execute(branch_stock_query)
                branch_override = branch_override_result.scalar_one_or_none()
                if branch_override:
                    standard_price = branch_override

            # Calculate variance
            actual_price = item.price
            variance = (standard_price - actual_price) * item.quantity

            # Track if price was overridden (allow small float precision difference)
            is_override = abs(actual_price - standard_price) > 0.01

            if is_override:
                sale_has_override = True
                sale_variance += variance
                
                # Initialize product tracking
                if item.product_id not in product_sale_ids:
                    product_sale_ids[item.product_id] = set()
                product_sale_ids[item.product_id].add(sale.id)

                # Aggregate by product
                if item.product_id not in product_stats:
                    product_stats[item.product_id] = {
                        'product': item.product,
                        'variance': 0.0,
                        'override_prices': []
                    }
                product_stats[item.product_id]['variance'] += variance
                product_stats[item.product_id]['override_prices'].append(actual_price)
            else:
                # Count non-override sales for product
                if item.product_id not in product_sale_ids:
                    product_sale_ids[item.product_id] = set()
                product_sale_ids[item.product_id].add(sale.id)
                
                if item.product_id not in product_stats:
                    product_stats[item.product_id] = {
                        'product': item.product,
                        'variance': 0.0,
                        'override_prices': []
                    }

        # Count this sale for staff (once per sale, not per item)
        if sale.user_id not in staff_sale_ids:
            staff_sale_ids[sale.user_id] = set()
        staff_sale_ids[sale.user_id].add(sale.id)
        
        if sale.user_id not in staff_stats:
            staff_stats[sale.user_id] = {
                'user': sale.user,
                'overridden_sales': 0,
                'variance': 0.0
            }

        if sale_has_override:
            overridden_sales += 1
            total_variance += sale_variance
            staff_stats[sale.user_id]['overridden_sales'] += 1
            staff_stats[sale.user_id]['variance'] += sale_variance

        # Count this sale for branch (once per sale)
        if sale.branch_id:
            if sale.branch_id not in branch_sale_ids:
                branch_sale_ids[sale.branch_id] = set()
            branch_sale_ids[sale.branch_id].add(sale.id)
            
            if sale.branch_id not in branch_stats:
                branch_stats[sale.branch_id] = {
                    'branch': sale.branch,
                    'overridden_sales': 0,
                    'variance': 0.0
                }
            
            if sale_has_override:
                branch_stats[sale.branch_id]['overridden_sales'] += 1
                branch_stats[sale.branch_id]['variance'] += sale_variance

    # Build response objects using SALE counts not ITEM counts
    product_variances = []
    for pid, stats in product_stats.items():
        # Count unique sales for this product
        total_sales_count = len(product_sale_ids.get(pid, set()))
        overridden_sales_count = len(stats['override_prices'])  # One price per overridden sale
        
        if overridden_sales_count > 0:  # Only include products with overrides
            avg_override_price = sum(stats['override_prices']) / len(stats['override_prices'])
            potential_revenue = stats['product'].selling_price * total_sales_count
            variance_pct = (stats['variance'] / potential_revenue * 100) if potential_revenue > 0 else 0.0

            product_variances.append({
                "product_id": pid,
                "product_name": stats['product'].name,
                "sku": stats['product'].sku,
                "category_name": stats['product'].category_rel.name if stats['product'].category_rel else None,
                "standard_price": stats['product'].selling_price,
                "total_sales_count": total_sales_count,
                "overridden_sales_count": overridden_sales_count,
                "total_variance_amount": stats['variance'],
                "avg_override_price": avg_override_price,
                "variance_percentage": variance_pct
            })

    staff_variances = []
    for uid, stats in staff_stats.items():
        total_staff_sales = len(staff_sale_ids.get(uid, set()))
        override_pct = (stats['overridden_sales'] / total_staff_sales * 100) if total_staff_sales > 0 else 0.0
        avg_discount = (stats['variance'] / total_staff_sales) if total_staff_sales > 0 else 0.0

        staff_variances.append({
            "staff_id": uid,
            "full_name": stats['user'].full_name,
            "username": stats['user'].username,
            "total_sales": total_staff_sales,
            "overridden_sales": stats['overridden_sales'],
            "override_percentage": override_pct,
            "total_variance_amount": stats['variance'],
            "avg_discount_percentage": avg_discount
        })

    branch_variances = []
    for bid, stats in branch_stats.items():
        total_branch_sales = len(branch_sale_ids.get(bid, set()))
        override_pct = (stats['overridden_sales'] / total_branch_sales * 100) if total_branch_sales > 0 else 0.0

        branch_variances.append({
            "branch_id": bid,
            "branch_name": stats['branch'].name,
            "total_sales": total_branch_sales,
            "overridden_sales": stats['overridden_sales'],
            "override_percentage": override_pct,
            "total_variance_amount": stats['variance']
        })

    return {
        "total_sales": total_sales,
        "overridden_sales": overridden_sales,
        "override_rate": (overridden_sales / total_sales * 100) if total_sales > 0 else 0.0,
        "total_variance_amount": total_variance,
        "avg_variance_per_override": total_variance / overridden_sales if overridden_sales > 0 else 0.0,
        "product_variances": sorted(product_variances, key=lambda x: abs(x["total_variance_amount"]), reverse=True),
        "staff_variances": sorted(staff_variances, key=lambda x: abs(x["total_variance_amount"]), reverse=True),
        "branch_variances": sorted(branch_variances, key=lambda x: abs(x["total_variance_amount"]), reverse=True),
        "date_range_days": days,
        "generated_at": datetime.utcnow().isoformat()
    }


# ==================== EXPENSE ROUTES ====================

async def _build_expense_response(expense: Expense, db: AsyncSession) -> dict:
    """Helper to build expense response with branch_name resolved"""
    branch_name = None
    if expense.branch_id:
        branch_result = await db.execute(
            select(Tenant.name).where(Tenant.id == expense.branch_id)
        )
        branch_name = branch_result.scalar_one_or_none()

    return {
        "id": expense.id,
        "tenant_id": expense.tenant_id,
        "branch_id": expense.branch_id,
        "branch_name": branch_name,
        "type": expense.type,
        "amount": expense.amount,
        "description": expense.description,
        "expense_date": expense.expense_date,
        "created_at": expense.created_at,
        "updated_at": expense.updated_at
    }


@app.post("/expenses", response_model=ExpenseResponse)
async def create_expense(
    expense_data: ExpenseCreate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    role_type: str = Depends(get_user_role_type),
    branch_scope: Optional[int] = Depends(get_branch_scope)
):
    """Create a new expense (admin/branch_admin only)"""
    if role_type not in ('owner', 'branch_admin'):
        raise HTTPException(status_code=403, detail="Only admins can manage expenses")

    # Determine branch_id
    if expense_data.branch_id is not None:
        # Validate branch_id if provided
        if expense_data.branch_id != current_tenant.id:
            # Check if it's a valid branch under this tenant
            branch_result = await db.execute(
                select(Tenant).where(
                    Tenant.id == expense_data.branch_id,
                    Tenant.parent_tenant_id == current_tenant.id
                )
            )
            if not branch_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Invalid branch_id")
        branch_id = expense_data.branch_id
    elif branch_scope:
        # Branch admin: auto-assign their branch
        branch_id = branch_scope
    else:
        # Owner with no branch specified: assign to main location (None)
        branch_id = None

    expense = Expense(
        tenant_id=current_tenant.id,
        branch_id=branch_id,
        type=expense_data.type,
        amount=expense_data.amount,
        description=expense_data.description,
        expense_date=expense_data.expense_date
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    # Build response with branch_name
    return await _build_expense_response(expense, db)


@app.get("/expenses", response_model=List[ExpenseResponse])
async def get_expenses(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    role_type: str = Depends(get_user_role_type),
    branch_scope: Optional[int] = Depends(get_branch_scope),
    days: int = Query(default=30, ge=1, le=3650),
    branch_id: Optional[int] = Query(default=None, description="Filter by branch (owners only)")
):
    """Get expenses for the current tenant (admin/branch_admin only)"""
    if role_type not in ('owner', 'branch_admin'):
        raise HTTPException(status_code=403, detail="Only admins can view expenses")

    cutoff_date = (datetime.utcnow() - timedelta(days=days)).date()

    # Build conditions
    conditions = [
        Expense.tenant_id == current_tenant.id,
        Expense.expense_date >= cutoff_date
    ]

    # Apply branch filtering
    if branch_scope:
        # Branch admin: can only see their branch + main location expenses
        conditions.append(or_(Expense.branch_id == None, Expense.branch_id == branch_scope))
    elif branch_id is not None:
        # Owner filtering by specific branch
        if branch_id == current_tenant.id:
            # Main location: branch_id is None OR equals main tenant
            conditions.append(or_(Expense.branch_id == None, Expense.branch_id == current_tenant.id))
        else:
            # Specific branch
            conditions.append(Expense.branch_id == branch_id)
    # If no branch filter and owner: show all expenses (no additional condition)

    result = await db.execute(
        select(Expense)
        .where(*conditions)
        .order_by(desc(Expense.expense_date))
    )
    expenses = result.scalars().all()

    # Build responses with branch_name
    return [await _build_expense_response(exp, db) for exp in expenses]


@app.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: int,
    expense_data: ExpenseUpdate,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    role_type: str = Depends(get_user_role_type),
    branch_scope: Optional[int] = Depends(get_branch_scope)
):
    """Update an expense (admin/branch_admin only)"""
    if role_type not in ('owner', 'branch_admin'):
        raise HTTPException(status_code=403, detail="Only admins can manage expenses")

    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tenant_id == current_tenant.id
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Branch admin can only update expenses in their branch or main location
    if branch_scope and expense.branch_id and expense.branch_id != branch_scope:
        raise HTTPException(status_code=403, detail="Cannot update expenses from other branches")

    update_data = expense_data.model_dump(exclude_unset=True)

    # Validate branch_id if being updated
    if 'branch_id' in update_data and update_data['branch_id'] is not None:
        new_branch_id = update_data['branch_id']
        if new_branch_id != current_tenant.id:
            branch_result = await db.execute(
                select(Tenant).where(
                    Tenant.id == new_branch_id,
                    Tenant.parent_tenant_id == current_tenant.id
                )
            )
            if not branch_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Invalid branch_id")

    for key, value in update_data.items():
        setattr(expense, key, value)

    await db.commit()
    await db.refresh(expense)
    return await _build_expense_response(expense, db)


@app.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: int,
    current_tenant: Tenant = Depends(check_branch_subscription_active),  # Enforces paid subscription
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    role_type: str = Depends(get_user_role_type)
):
    """Delete an expense (admin/branch_admin only)"""
    if role_type not in ('owner', 'branch_admin'):
        raise HTTPException(status_code=403, detail="Only admins can manage expenses")

    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tenant_id == current_tenant.id
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    await db.delete(expense)
    await db.commit()


@app.get("/expenses/types")
async def get_expense_types(
    current_tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    role_type: str = Depends(get_user_role_type),
    prefix: Optional[str] = Query(default=None, min_length=1)
):
    """Get distinct expense types sorted by frequency (admin/branch_admin only)"""
    if role_type not in ('owner', 'branch_admin'):
        raise HTTPException(status_code=403, detail="Only admins can view expense types")

    query = (
        select(Expense.type, func.count(Expense.type).label('cnt'))
        .where(Expense.tenant_id == current_tenant.id)
    )
    if prefix:
        query = query.where(Expense.type.ilike(f"{prefix}%"))

    query = query.group_by(Expense.type).order_by(desc('cnt')).limit(20)
    result = await db.execute(query)
    rows = result.all()
    return [{"type": row.type} for row in rows]


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    """Health check endpoint for Render/Cloud platforms"""
    return {"status": "healthy", "service": "api"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
