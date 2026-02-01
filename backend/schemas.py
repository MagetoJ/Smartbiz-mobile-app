from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum
from models import UserRole, OrgRole, OrderStatus, StockMovementType, SubscriptionPlan


# Receipt Delivery Method Enum
class ReceiptDeliveryMethod(str, Enum):
    PRINT = "print"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


# Price History Source Enum
class PriceHistorySource(str, Enum):
    RECEIPT = "receipt"
    ADJUSTMENT = "adjustment"
    MANUAL_UPDATE = "manual_update"
    MIGRATION = "migration"


# Tenant Schemas
class TenantBase(BaseModel):
    name: str
    subdomain: str
    slug: str
    owner_email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    business_type: Optional[str] = None


class TenantCreate(TenantBase):
    """Schema for creating a new tenant"""
    # Admin user details for the tenant
    admin_username: str
    admin_password: str
    admin_full_name: str


class TenantUpdate(BaseModel):
    """Schema for updating tenant details"""
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    business_type: Optional[str] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None
    timezone: Optional[str] = None
    owner_email: Optional[str] = None


class TenantResponse(BaseModel):
    """Schema for tenant response"""
    id: int
    name: str
    subdomain: str
    slug: str
    owner_email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    organization_id: Optional[int] = None  # NEW: Link to organization
    branch_type: str = "independent"  # NEW: 'independent' or 'branch'
    subscription_plan: SubscriptionPlan
    max_users: int
    max_products: int
    is_active: bool
    currency: str
    tax_rate: float
    business_type: Optional[str] = None
    timezone: str
    created_at: datetime

    class Config:
        from_attributes = True


class TenantSummary(BaseModel):
    """Lightweight tenant info for listings"""
    id: int
    name: str
    subdomain: str
    slug: str
    is_active: bool
    logo_url: Optional[str] = None

    class Config:
        from_attributes = True


# User-Tenant Association Schemas
class UserTenantInfo(BaseModel):
    """User's role within a specific tenant"""
    tenant_id: int
    tenant_name: str
    tenant_subdomain: str
    role: UserRole
    is_active: bool
    joined_at: datetime


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    password: str


class UserInvite(BaseModel):
    """Schema for inviting a user to a tenant"""
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.STAFF
    branch_id: Optional[int] = None  # Assign to specific branch (optional, defaults to main tenant)
    # If user exists, just add to tenant; if not, create new user


class UserAdd(BaseModel):
    """Schema for manually adding a user to a tenant (no email)"""
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.STAFF
    branch_id: Optional[int] = None


class UserTenantUpdate(BaseModel):
    """Schema for updating a user's status/role within a tenant"""
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    branch_id: Optional[int] = None  # Assign user to specific branch
    full_name: Optional[str] = None  # Update user's display name
    email: Optional[EmailStr] = None  # Update user's email (must be unique)


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserWithRoleResponse(UserResponse):
    """User response with role and tenant membership info"""
    role: UserRole
    role_type: str  # "parent_org_admin" | "branch_admin" | "staff"
    tenant_is_active: bool
    joined_at: datetime
    branch_id: Optional[int] = None  # Assigned branch for staff
    branch_name: Optional[str] = None  # Name of assigned branch


class StaffMember(BaseModel):
    """Staff member info for dashboard filtering (admin only)"""
    id: int
    full_name: str
    username: str
    role: str  # "admin" or "staff"


class StaffPerformanceMetrics(BaseModel):
    """Staff performance metrics for comparison reports (admin only)"""
    # Staff info
    staff_id: int
    full_name: str
    username: str
    role: str

    # Performance metrics
    total_revenue: float
    total_sales: int  # Number of transactions
    total_units_sold: int  # Sum of quantities across all items
    total_profit: float
    avg_sale_value: float

    # Trend data (simplified for initial version)
    revenue_trend: List['RevenueByDate']  # Forward reference


class StaffPerformanceReport(BaseModel):
    """Complete staff performance report"""
    staff_metrics: List[StaffPerformanceMetrics]
    date_range_days: int
    generated_at: str


# Price Variance Report Schemas
class ProductVariance(BaseModel):
    """Price variance metrics for a single product"""
    product_id: int
    product_name: str
    sku: str
    category_name: Optional[str]
    standard_price: float
    total_sales_count: int  # How many times sold
    overridden_sales_count: int  # How many times price was overridden
    total_variance_amount: float  # Sum of (standard_price - actual_price) * quantity
    avg_override_price: float  # Average custom price when overridden
    variance_percentage: float  # (total_variance / potential_revenue) * 100


class StaffVariance(BaseModel):
    """Price override metrics for a staff member"""
    staff_id: int
    full_name: str
    username: str
    total_sales: int
    overridden_sales: int
    override_percentage: float  # (overridden_sales / total_sales) * 100
    total_variance_amount: float
    avg_discount_percentage: float


class BranchVariance(BaseModel):
    """Price variance metrics for a branch"""
    branch_id: int
    branch_name: str
    total_sales: int
    overridden_sales: int
    override_percentage: float
    total_variance_amount: float


class PriceVarianceReport(BaseModel):
    """Complete price variance report"""
    # Summary metrics
    total_sales: int
    overridden_sales: int
    override_rate: float  # Percentage of sales with custom pricing
    total_variance_amount: float  # Total revenue lost/gained
    avg_variance_per_override: float

    # Detailed breakdowns
    product_variances: List[ProductVariance]
    staff_variances: List[StaffVariance]
    branch_variances: List[BranchVariance]

    # Metadata
    date_range_days: int
    generated_at: str


class UserWithTenantsResponse(UserResponse):
    """User response with their tenant memberships"""
    tenants: List[UserTenantInfo]


# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    tenant: TenantSummary  # Include current tenant info
    user: UserWithRoleResponse  # Include role and branch_id


class LoginRequest(BaseModel):
    username: str
    password: str
    subdomain: Optional[str] = None  # Optional - if not provided, returns user's tenants


class TenantSwitchRequest(BaseModel):
    """Request to switch to a different tenant"""
    tenant_id: int


class UserTenantMembership(BaseModel):
    """Tenant membership info for tenant selection"""
    tenant_id: int
    tenant_name: str
    tenant_subdomain: str
    tenant_logo_url: Optional[str] = None
    role: UserRole
    is_active: bool


class LoginWithTenantsResponse(BaseModel):
    """Response when user logs in without specifying tenant"""
    user: UserResponse
    tenants: List[UserTenantMembership]
    message: str = "Please select a business to continue"


# Password Reset Schemas
class ForgotPasswordRequest(BaseModel):
    """Request schema for forgot password"""
    email: EmailStr = Field(..., description="Email address of the account")


class ResetPasswordRequest(BaseModel):
    """Request schema for resetting password"""
    token: str = Field(..., min_length=1, description="Password reset token from email")
    new_password: str = Field(..., min_length=6, description="New password (minimum 6 characters)")
    confirm_password: str = Field(..., min_length=6, description="Confirm new password")

    def passwords_match(self) -> bool:
        """Validate that passwords match"""
        return self.new_password == self.confirm_password


class PasswordResetResponse(BaseModel):
    """Response schema for password reset operations"""
    message: str
    success: bool = True


# Category Schemas
class CategoryBase(BaseModel):
    name: str = Field(max_length=50)
    display_order: int = Field(default=0, ge=0)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_active: bool = True

    # Profit margin settings (NULL = use system defaults 25%/15%)
    target_margin: Optional[float] = Field(None, ge=0, le=100, description="Target profit margin % (NULL = use system default 25%)")
    minimum_margin: Optional[float] = Field(None, ge=0, le=100, description="Minimum profit margin % (NULL = use system default 15%)")


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    display_order: Optional[int] = Field(None, ge=0)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None

    # Profit margin settings (can set to NULL to reset to defaults)
    target_margin: Optional[float] = Field(None, ge=0, le=100)
    minimum_margin: Optional[float] = Field(None, ge=0, le=100)


class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime
    updated_at: datetime
    product_count: Optional[int] = 0  # Computed field

    # Computed fields: Effective margins (resolved with system defaults)
    effective_target_margin: float = 25.0
    effective_minimum_margin: float = 15.0

    class Config:
        from_attributes = True


# Unit Schemas
class UnitBase(BaseModel):
    name: str = Field(max_length=30)
    display_order: int = Field(default=0, ge=0)
    is_active: bool = True


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=30)
    display_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class UnitResponse(UnitBase):
    id: int
    created_at: datetime
    updated_at: datetime
    product_count: Optional[int] = 0  # Computed field

    class Config:
        from_attributes = True


# Product Schemas
class ProductBase(BaseModel):
    name: str
    sku: Optional[str] = None  # Will be autogenerated if not provided
    barcode: Optional[str] = Field(None, max_length=50, description="Manufacturer barcode (EAN-13, UPC-A, etc.)")
    description: Optional[str] = None
    base_cost: Optional[float] = Field(None, ge=0, description="Base cost for product or service (optional during creation)")
    selling_price: Optional[float] = Field(None, ge=0, description="Selling price (optional during creation)")
    category_id: Optional[int] = None  # Optional since products can have no category
    unit: str = "pcs"
    image_url: Optional[str] = None
    reorder_level: Optional[int] = None  # Auto-calculated, not set by user
    is_available: bool = True
    is_service: bool = False  # NEW: Distinguish services from physical products


class ProductCreate(ProductBase):
    # Initial quantity removed - use "Receive Stock" to add initial inventory
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    # SKU removed - immutable after creation
    barcode: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    base_cost: Optional[float] = Field(None, ge=0)
    selling_price: Optional[float] = Field(None, ge=0)
    category_id: Optional[int] = None  # Changed from category: Optional[str]
    unit: Optional[str] = None
    image_url: Optional[str] = None
    reorder_level: Optional[int] = Field(None, ge=0)
    is_available: Optional[bool] = None
    is_service: Optional[bool] = None  # NEW: Allow updating service flag (though UI prevents this)


class ProductResponse(ProductBase):
    id: int
    tenant_id: int
    barcode: Optional[str] = None
    quantity: int
    is_service: bool  # NEW: Explicitly include in response
    created_at: datetime
    updated_at: datetime
    category_rel: Optional['CategoryResponse'] = None  # Optional populated category
    
    # Context-aware fields
    read_only: bool = False
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None

    class Config:
        from_attributes = True


# Forward reference resolution for CategoryResponse
ProductResponse.model_rebuild()


# Stock Movement Schemas
class StockMovementCreate(BaseModel):
    product_id: int
    movement_type: StockMovementType
    quantity: int = Field(description="Positive for IN, can be negative for OUT/ADJUSTMENT")

    # Pricing fields (required for "IN" movements, optional for adjustments)
    base_cost: Optional[float] = Field(None, ge=0, description="Base cost per unit")
    selling_price: Optional[float] = Field(None, ge=0, description="Selling price per unit")

    # Target branch for stock movement
    target_branch_id: Optional[int] = Field(
        None,
        description="Target branch ID for stock movement. If None, uses user's assigned branch or main location."
    )

    # Additional tracking fields
    supplier: Optional[str] = Field(None, max_length=255, description="Supplier name (for receipts)")
    reference: Optional[str] = Field(None, max_length=255, description="Invoice/PO reference or adjustment reason")
    notes: Optional[str] = None


class StockMovementResponse(BaseModel):
    id: int
    product_id: int
    user_id: int
    movement_type: StockMovementType
    quantity: int
    previous_stock: int
    new_stock: int

    # Pricing tracking
    base_cost: Optional[float] = None
    selling_price: Optional[float] = None
    supplier: Optional[str] = None
    reference: Optional[str] = None

    notes: Optional[str] = None
    created_at: datetime
    product: ProductResponse
    user: UserResponse

    class Config:
        from_attributes = True


# Price History Schemas
class PriceHistoryCreate(BaseModel):
    """Schema for creating a price history entry"""
    product_id: int
    base_cost: float = Field(gt=0)
    selling_price: float = Field(gt=0)
    source: PriceHistorySource
    reference: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = None


class PriceHistoryResponse(BaseModel):
    """Schema for price history response"""
    id: int
    product_id: int
    user_id: Optional[int] = None
    base_cost: float
    selling_price: float
    source: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    # Computed fields
    margin_percentage: Optional[float] = None  # Calculated: (selling_price - base_cost) / selling_price * 100
    user_full_name: Optional[str] = None  # User who made the change

    class Config:
        from_attributes = True


# SaleItem Schemas
class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, description="Must be greater than 0")
    custom_price: Optional[float] = Field(None, ge=0, description="Optional price override (warning shown if below base_cost)")


class SaleItemResponse(BaseModel):
    id: int
    product_id: Optional[int] = None  # Nullable for organization products
    org_product_id: Optional[int] = None  # For branch sales using org products
    branch_stock_id: Optional[int] = None  # Branch stock reference
    quantity: int
    price: float
    subtotal: float
    product: Optional[ProductResponse] = None  # May be None if using org_product

    class Config:
        from_attributes = True


# Sale Schemas
class SaleCreate(BaseModel):
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    items: List[SaleItemCreate] = Field(min_length=1, description="At least one item required")
    customer_id: Optional[int] = None  # Required when payment_method is "Credit"
    due_date: Optional[date] = None  # Required when payment_method is "Credit"; defaults to +30 days


class SaleCustomerUpdate(BaseModel):
    """Schema for updating customer information on an existing sale"""
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None


class SaleUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None


class SaleResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int
    branch_id: Optional[int] = None  # NEW: Track which branch created the sale
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None  # Customer email for receipt delivery
    customer_phone: Optional[str] = None  # Customer phone for WhatsApp receipt
    whatsapp_sent: bool = False  # Track if WhatsApp receipt was sent
    email_sent: bool = False  # Track if Email receipt was sent
    status: OrderStatus
    subtotal: float
    tax: float
    total: float
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    sale_items: List[SaleItemResponse]
    user: UserResponse
    branch: Optional[TenantSummary] = None

    class Config:
        from_attributes = True


# Dashboard Schemas
class DashboardStats(BaseModel):
    total_revenue: float
    total_sales: int
    total_products: int
    low_stock_items: int
    total_stock_value: Optional[float] = None  # Optional - hidden from staff users
    today_revenue: float
    today_sales: int


class RevenueByDate(BaseModel):
    date: str
    revenue: float
    orders: int


class QuantityByDate(BaseModel):
    date: str
    quantity: int


class ProfitByDate(BaseModel):
    date: str
    profit: float


class TopSellingProduct(BaseModel):
    name: str
    quantity: int
    revenue: float
    profit: float


class NonMovingProduct(BaseModel):
    """Product with no sales in the time period"""
    id: int
    name: str
    sku: str
    category_name: Optional[str] = None
    base_cost: float
    selling_price: float
    quantity: int
    days_without_sales: int  # Days since last sale (or creation date if never sold)

    class Config:
        from_attributes = True


class FinancialReport(BaseModel):
    total_revenue: float
    total_profit: float
    total_expenses: float
    revenue_by_date: List[RevenueByDate]
    quantity_by_date: List[QuantityByDate]
    profit_by_date: List[ProfitByDate]
    top_selling_products: List[TopSellingProduct]
    low_stock_products: List[ProductResponse]
    non_moving_products_count: int  # Total count for KPI card
    non_moving_products: List[NonMovingProduct]  # Detailed list (limited to 50)


# Tenant Usage/Stats (for subscription management)
class TenantUsageStats(BaseModel):
    """Current usage statistics for a tenant"""
    current_users: int
    max_users: int
    current_products: int
    max_products: int
    total_sales_this_month: int
    total_revenue_this_month: float
    subscription_plan: SubscriptionPlan
    subscription_expires_at: Optional[datetime] = None


# AI Classification Schemas
class AIClassifyRequest(BaseModel):
    """Request schema for AI product classification"""
    name: str = Field(min_length=3, max_length=100, description="Product name to classify")


class AIClassifyResponse(BaseModel):
    """Response schema with AI-suggested product attributes"""
    category_id: int
    category_name: str
    unit: str
    is_service: bool
    description: str
    ai_confidence: str  # "high" | "medium" | "low"


# =============================================================================
# ORGANIZATION SCHEMAS (Multi-Branch/Organization Management)
# =============================================================================

# Organization Schemas
class OrganizationBase(BaseModel):
    name: str = Field(max_length=100)
    owner_email: EmailStr


class OrganizationCreate(OrganizationBase):
    """Schema for creating a new organization"""
    # Admin user details
    admin_username: str
    admin_password: str
    admin_full_name: str
    # First branch details
    first_branch_name: str
    first_branch_subdomain: str


class OrganizationUpdate(BaseModel):
    """Schema for updating organization settings"""
    name: Optional[str] = None
    owner_email: Optional[EmailStr] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None
    timezone: Optional[str] = None


class OrganizationResponse(BaseModel):
    """Schema for organization response"""
    id: int
    name: str
    owner_email: str
    currency: str
    tax_rate: float
    timezone: str
    subscription_plan: SubscriptionPlan
    max_branches: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Organization Category Schemas
class OrganizationCategoryBase(BaseModel):
    name: str = Field(max_length=50)
    display_order: int = Field(default=0, ge=0)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_active: bool = True
    target_margin: Optional[float] = Field(None, ge=0, le=100)
    minimum_margin: Optional[float] = Field(None, ge=0, le=100)


class OrganizationCategoryCreate(OrganizationCategoryBase):
    pass


class OrganizationCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    display_order: Optional[int] = Field(None, ge=0)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None
    target_margin: Optional[float] = Field(None, ge=0, le=100)
    minimum_margin: Optional[float] = Field(None, ge=0, le=100)


class OrganizationCategoryResponse(OrganizationCategoryBase):
    id: int
    organization_id: int
    created_at: datetime
    updated_at: datetime
    product_count: Optional[int] = 0

    class Config:
        from_attributes = True


# Organization Product Schemas
class OrganizationProductBase(BaseModel):
    name: str = Field(max_length=100)
    sku: Optional[str] = None
    description: Optional[str] = None
    base_cost: float = Field(gt=0)
    selling_price: float = Field(gt=0)
    category_id: Optional[int] = None
    unit: str = "pcs"
    image_url: Optional[str] = None
    reorder_level: int = Field(default=10, ge=0)
    is_available: bool = True
    is_service: bool = False


class OrganizationProductCreate(OrganizationProductBase):
    pass


class OrganizationProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_cost: Optional[float] = Field(None, ge=0)
    selling_price: Optional[float] = Field(None, ge=0)
    category_id: Optional[int] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    reorder_level: Optional[int] = Field(None, ge=0)
    is_available: Optional[bool] = None
    is_service: Optional[bool] = None


class OrganizationProductResponse(OrganizationProductBase):
    id: int
    organization_id: int
    target_margin: float
    minimum_margin: float
    created_at: datetime
    updated_at: datetime
    category_rel: Optional[OrganizationCategoryResponse] = None
    total_stock_across_branches: Optional[int] = 0  # Computed field

    class Config:
        from_attributes = True


# Branch Stock Schemas
class BranchStockResponse(BaseModel):
    """Stock information for a specific branch"""
    id: int
    tenant_id: int
    org_product_id: int
    quantity: int
    override_selling_price: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BranchStockUpdate(BaseModel):
    """Update branch stock quantity"""
    quantity: int = Field(ge=0)
    override_selling_price: Optional[float] = Field(None, ge=0)


# Branch Schemas
class BranchCreate(BaseModel):
    """Schema for creating a new branch"""
    name: str = Field(max_length=100)
    subdomain: Optional[str] = Field(None, max_length=50)  # Auto-generated from name if not provided
    slug: Optional[str] = None  # Auto-generated from subdomain if not provided
    admin_user_id: Optional[int] = None  # Optional - defaults to current user


class BranchUpdate(BaseModel):
    """Schema for updating branch settings"""
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class BranchDeleteConfirm(BaseModel):
    """Schema for confirming branch deletion - user must type exact branch name"""
    confirm_name: str = Field(..., description="Type the exact branch name to confirm deletion")


class BranchResponse(BaseModel):
    """Schema for branch response (simplified tenant)"""
    id: int
    name: str
    subdomain: str
    slug: str
    parent_tenant_id: Optional[int] = None  # For simple branch hierarchy
    organization_id: Optional[int] = None  # DEPRECATED - kept for backward compat
    is_active: bool
    created_at: datetime
    logo_url: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

    class Config:
        from_attributes = True


# Organization User Schemas
class OrganizationUserInvite(BaseModel):
    """Schema for inviting a user to organization"""
    email: EmailStr
    full_name: str
    role: OrgRole = OrgRole.ORG_VIEWER


class OrganizationUserResponse(BaseModel):
    """Organization user with role"""
    id: int
    username: str
    email: str
    full_name: str
    role: OrgRole
    is_active: bool
    joined_at: datetime

    class Config:
        from_attributes = True


# Organization Product with Branch Stock (for branch view)
class OrganizationProductWithBranchStock(OrganizationProductResponse):
    """Org product with current branch's stock"""
    branch_stock_id: Optional[int] = None
    branch_quantity: int = 0
    branch_override_price: Optional[float] = None


# Organization Analytics Schemas
class BranchPerformanceMetrics(BaseModel):
    """Performance metrics for a single branch"""
    branch_id: int
    branch_name: str
    branch_subdomain: str
    total_revenue: float
    total_sales: int
    total_profit: float
    avg_sale_value: float
    stock_value: float


class OrganizationDashboardStats(BaseModel):
    """Aggregated stats across all branches"""
    total_revenue: float
    total_sales: int
    total_branches: int
    total_products: int
    total_stock_value: float
    active_branches: int


class OrganizationAnalyticsResponse(BaseModel):
    """Complete organization analytics"""
    dashboard_stats: OrganizationDashboardStats
    branch_metrics: List[BranchPerformanceMetrics]
    revenue_by_date: List[RevenueByDate]
    top_products_across_branches: List[TopSellingProduct]


# Tenant to Organization Conversion Schema
class ConvertToOrganizationRequest(BaseModel):
    """Schema for converting independent tenant to organization"""
    organization_name: str = Field(..., min_length=1, max_length=100)
    currency: Optional[str] = Field(default="KES", max_length=3)
    tax_rate: Optional[float] = Field(default=0.16, ge=0, le=1)
    timezone: Optional[str] = Field(default="Africa/Nairobi", max_length=50)


class ConvertToOrganizationResponse(BaseModel):
    """Response after conversion"""
    organization: OrganizationResponse
    branch: BranchResponse
    migrated_products: int
    migrated_categories: int
    message: str


# ============================================================================
# Subscription Schemas
# ============================================================================

class SubscriptionInitializeRequest(BaseModel):
    """Request schema for initializing subscription payment"""
    billing_cycle: str = Field(..., pattern="^(quarterly|semi_annual|annual)$")
    selected_branch_ids: List[int] = Field(..., min_items=1)  # Must include main location

class BranchPricingDetail(BaseModel):
    """Pricing detail for a single branch"""
    tenant_id: int
    name: str
    price_kes: float

class SubscriptionInitializeResponse(BaseModel):
    """Response schema for subscription initialization"""
    authorization_url: str
    reference: str
    pricing_breakdown: dict  # Contains main_location, branches, total_amount_kes

class SubscriptionVerifyResponse(BaseModel):
    """Response schema for subscription verification"""
    status: str
    message: str
    subscription_end_date: Optional[datetime] = None
    amount_paid: Optional[float] = None

class BranchSubscriptionStatus(BaseModel):
    """Subscription status for a single branch"""
    tenant_id: int
    name: str
    subdomain: str
    is_main: bool
    is_paid: bool
    subscription_end_date: Optional[datetime] = None
    is_cancelled: bool = False
    cancelled_at: Optional[datetime] = None

class SubscriptionStatusSummary(BaseModel):
    """Summary of subscription status"""
    total_branches: int
    paid_branches: int
    unpaid_branches: int

class SubscriptionStatusResponse(BaseModel):
    """Complete subscription status with per-branch details"""
    is_active: bool
    subscription_status: str
    subscription_end_date: Optional[datetime] = None
    billing_cycle: Optional[str] = None
    branch_subscriptions: List[BranchSubscriptionStatus]
    summary: SubscriptionStatusSummary
    trial_ends_at: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None

class AvailableBranchInfo(BaseModel):
    """Branch info for selection UI"""
    tenant_id: int
    name: str
    subdomain: str
    is_paid: bool
    is_active: bool
    subscription_end_date: Optional[datetime] = None

class AvailableBranchesMainLocation(BaseModel):
    """Main location info for branch selection"""
    tenant_id: int
    name: str
    subdomain: str
    is_paid: bool
    required: bool = True
    subscription_end_date: Optional[datetime] = None

class AvailableBranchesPricing(BaseModel):
    """Pricing information for branch selection"""
    main_price_kes: float
    branch_price_kes: float

class AvailableBranchesResponse(BaseModel):
    """Response with all available branches for subscription selection"""
    main_location: AvailableBranchesMainLocation
    branches: List[AvailableBranchInfo]
    pricing: AvailableBranchesPricing

class AddBranchRequest(BaseModel):
    """Request schema for adding branch to subscription"""
    branch_id: int

class AddBranchResponse(BaseModel):
    """Response schema for adding branch (pro-rata payment)"""
    authorization_url: str
    reference: str
    amount_kes: float
    prorata_percentage: float
    days_remaining: int
    message: str

class SubscriptionTransactionResponse(BaseModel):
    """Subscription transaction details"""
    id: int
    amount: float
    currency: str
    billing_cycle: str
    paystack_status: str
    payment_date: Optional[datetime] = None
    subscription_start_date: datetime
    subscription_end_date: datetime
    num_branches_included: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Customer Credit Module Schemas
# ============================================================================

class CustomerCreate(BaseModel):
    """Schema for creating a customer"""
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    """Schema for updating a customer"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    """Schema for customer response"""
    id: int
    tenant_id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = None
    current_balance: float
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreditTransactionResponse(BaseModel):
    """Schema for credit transaction response"""
    id: int
    customer_id: int
    sale_id: int
    original_amount: float
    amount_paid: float
    amount_due: float
    due_date: date
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    """Schema for recording a payment"""
    credit_transaction_id: int
    amount: float = Field(..., gt=0)
    payment_method: str = Field(..., min_length=1)
    payment_date: date
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    """Schema for payment response"""
    id: int
    customer_id: int
    credit_transaction_id: int
    amount: float
    payment_method: str
    payment_date: date
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReminderLogResponse(BaseModel):
    """Schema for reminder log response"""
    id: int
    credit_transaction_id: int
    reminder_stage: int
    sent_at: datetime
    success: bool
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================================
# Expense Schemas
# ============================================================================

class ExpenseCreate(BaseModel):
    """Schema for creating an expense"""
    type: str = Field(..., min_length=1, max_length=100)
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    expense_date: date
    branch_id: Optional[int] = None


class ExpenseUpdate(BaseModel):
    """Schema for updating an expense"""
    type: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[float] = Field(None, gt=0)
    description: Optional[str] = None
    expense_date: Optional[date] = None
    branch_id: Optional[int] = None


class ExpenseResponse(BaseModel):
    """Schema for expense response"""
    id: int
    tenant_id: int
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    type: str
    amount: float
    description: Optional[str] = None
    expense_date: date
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
