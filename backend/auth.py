from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Tenant, Organization, tenant_users, organization_users, Permission

# Security configuration
SECRET_KEY = "your-secret-key-here-change-in-production-09876543210"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, tenant_id: int, branch_id: Optional[int] = None, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token with tenant and branch context"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)

    to_encode.update({
        "exp": expire,
        "tenant_id": tenant_id,  # Include tenant_id in token
        "branch_id": branch_id  # NEW: Include branch_id in token (None for main tenant admins)
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_tenant_from_subdomain(subdomain: str, db: AsyncSession) -> Optional[Tenant]:
    """Resolve tenant from subdomain"""
    result = await db.execute(
        select(Tenant).where(Tenant.subdomain == subdomain)
    )
    tenant = result.scalar_one_or_none()
    return tenant


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get the current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(
        select(User)
        .options(selectinload(User.tenants))
        .where(User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get the current active user"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_current_tenant_from_token(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Tenant:
    """Extract tenant from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        tenant_id: int = payload.get("tenant_id")
        if tenant_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = result.scalar_one_or_none()
    
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if not tenant.is_active:
        raise HTTPException(status_code=403, detail="Tenant is inactive")

    return tenant


async def get_current_branch_id(token: str = Depends(oauth2_scheme)) -> Optional[int]:
    """
    Extract branch_id from JWT token.
    Returns None for main tenant admins, or the assigned branch_id for branch staff.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        branch_id: Optional[int] = payload.get("branch_id")
        return branch_id
    except JWTError:
        # If token is invalid, return None (will be caught by other auth checks)
        return None


async def get_current_tenant(
    current_user: User = Depends(get_current_active_user),
    current_tenant_from_token: Tenant = Depends(get_current_tenant_from_token),
    db: AsyncSession = Depends(get_db)
) -> Tenant:
    """
    Get current tenant and verify user has access to it.
    This is the main dependency to use in all tenant-scoped endpoints.
    Handles both direct memberships and branch assignments.
    """
    # Check for direct membership in this tenant
    result = await db.execute(
        select(tenant_users).where(
            tenant_users.c.tenant_id == current_tenant_from_token.id,
            tenant_users.c.user_id == current_user.id,
            tenant_users.c.is_active == True
        )
    )
    membership = result.first()

    # If no direct membership and this is a branch, check parent membership
    if not membership and current_tenant_from_token.parent_tenant_id:
        # This is a branch - check if user has parent membership
        # Admins in parent get access to all branches
        # Staff only get access to their specifically assigned branch
        result = await db.execute(
            select(tenant_users).where(
                tenant_users.c.tenant_id == current_tenant_from_token.parent_tenant_id,
                tenant_users.c.user_id == current_user.id,
                tenant_users.c.is_active == True
            )
        )
        parent_membership = result.first()

        if parent_membership:
            # If admin in parent, grant access to any branch
            if parent_membership.role == "admin":
                membership = parent_membership
            # If staff, only allow if assigned to this specific branch
            elif parent_membership.branch_id == current_tenant_from_token.id:
                membership = parent_membership

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to this tenant"
        )

    return current_tenant_from_token


async def get_current_user_role_in_tenant(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
) -> str:
    """Get user's role within the current tenant (handles branch assignments)"""
    # Try direct membership first
    result = await db.execute(
        select(tenant_users.c.role).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id
        )
    )
    role = result.scalar_one_or_none()

    # If no direct role and this is a branch, check parent membership
    if not role and current_tenant.parent_tenant_id:
        # Return parent role (admins access all branches without branch_id filter)
        result = await db.execute(
            select(tenant_users.c.role).where(
                tenant_users.c.tenant_id == current_tenant.parent_tenant_id,
                tenant_users.c.user_id == current_user.id
            )
        )
        role = result.scalar_one_or_none()

    return role


async def require_admin_role(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """Dependency to require ADMIN role within tenant (handles branch assignments)"""
    # Try direct membership first
    result = await db.execute(
        select(tenant_users.c.role).where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id
        )
    )
    role = result.scalar_one_or_none()

    # If no direct role and this is a branch, check parent membership
    if not role and current_tenant.parent_tenant_id:
        # Parent admins have access to all branches (no branch_id filter)
        result = await db.execute(
            select(tenant_users.c.role).where(
                tenant_users.c.tenant_id == current_tenant.parent_tenant_id,
                tenant_users.c.user_id == current_user.id
            )
        )
        role = result.scalar_one_or_none()

    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return True


async def verify_resource_tenant(
    resource_tenant_id: int,
    current_tenant: Tenant = Depends(get_current_tenant)
):
    """
    Verify that a resource belongs to the current tenant.
    Use this when accessing resources by ID to prevent cross-tenant access.
    """
    if resource_tenant_id != current_tenant.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"  # Don't reveal it exists in another tenant
        )
    return True


# =============================================================================
# ROLE-BASED ACCESS CONTROL (RBAC) SYSTEM
# =============================================================================

# Role-Permission Mapping
ROLE_PERMISSIONS = {
    "owner": [
        Permission.VIEW_DASHBOARD, Permission.VIEW_REPORTS,
        Permission.MANAGE_POS, Permission.VIEW_SALES_HISTORY,
        Permission.MANAGE_INVENTORY, Permission.MANAGE_USERS,
        Permission.MANAGE_SETTINGS, Permission.MANAGE_BRANCHES,
    ],
    "branch_admin": [
        Permission.VIEW_DASHBOARD, Permission.VIEW_REPORTS,
        Permission.MANAGE_POS, Permission.VIEW_SALES_HISTORY,
        Permission.MANAGE_INVENTORY, Permission.MANAGE_USERS,
    ],
    "staff": [
        Permission.MANAGE_POS, Permission.VIEW_SALES_HISTORY,
        Permission.MANAGE_INVENTORY,
    ],
}


async def get_user_role_type(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
) -> str:
    """
    Returns: 'owner', 'branch_admin', or 'staff'

    This determines the user's effective role type based on:
    - admin role with is_owner=True OR no branch assignment (owner)
    - admin role with branch_id assigned (branch_admin)
    - staff role (staff)
    """
    result = await db.execute(
        select(tenant_users.c.role, tenant_users.c.branch_id, tenant_users.c.is_owner)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(403, "Not a member of this tenant")

    role, branch_id, is_owner = row

    # Owner: admin with is_owner=True OR admin without branch assignment
    if role == "admin" and (is_owner or not branch_id):
        return "owner"
    # Branch Admin: admin with branch_id assigned (but not marked as owner)
    elif role == "admin" and branch_id:
        return "branch_admin"
    # Staff: everyone else
    else:
        return "staff"


def require_permission(permission: Permission):
    """
    Dependency factory for permission checks.

    Usage:
        @app.get("/dashboard", dependencies=[Depends(require_permission(Permission.VIEW_DASHBOARD))])
        async def get_dashboard(...):
            ...
    """
    async def checker(
        current_user: User = Depends(get_current_active_user),
        current_tenant: Tenant = Depends(get_current_tenant),
        db: AsyncSession = Depends(get_db)
    ):
        role_type = await get_user_role_type(current_user, current_tenant, db)
        if permission not in ROLE_PERMISSIONS.get(role_type, []):
            raise HTTPException(403, f"Permission '{permission.value}' required")
        return True
    return checker


async def get_branch_scope(
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
) -> Optional[int]:
    """
    Returns None for owner (tenant-wide access), branch_id for branch admin/staff.

    This is used to automatically filter data by branch for non-owner users.
    """
    role_type = await get_user_role_type(current_user, current_tenant, db)
    if role_type == "owner":
        return None

    result = await db.execute(
        select(tenant_users.c.branch_id)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id
        )
    )
    return result.scalar_one_or_none()


def extract_subdomain_from_request(request: Request) -> Optional[str]:
    """
    Extract subdomain from request host.
    Examples:
      - acme.statbricks.com -> acme
      - demo.localhost:8000 -> demo
      - localhost:8000 -> None
    """
    host = request.headers.get("host", "")
    
    # Split by port first
    host_without_port = host.split(":")[0]
    
    # Split by dots
    parts = host_without_port.split(".")
    
    # If single part (e.g., "localhost"), no subdomain
    if len(parts) <= 1:
        return None
    
    # If two parts (e.g., "statbricks.com"), no subdomain
    if len(parts) == 2:
        return None
    
    # Return first part as subdomain
    return parts[0]


async def get_tenant_from_request(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Optional[Tenant]:
    """
    Get tenant from request subdomain.
    This is used for public endpoints like login and registration.
    """
    subdomain = extract_subdomain_from_request(request)

    if not subdomain:
        return None

    return await get_tenant_from_subdomain(subdomain, db)


# =============================================================================
# ORGANIZATION AUTH DEPENDENCIES
# =============================================================================

async def get_current_organization(
    current_tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
) -> Optional[Organization]:
    """
    Get organization if current tenant is a branch.
    Returns None if tenant is independent (not part of an organization).
    """
    if not current_tenant.organization_id:
        return None

    result = await db.execute(
        select(Organization).where(Organization.id == current_tenant.organization_id)
    )
    organization = result.scalar_one_or_none()

    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    if not organization.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is inactive"
        )

    return organization


async def get_current_user_role_in_organization(
    current_user: User = Depends(get_current_active_user),
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
) -> Optional[str]:
    """Get user's role within the organization"""
    if not current_org:
        return None

    result = await db.execute(
        select(organization_users.c.role).where(
            organization_users.c.organization_id == current_org.id,
            organization_users.c.user_id == current_user.id
        )
    )
    role = result.scalar_one_or_none()
    return role


async def require_org_admin_role(
    current_user: User = Depends(get_current_active_user),
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    """
    Dependency to require organization admin role.
    Use this for org-level operations like creating branches, managing org products.
    """
    if not current_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This tenant is not part of an organization"
        )

    result = await db.execute(
        select(organization_users.c.role).where(
            organization_users.c.organization_id == current_org.id,
            organization_users.c.user_id == current_user.id
        )
    )
    role = result.scalar_one_or_none()

    if role != "org_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin privileges required"
        )
    return True


async def can_view_org_analytics(
    current_user: User = Depends(get_current_active_user),
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    """
    Check if user can view organization-wide analytics.
    Allows both org_admin and org_viewer roles.
    """
    if not current_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This tenant is not part of an organization"
        )

    result = await db.execute(
        select(organization_users.c.role).where(
            organization_users.c.organization_id == current_org.id,
            organization_users.c.user_id == current_user.id
        )
    )
    role = result.scalar_one_or_none()

    if role not in ["org_admin", "org_viewer"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization access required. Must be org admin or viewer."
        )
    return True


# =============================================================================
# PLATFORM SUPER ADMIN AUTH DEPENDENCIES
# =============================================================================

def create_super_admin_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token for platform super admin (no tenant context)"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "is_super_admin": True  # Mark as super admin token
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_super_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get current user and verify they are a super admin.
    This dependency is used for all platform admin endpoints.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        is_super_admin: bool = payload.get("is_super_admin", False)
        
        if username is None or not is_super_admin:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Verify user is actually a super admin in database
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin privileges required"
        )
    
    return user


async def require_super_admin(
    current_user: User = Depends(get_current_super_admin)
):
    """
    Dependency to require super admin access.
    Use this for platform admin endpoints.
    """
    return True
