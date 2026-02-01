from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Enum as SQLEnum, Table, UniqueConstraint, Index, Date
from sqlalchemy.orm import relationship, backref
from datetime import datetime
import enum
from database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    STAFF = "staff"


class Permission(str, enum.Enum):
    """Feature-level permissions for RBAC"""
    VIEW_DASHBOARD = "view_dashboard"
    VIEW_REPORTS = "view_reports"
    MANAGE_POS = "manage_pos"
    VIEW_SALES_HISTORY = "view_sales_history"
    MANAGE_INVENTORY = "manage_inventory"
    MANAGE_USERS = "manage_users"
    MANAGE_SETTINGS = "manage_settings"
    MANAGE_BRANCHES = "manage_branches"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockMovementType(str, enum.Enum):
    IN = "in"
    OUT = "out"
    ADJUSTMENT = "adjustment"


class SubscriptionPlan(str, enum.Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"


class CreditTransactionStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"


# Association table for many-to-many relationship between User and Tenant
tenant_users = Table(
    'tenant_users',
    Base.metadata,
    Column('id', Integer, primary_key=True),
    Column('tenant_id', Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    Column('role', SQLEnum(UserRole), default=UserRole.STAFF, nullable=False),
    Column('branch_id', Integer, ForeignKey('tenants.id', ondelete='SET NULL'), nullable=True),  # Assigned branch for staff
    Column('is_owner', Boolean, default=False),  # Distinguishes owner from branch admin
    Column('is_active', Boolean, default=True),
    Column('joined_at', DateTime, default=datetime.utcnow),
    Column('last_login_at', DateTime, nullable=True),  # Track last login time
    UniqueConstraint('tenant_id', 'user_id', name='uq_tenant_user'),
    Index('idx_tenant_users_tenant', 'tenant_id'),
    Index('idx_tenant_users_user', 'user_id'),
    Index('idx_tenant_users_branch', 'branch_id'),
    Index('idx_tenant_users_last_login', 'last_login_at')
)


class OrgRole(str, enum.Enum):
    ORG_ADMIN = "org_admin"
    ORG_VIEWER = "org_viewer"


# Association table for many-to-many relationship between User and Organization
organization_users = Table(
    'organization_users',
    Base.metadata,
    Column('id', Integer, primary_key=True),
    Column('organization_id', Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    Column('role', SQLEnum(OrgRole), default=OrgRole.ORG_ADMIN, nullable=False),
    Column('is_active', Boolean, default=True),
    Column('joined_at', DateTime, default=datetime.utcnow),
    UniqueConstraint('organization_id', 'user_id', name='uq_organization_user'),
    Index('idx_org_users_org', 'organization_id'),
    Index('idx_org_users_user', 'user_id')
)


class Tenant(Base):
    """Multi-tenant organization/business model"""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    
    # Business Identity
    name = Column(String(100), nullable=False)  # Business name
    subdomain = Column(String(50), unique=True, nullable=False, index=True)  # acme.statbricks.com
    slug = Column(String(50), unique=True, nullable=False, index=True)  # acme

    # Contact Information
    owner_email = Column(String(100), nullable=False)
    phone = Column(String(20))
    address = Column(Text)
    logo_url = Column(String(255), nullable=True)  # Path to uploaded business logo

    # Organization Link (for branches) - DEPRECATED, use parent_tenant_id instead
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)
    branch_type = Column(String(20), default='independent')  # 'independent' or 'branch'

    # Simple Branch Hierarchy (replaces complex organization model)
    parent_tenant_id = Column(Integer, ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True, index=True)

    # Subscription & Limits (for future use)
    subscription_plan = Column(SQLEnum(SubscriptionPlan), default=SubscriptionPlan.FREE, nullable=False)
    max_users = Column(Integer, default=5)
    max_products = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)

    # Manual Transaction Blocking (Super Admin)
    is_manually_blocked = Column(Boolean, default=False, nullable=False)
    manually_blocked_at = Column(DateTime, nullable=True)
    manually_blocked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    manual_block_reason = Column(Text, nullable=True)

    # Trial Tracking
    trial_ends_at = Column(DateTime, nullable=True)  # Auto-set to created_at + 14 days
    subscription_status = Column(String(20), default='trial')  # 'trial', 'active', 'expired', 'cancelled'
    
    # Paystack Integration
    paystack_customer_code = Column(String(100), nullable=True)  # Paystack customer ID
    paystack_subscription_code = Column(String(100), nullable=True)  # Paystack subscription ID
    paystack_plan_code = Column(String(100), nullable=True)  # Which plan they're on
    auto_renewal_enabled = Column(Boolean, default=False)  # Whether auto-renewal is enabled
    saved_branch_selection_json = Column(Text, nullable=True)  # JSON array of branch IDs to auto-renew

    # Payment Tracking
    last_payment_date = Column(DateTime, nullable=True)
    next_billing_date = Column(DateTime, nullable=True)
    payment_method = Column(String(50), nullable=True)  # card, bank_transfer
    billing_cycle = Column(String(20), nullable=True)  # 'quarterly', 'semi_annual', 'annual'
    
    # Business Settings
    currency = Column(String(3), default="KES")
    tax_rate = Column(Float, default=0.16)  # 16% VAT
    business_type = Column(String(50))  # retail, wholesale, restaurant
    timezone = Column(String(50), default="Africa/Nairobi")
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    subscription_expires_at = Column(DateTime)
    
    # Relationships
    organization = relationship("Organization", back_populates="branches")  # DEPRECATED

    # Simple branch hierarchy (self-referential)
    branches = relationship(
        "Tenant",
        backref=backref('parent_tenant', remote_side=[id]),
        foreign_keys=[parent_tenant_id],
        cascade="all, delete-orphan"
    )

    users = relationship(
        "User",
        secondary=tenant_users,
        back_populates="tenants",
        primaryjoin="Tenant.id == tenant_users.c.tenant_id",
        secondaryjoin="User.id == tenant_users.c.user_id"
    )
    products = relationship("Product", back_populates="tenant", cascade="all, delete-orphan")
    sales = relationship("Sale", foreign_keys="Sale.tenant_id", back_populates="tenant", cascade="all, delete-orphan")  # Specify foreign key to avoid ambiguity with branch_id
    branch_stocks = relationship("BranchStock", back_populates="branch", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tenant {self.name} ({self.subdomain})>"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    is_super_admin = Column(Boolean, default=False, nullable=False)  # Platform-wide super admin
    env_based = Column(Boolean, default=False, nullable=False)  # Environment-based admin (cannot be deleted)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Password reset fields
    reset_token = Column(String(255), nullable=True, index=True)
    reset_token_expires = Column(DateTime, nullable=True)

    # Many-to-many relationships
    tenants = relationship(
        "Tenant",
        secondary=tenant_users,
        back_populates="users",
        primaryjoin="User.id == tenant_users.c.user_id",
        secondaryjoin="Tenant.id == tenant_users.c.tenant_id"
    )
    organizations = relationship("Organization", secondary=organization_users, back_populates="users")

    # Relationships scoped by tenant
    sales = relationship("Sale", back_populates="user")
    stock_movements = relationship("StockMovement", back_populates="user")

    def __repr__(self):
        return f"<User {self.username}>"


class Category(Base):
    """Product category model - global (super admin managed)"""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(50), nullable=False, unique=True)
    display_order = Column(Integer, default=0, nullable=False)
    icon = Column(String(50))  # Icon name (e.g., "laptop", "coffee", "box")
    color = Column(String(20))  # Color code or name (e.g., "#3B82F6", "blue-500")
    is_active = Column(Boolean, default=True)

    # Profit margin settings (NULL = use system defaults 25%/15%)
    target_margin = Column(Float, nullable=True, default=None)  # Percentage
    minimum_margin = Column(Float, nullable=True, default=None)  # Percentage

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    products = relationship("Product", back_populates="category_rel")

    # Indexes for performance
    __table_args__ = (
        Index('idx_categories_active', 'is_active'),
        Index('idx_categories_display_order', 'display_order'),
    )

    def __repr__(self):
        return f"<Category {self.name}>"


class Unit(Base):
    """Product unit model - global (super admin managed)"""
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(30), nullable=False, unique=True)  # e.g., "pcs", "kg", "liters"
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes for performance
    __table_args__ = (
        Index('idx_units_active', 'is_active'),
        Index('idx_units_display_order', 'display_order'),
    )

    def __repr__(self):
        return f"<Unit {self.name}>"


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    sku = Column(String(50), nullable=False, index=True)
    barcode = Column(String(50), nullable=True, index=True)  # Manufacturer barcode (EAN-13, UPC-A, etc.)
    description = Column(Text)
    base_cost = Column(Float, nullable=False, default=0.0)  # Default 0.0 - can be set later via "Receive Stock"
    selling_price = Column(Float, nullable=False, default=0.0)  # Default 0.0 - can be set later via "Receive Stock"
    target_margin = Column(Float, nullable=False, default=25.0)  # Percentage
    minimum_margin = Column(Float, nullable=False, default=15.0)  # Percentage
    quantity = Column(Integer, nullable=False, default=0)
    lead_time_days = Column(Integer, default=7, nullable=False)  # For auto-calculating reorder level

    # Category relationship (NEW)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete='RESTRICT'), nullable=True, index=True)

    # Legacy category field (for migration - will be removed later)
    category_legacy = Column(String(50), nullable=True)

    unit = Column(String(20), default="pcs")  # pieces, kg, liters
    image_url = Column(String(255))
    reorder_level = Column(Integer, default=10)
    is_available = Column(Boolean, default=True)
    is_service = Column(Boolean, default=False, nullable=False)  # NEW: Distinguish services from physical products
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="products")
    category_rel = relationship("Category", back_populates="products")
    sale_items = relationship("SaleItem", back_populates="product")
    stock_movements = relationship("StockMovement", back_populates="product")
    branch_stocks = relationship("BranchStock", back_populates="product", cascade="all, delete-orphan")
    price_history = relationship("PriceHistory", back_populates="product", cascade="all, delete-orphan")

    # Unique constraint: SKU must be unique within a tenant
    __table_args__ = (
        UniqueConstraint('tenant_id', 'sku', name='uq_tenant_product_sku'),
        Index('idx_products_tenant_available', 'tenant_id', 'is_available'),
        Index('idx_products_category', 'category_id'),
        Index('idx_products_tenant_service', 'tenant_id', 'is_service'),  # NEW: Index for service filtering
        Index('idx_products_tenant_barcode', 'tenant_id', 'barcode'),  # NEW: Fast barcode lookup
    )

    def __repr__(self):
        return f"<Product {self.name} (Tenant: {self.tenant_id})>"


class PriceHistory(Base):
    """Price history model - Tracks all pricing changes for products and services"""
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete='SET NULL'), nullable=True)  # Nullable if user deleted

    # Pricing data
    base_cost = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)

    # Source tracking
    source = Column(String(20), nullable=False)  # 'receipt', 'adjustment', 'manual_update', 'migration'
    reference = Column(String(255), nullable=True)  # Invoice #, reason for change, etc.
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    product = relationship("Product", back_populates="price_history")
    user = relationship("User")

    __table_args__ = (
        Index('idx_price_history_product', 'product_id'),
        Index('idx_price_history_created', 'product_id', 'created_at'),
    )

    def __repr__(self):
        return f"<PriceHistory Product:{self.product_id} Cost:{self.base_cost} Price:{self.selling_price}>"


class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)  # NEW: Track which branch created the sale

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)  # Link to Customer entity
    customer_name = Column(String(100))
    customer_email = Column(String(100), nullable=True)  # Customer email for receipt delivery
    customer_phone = Column(String(20), nullable=True)  # Customer phone for WhatsApp receipt
    whatsapp_sent = Column(Boolean, default=False, nullable=False)  # Track if WhatsApp receipt was sent
    email_sent = Column(Boolean, default=False, nullable=False)  # Track if Email receipt was sent
    status = Column(SQLEnum(OrderStatus), default=OrderStatus.PENDING, nullable=False)
    subtotal = Column(Float, nullable=False, default=0)
    tax = Column(Float, nullable=False, default=0)
    total = Column(Float, nullable=False, default=0)
    payment_method = Column(String(50))  # Cash, M-Pesa, Card, Credit
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", foreign_keys=[tenant_id], back_populates="sales")  # Specify foreign key to avoid ambiguity
    user = relationship("User", back_populates="sales")
    branch = relationship("Tenant", foreign_keys=[branch_id])  # NEW: Link to branch tenant
    customer = relationship("Customer", back_populates="sales")
    credit_transaction = relationship("CreditTransaction", back_populates="sale", uselist=False)
    sale_items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_sales_tenant_status', 'tenant_id', 'status'),
        Index('idx_sales_tenant_created', 'tenant_id', 'created_at'),
        Index('idx_sales_tenant_branch', 'tenant_id', 'branch_id'),  # NEW: Index for branch-filtered queries
    )

    def __repr__(self):
        return f"<Sale {self.id} (Tenant: {self.tenant_id})>"


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id", ondelete='CASCADE'), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)  # Nullable for org products
    org_product_id = Column(Integer, ForeignKey("organization_products.id"), nullable=True)  # For branch sales
    branch_stock_id = Column(Integer, ForeignKey("branch_stock.id"), nullable=True)  # NEW: Audit trail for branch stock deduction
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)  # Selling price at time of sale
    subtotal = Column(Float, nullable=False)

    sale = relationship("Sale", back_populates="sale_items")
    product = relationship("Product", back_populates="sale_items")
    org_product = relationship("OrganizationProduct", back_populates="sale_items")
    branch_stock_rel = relationship("BranchStock", foreign_keys=[branch_stock_id])  # NEW: Link to branch stock

    def __repr__(self):
        return f"<SaleItem {self.id} (Sale: {self.sale_id}, Product: {self.product_id})>"


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete='CASCADE'), nullable=True)  # Nullable for org products
    org_product_id = Column(Integer, ForeignKey("organization_products.id"), nullable=True)  # For branch stock
    branch_stock_id = Column(Integer, ForeignKey("branch_stock.id"), nullable=True)  # For branch stock movements
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    movement_type = Column(SQLEnum(StockMovementType), nullable=False)
    quantity = Column(Integer, nullable=False)  # Positive for IN, Negative for OUT/ADJUSTMENT
    previous_stock = Column(Integer, nullable=False)
    new_stock = Column(Integer, nullable=False)

    # Pricing tracking (for receipt and adjustment movements)
    base_cost = Column(Float, nullable=True)  # Cost per unit at time of receipt
    selling_price = Column(Float, nullable=True)  # Selling price per unit at time of receipt
    supplier = Column(String(255), nullable=True)  # Supplier name (for receipts)
    reference = Column(String(255), nullable=True)  # Invoice/PO reference

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="stock_movements")
    org_product = relationship("OrganizationProduct", back_populates="stock_movements")
    branch_stock = relationship("BranchStock", back_populates="stock_movements")
    user = relationship("User", back_populates="stock_movements")

    __table_args__ = (
        Index('idx_stock_movements_product', 'product_id'),
    )

    def __repr__(self):
        return f"<StockMovement {self.id} ({self.movement_type})>"


class Organization(Base):
    """Organization model - Groups multiple branches/tenants"""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)

    # Business Identity
    name = Column(String(100), nullable=False)
    owner_email = Column(String(100), nullable=False)

    # Business Settings
    currency = Column(String(3), default="KES")
    tax_rate = Column(Float, default=0.16)
    timezone = Column(String(50), default="Africa/Nairobi")

    # Subscription & Limits
    subscription_plan = Column(SQLEnum(SubscriptionPlan), default=SubscriptionPlan.FREE, nullable=False)
    max_branches = Column(Integer, default=3)
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    branches = relationship("Tenant", back_populates="organization")
    users = relationship("User", secondary=organization_users, back_populates="organizations")
    categories = relationship("OrganizationCategory", back_populates="organization", cascade="all, delete-orphan")
    products = relationship("OrganizationProduct", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Organization {self.name}>"


class OrganizationCategory(Base):
    """Organization category model - Shared across all branches"""
    __tablename__ = "organization_categories"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete='CASCADE'), nullable=False, index=True)

    name = Column(String(50), nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    icon = Column(String(50))
    color = Column(String(20))
    is_active = Column(Boolean, default=True)

    # Profit margin settings
    target_margin = Column(Float, nullable=True, default=None)
    minimum_margin = Column(Float, nullable=True, default=None)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="categories")
    products = relationship("OrganizationProduct", back_populates="category_rel")

    # Unique constraint: Category name must be unique within organization
    __table_args__ = (
        UniqueConstraint('organization_id', 'name', name='uq_org_category_name'),
        Index('idx_org_categories_org_active', 'organization_id', 'is_active'),
    )

    def __repr__(self):
        return f"<OrganizationCategory {self.name} (Org: {self.organization_id})>"


class OrganizationProduct(Base):
    """Organization product model - Shared catalog across all branches"""
    __tablename__ = "organization_products"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete='CASCADE'), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    sku = Column(String(50), nullable=False, index=True)
    description = Column(Text)
    base_cost = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)
    target_margin = Column(Float, nullable=False, default=25.0)
    minimum_margin = Column(Float, nullable=False, default=15.0)

    category_id = Column(Integer, ForeignKey("organization_categories.id", ondelete='RESTRICT'), nullable=True, index=True)
    unit = Column(String(20), default="pcs")
    image_url = Column(String(255))
    reorder_level = Column(Integer, default=10)
    is_available = Column(Boolean, default=True)
    is_service = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="products")
    category_rel = relationship("OrganizationCategory", back_populates="products")
    sale_items = relationship("SaleItem", back_populates="org_product")
    stock_movements = relationship("StockMovement", back_populates="org_product")

    # Unique constraint: SKU must be unique within organization
    __table_args__ = (
        UniqueConstraint('organization_id', 'sku', name='uq_org_product_sku'),
        Index('idx_org_products_org_available', 'organization_id', 'is_available'),
    )

    def __repr__(self):
        return f"<OrganizationProduct {self.name} (Org: {self.organization_id})>"


class BranchStock(Base):
    """Branch stock model - Per-branch inventory tracking"""
    __tablename__ = "branch_stock"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete='CASCADE'), nullable=False, index=True)

    quantity = Column(Integer, nullable=False, default=0)
    override_selling_price = Column(Float, nullable=True)  # Optional branch-specific pricing

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    branch = relationship("Tenant", back_populates="branch_stocks")
    product = relationship("Product", back_populates="branch_stocks")
    stock_movements = relationship("StockMovement", back_populates="branch_stock")

    # Unique constraint: One stock record per product per branch
    __table_args__ = (
        UniqueConstraint('tenant_id', 'product_id', name='uq_branch_product_stock'),
        Index('idx_branch_stock_tenant_product', 'tenant_id', 'product_id'),
    )

    def __repr__(self):
        return f"<BranchStock Tenant:{self.tenant_id} Product:{self.product_id} Qty:{self.quantity}>"


class AdminActivityLog(Base):
    """Admin activity log model - Tracks super admin actions"""
    __tablename__ = "admin_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, ForeignKey("users.id", ondelete='CASCADE'), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)  # login, suspend_tenant, create_admin, etc.
    target_type = Column(String(50))  # tenant, user, admin
    target_id = Column(Integer)
    details = Column(Text)  # JSON string with additional details
    ip_address = Column(String(50))
    user_agent = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    admin_user = relationship("User", foreign_keys=[admin_user_id])

    __table_args__ = (
        Index('idx_admin_logs_target', 'target_type', 'target_id'),
    )

    def __repr__(self):
        return f"<AdminActivityLog {self.action} by User:{self.admin_user_id}>"


class SubscriptionTransaction(Base):
    """Subscription transaction model - Tracks all subscription payments"""
    __tablename__ = "subscription_transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)

    # Payment Details
    amount = Column(Float, nullable=False)  # Amount in KES
    currency = Column(String(3), default="KES", nullable=False)
    billing_cycle = Column(String(20), nullable=False)  # 'monthly', 'semi_annual', 'annual'

    # Paystack Details
    paystack_reference = Column(String(100), unique=True, nullable=False, index=True)  # Unique transaction reference
    paystack_status = Column(String(20), nullable=False)  # 'pending', 'success', 'failed'
    paystack_customer_code = Column(String(100))
    paystack_authorization_code = Column(String(100))  # For recurring payments

    # Metadata
    payment_method = Column(String(50))  # card, bank_transfer
    channel = Column(String(50))  # How they paid (card, bank, ussd, etc.)
    ip_address = Column(String(50))

    # Branch Selection Metadata (NEW)
    num_branches_included = Column(Integer, default=0)  # Number of branches in this payment
    branch_selection_json = Column(Text, nullable=True)  # JSON array of selected branch IDs
    main_location_included = Column(Boolean, default=True)  # Always true, but tracked for audit

    # Subscription Period
    subscription_start_date = Column(DateTime, nullable=False)
    subscription_end_date = Column(DateTime, nullable=False)

    # Timestamps
    payment_date = Column(DateTime)  # When payment was completed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant")
    branch_subscriptions = relationship("BranchSubscription", back_populates="transaction", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_subscription_txn_tenant', 'tenant_id'),
        Index('idx_subscription_txn_status', 'paystack_status'),
        Index('idx_subscription_txn_date', 'payment_date'),
    )

    def __repr__(self):
        return f"<SubscriptionTransaction {self.id} (Tenant: {self.tenant_id}, Status: {self.paystack_status})>"


class BranchSubscription(Base):
    """
    Branch subscription model - Historical record of which branches were included in each payment.

    Junction table that tracks "In transaction X, these branches were paid for".
    Used for audit trail and historical reporting.
    """
    __tablename__ = "branch_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("subscription_transactions.id", ondelete='CASCADE'), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    is_main_location = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    transaction = relationship("SubscriptionTransaction", back_populates="branch_subscriptions")
    tenant = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint('transaction_id', 'tenant_id', name='uq_transaction_tenant'),
        Index('idx_branch_sub_transaction', 'transaction_id'),
        Index('idx_branch_sub_tenant', 'tenant_id'),
    )

    def __repr__(self):
        return f"<BranchSubscription Transaction:{self.transaction_id} Tenant:{self.tenant_id} Main:{self.is_main_location}>"


class ActiveBranchSubscription(Base):
    """
    Active branch subscription model - Current subscription status for each branch.

    Quick lookup table for "Is branch X currently paid?" Used by middleware to enforce
    read-only access for unpaid branches.
    """
    __tablename__ = "active_branch_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    parent_tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    branch_tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    subscription_start_date = Column(DateTime, nullable=False)
    subscription_end_date = Column(DateTime, nullable=False)
    last_transaction_id = Column(Integer, ForeignKey("subscription_transactions.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_cancelled = Column(Boolean, default=False, nullable=False)
    cancelled_at = Column(DateTime, nullable=True)

    # Relationships
    parent_tenant = relationship("Tenant", foreign_keys=[parent_tenant_id])
    branch_tenant = relationship("Tenant", foreign_keys=[branch_tenant_id])
    last_transaction = relationship("SubscriptionTransaction")

    __table_args__ = (
        UniqueConstraint('parent_tenant_id', 'branch_tenant_id', name='uq_parent_branch'),
        Index('idx_active_branch_parent', 'parent_tenant_id'),
        Index('idx_active_branch_end_date', 'subscription_end_date'),
        Index('idx_active_branch_cancelled', 'is_cancelled'),
    )

    def __repr__(self):
        return f"<ActiveBranchSubscription Parent:{self.parent_tenant_id} Branch:{self.branch_tenant_id} Active:{self.is_active}>"


class Customer(Base):
    """Customer entity for credit tracking and relationship management"""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    credit_limit = Column(Float, nullable=True)  # None = no limit
    current_balance = Column(Float, nullable=False, default=0.0)  # Denormalized outstanding debt
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    credit_transactions = relationship("CreditTransaction", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")
    sales = relationship("Sale", back_populates="customer")

    __table_args__ = (
        Index('idx_customers_tenant', 'tenant_id'),
        Index('idx_customers_tenant_name', 'tenant_id', 'name'),
    )

    def __repr__(self):
        return f"<Customer {self.name} (Tenant: {self.tenant_id})>"


class CreditTransaction(Base):
    """Credit transaction tied to a sale — tracks outstanding debt"""
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete='CASCADE'), nullable=False, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id", ondelete='CASCADE'), nullable=False, unique=True)
    original_amount = Column(Float, nullable=False)
    amount_paid = Column(Float, nullable=False, default=0.0)
    amount_due = Column(Float, nullable=False)
    due_date = Column(Date, nullable=False)
    status = Column(SQLEnum(CreditTransactionStatus), default=CreditTransactionStatus.PENDING, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", back_populates="credit_transactions")
    sale = relationship("Sale", back_populates="credit_transaction")
    payments = relationship("Payment", back_populates="credit_transaction")
    reminders = relationship("ReminderLog", back_populates="credit_transaction")

    __table_args__ = (
        Index('idx_credit_txn_tenant', 'tenant_id'),
        Index('idx_credit_txn_customer', 'customer_id'),
        Index('idx_credit_txn_status', 'status'),
        Index('idx_credit_txn_due_date', 'due_date'),
    )

    def __repr__(self):
        return f"<CreditTransaction {self.id} Customer:{self.customer_id} Due:{self.amount_due}>"


class Payment(Base):
    """Payment against a credit transaction"""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete='CASCADE'), nullable=False, index=True)
    credit_transaction_id = Column(Integer, ForeignKey("credit_transactions.id", ondelete='CASCADE'), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False)  # Cash, M-Pesa, etc.
    payment_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    customer = relationship("Customer", back_populates="payments")
    credit_transaction = relationship("CreditTransaction", back_populates="payments")

    __table_args__ = (
        Index('idx_payments_tenant', 'tenant_id'),
        Index('idx_payments_customer', 'customer_id'),
        Index('idx_payments_credit_txn', 'credit_transaction_id'),
    )

    def __repr__(self):
        return f"<Payment {self.id} Amount:{self.amount} Customer:{self.customer_id}>"


class Expense(Base):
    """Business expense model - Tracks operational expenses per tenant"""
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)  # Track which branch created the expense
    type = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    expense_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    branch = relationship("Tenant", foreign_keys=[branch_id])  # Link to branch tenant

    __table_args__ = (
        Index('idx_expenses_tenant', 'tenant_id'),
        Index('idx_expenses_tenant_date', 'tenant_id', 'expense_date'),
        Index('idx_expenses_tenant_type', 'tenant_id', 'type'),
        Index('idx_expenses_tenant_branch', 'tenant_id', 'branch_id'),
    )

    def __repr__(self):
        return f"<Expense {self.type} ({self.amount}) Tenant:{self.tenant_id}>"


class ReminderLog(Base):
    """Audit log for credit reminder emails sent"""
    __tablename__ = "reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    credit_transaction_id = Column(Integer, ForeignKey("credit_transactions.id", ondelete='CASCADE'), nullable=False, index=True)
    reminder_stage = Column(Integer, nullable=False)  # 0=due day, 3=3 days after, 7=7 days, 14=14 days
    sent_at = Column(DateTime, default=datetime.utcnow)
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text, nullable=True)

    # Relationship
    credit_transaction = relationship("CreditTransaction", back_populates="reminders")

    __table_args__ = (
        Index('idx_reminder_logs_credit_txn', 'credit_transaction_id'),
        Index('idx_reminder_logs_stage', 'credit_transaction_id', 'reminder_stage'),
    )

    def __repr__(self):
        return f"<ReminderLog Stage:{self.reminder_stage} TXN:{self.credit_transaction_id}>"
