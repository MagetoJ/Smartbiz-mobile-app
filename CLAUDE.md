# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**StatBricks** is a multi-tenant SaaS inventory and POS management system for small to medium businesses. Originally named "Chef Hotel Management System", it supports multiple organizations with complete data isolation through a subdomain-based architecture.

**Key Capabilities:**
- Multi-tenant architecture with subdomain routing (e.g., acme.statbricks.com)
- Point of Sale (POS) system with real-time inventory management
- Sales tracking and financial reporting with dashboard analytics
- Stock movement tracking and low-stock alerts
- Progressive Web App (PWA) for mobile/desktop installation

## Architecture

### Backend (FastAPI + PostgreSQL)
- **Framework:** FastAPI 0.115.5 with async/await throughout
- **Database:** PostgreSQL with asyncpg (async driver)
- **ORM:** SQLAlchemy 2.0.36 (async mode)
- **Authentication:** JWT tokens with tenant_id embedded in payload
- **Data Isolation:** Every query automatically scoped by tenant_id from token

### Frontend (React + TypeScript)
- **Framework:** React 18.3.1 with TypeScript 5.6.3
- **Build Tool:** Vite 5.4.11
- **Styling:** Tailwind CSS with custom green/orange theme
- **Routing:** React Router 6.28.0
- **State:** AuthContext for user/tenant management
- **API Proxy:** Vite dev server proxies `/api` → `http://localhost:8000`

### Multi-Tenant Data Model

**Core tenant resolution flow:**
1. User logs in with `{username, password, subdomain}`
2. Backend validates user belongs to specified tenant
3. JWT token includes both `user_id` and `tenant_id`
4. All subsequent requests automatically filtered by `tenant_id`

**Key tables:**
- `tenants` - Organizations with subdomain, subscription plan, limits
- `tenant_users` - Many-to-many: users can belong to multiple tenants
- `products` - Inventory with `tenant_id` (SKU unique per tenant)
- `sales` - Orders with `tenant_id`
- `stock_movements` - Audit trail (inherits tenant from product)

**Critical constraints (verified and enforced):**
- ✅ `UNIQUE(tenant_id, sku)` on products - Enforced by `uq_tenant_product_sku`
  - Same SKU can exist across different tenants
  - Duplicate SKU within same tenant is blocked
- ✅ `UNIQUE(tenant_id, user_id)` on tenant_users - Enforced by `uq_tenant_user`
  - User can join multiple tenants
  - User cannot join the same tenant twice

## Common Development Commands

### Backend Setup & Running
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server (auto-creates DB tables on startup)
python main.py
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Frontend Setup & Running
```bash
cd frontend

# Install dependencies
yarn install

# Run development server
yarn dev
# App available at http://localhost:5173

# Build for production
yarn build

# Preview production build
yarn preview
```

### Database Management
```bash
# Setup new database (run from project root)
./setup_database.sh

# Reset database (drops all tables, re-seeds default tenant)
./reset_database.sh

# Seed sample data (menu items, products)
cd backend
python seed_data.py

# Seed multi-tenant test data (creates 2-3 test tenants)
python seed_multi_tenant_data.py

# Verify database constraints are working
python test_constraints.py
```

### Default Credentials
- **Subdomain:** demo
- **Username:** admin
- **Password:** admin123
- Access locally: http://demo.localhost:5173 (requires `/etc/hosts` entry)

## Code Architecture Patterns

### Backend: Tenant-Scoped Endpoints

All authenticated endpoints use these dependencies:
```python
@app.get("/products")
async def get_products(
    current_tenant: Tenant = Depends(get_current_tenant),  # Extracts tenant from JWT
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    # Query automatically filtered by tenant
    result = await db.execute(
        select(Product)
        .where(Product.tenant_id == current_tenant.id)
        .where(Product.is_available == True)
    )
    return result.scalars().all()
```

**Key functions in `backend/auth.py`:**
- `get_current_tenant()` - Extracts tenant_id from JWT token
- `get_current_active_user()` - Returns authenticated user
- `require_admin_role()` - Ensures user has admin role in current tenant
- `create_access_token()` - Creates JWT with `tenant_id` embedded

### Frontend: API Client Pattern

**Location:** `frontend/src/lib/api.ts`

All API calls use a central `fetchAPI()` helper:
```typescript
// Automatically adds Authorization header and handles errors
const products = await api.getProducts(token);

// Login includes subdomain (can extract from window.location.host)
const response = await api.login(username, password, subdomain);
// Response includes: { access_token, tenant, user }
```

**Auth flow in `frontend/src/contexts/AuthContext.tsx`:**
- Stores `token`, `user`, and `tenant` in state + localStorage
- Automatically includes token in all API requests
- Redirects to login if 401 Unauthorized

### Frontend: Responsive Design Strategy

The UI uses a mobile-first approach with three breakpoints:

**Navigation:**
- **Mobile (< 768px):** Bottom tab navigation (MobileNav.tsx)
- **Desktop (≥ 1024px):** Sidebar navigation (Layout.tsx)

**Layout patterns:**
- Stats grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- Product cards: `grid-cols-2 lg:grid-cols-4`
- Spacing: `p-4 md:p-6 lg:p-8`
- Tables: Hidden on mobile (`hidden lg:table`), replaced with card layout

**Color theme (Tailwind config):**
- Primary: Green (`primary-*`) - Main brand color
- Accent: Orange (`accent-*`) - CTAs and highlights
- Full scales from 50-900 for both colors

## File Locations Reference

### Backend Critical Files
- `backend/main.py` - All API routes, startup logic (creates default tenant)
- `backend/models.py` - SQLAlchemy models (Tenant, User, Product, Sale, etc.)
- `backend/schemas.py` - Pydantic schemas for request/response validation
- `backend/auth.py` - JWT authentication, tenant resolution, role checks
- `backend/tenants.py` - Tenant management router (register, invite users, etc.)
- `backend/database.py` - Database connection config (hardcoded URL)

### Frontend Critical Files
- `frontend/src/App.tsx` - Route definitions
- `frontend/src/contexts/AuthContext.tsx` - Global auth state
- `frontend/src/lib/api.ts` - API client with all endpoints
- `frontend/src/pages/POS.tsx` - Point of sale interface
- `frontend/src/pages/Inventory.tsx` - Product management
- `frontend/src/pages/Dashboard.tsx` - Analytics with Recharts
- `frontend/src/components/Layout.tsx` - Main layout wrapper
- `frontend/src/components/MobileNav.tsx` - Bottom mobile navigation

### Configuration Files
- `backend/.env` - Database credentials, JWT secret (gitignored)
- `backend/.env.template` - Template showing required env vars
- `frontend/vite.config.ts` - Vite config with API proxy
- `frontend/tailwind.config.js` - Custom green/orange theme

## Important Development Notes

### Multi-Tenancy Security
- **Never query by ID alone** - Always include `tenant_id` filter:
  ```python
  # ❌ WRONG - Exposes cross-tenant data
  product = await db.get(Product, product_id)

  # ✅ CORRECT - Tenant-scoped
  result = await db.execute(
      select(Product).where(
          Product.id == product_id,
          Product.tenant_id == current_tenant.id
      )
  )
  product = result.scalar_one_or_none()
  ```

- **JWT tokens include tenant context** - Don't accept tenant_id from request body
- **Return 404 for unauthorized access** - Don't reveal if resource exists in other tenant

### Database Conventions
- All business data tables have `tenant_id` foreign key with CASCADE delete
- Use `async/await` for all database operations (AsyncSession)
- Timestamps: `created_at`, `updated_at` (auto-managed by SQLAlchemy)
- Enums defined in models.py: `OrderStatus`, `UserRole`, `StockMovementType`, `SubscriptionPlan`
- ComBizite unique constraints ensure data integrity per tenant:
  - Products: `(tenant_id, sku)` prevents duplicate SKUs within a tenant
  - Tenant Users: `(tenant_id, user_id)` prevents duplicate memberships

### Frontend Conventions
- Use `api.*` functions from `lib/api.ts` for all API calls
- Store auth token in AuthContext (auto-persists to localStorage)
- TypeScript interfaces defined alongside API client in `lib/api.ts`
- All pages should handle loading and error states

### Testing Multi-Tenancy
Use `backend/seed_multi_tenant_data.py` to create test tenants:
- Creates 2-3 organizations with different subdomains
- Populates each with independent product catalogs
- Verifies data isolation (same SKU in different tenants)

### PWA Configuration
- Manifest in `vite.config.ts` under VitePWA plugin
- Service worker auto-generated by Vite PWA
- Icons expected at `/icon-192.png` and `/icon-512.png`

### Known Legacy References
The app was originally "Chef Hotel Management System" - some files still reference this:
- Vite manifest name
- README title
- Database name: `chef_db` (user: `chef_user`)

The rebranded name "StatBricks" is used in:
- API title in main.py
- Multi-tenant guide documentation
- Default tenant owner email

## API Endpoint Patterns

### Public (No Auth)
- `POST /tenants/register` - Create new organization + admin user
- `POST /auth/login` - Login with `{username, password, subdomain}`
- `GET /tenants/check-subdomain/{sub}` - Check availability

### Authenticated (Auto Tenant-Scoped)
- `GET /products` - List products in current tenant
- `POST /products` - Create product (tenant_id auto-assigned)
- `GET /sales` - List sales in current tenant
- `POST /sales` - Create sale with items
- `GET /dashboard/stats` - Dashboard analytics
- `POST /stock/movement` - Record stock change

### Tenant Management (Admin Only)
- `GET /tenants/me` - Current tenant details
- `PUT /tenants/me` - Update tenant settings
- `POST /tenants/me/users/invite` - Invite user to tenant
- `DELETE /tenants/me/users/{user_id}` - Remove user from tenant

## Constraint Verification

Both critical database constraints have been verified and are working correctly:

### Products Table: SKU Uniqueness
```sql
CONSTRAINT uq_tenant_product_sku UNIQUE (tenant_id, sku)
```
- ✅ **Allows:** Same SKU (e.g., "TECH-001") in different tenants
- ✅ **Blocks:** Duplicate SKU within the same tenant
- **Test result:** Attempting to create duplicate SKU in same tenant raises `IntegrityError`

### Tenant Users Table: Membership Uniqueness
```sql
CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
```
- ✅ **Allows:** User to join multiple different tenants
- ✅ **Blocks:** User from joining the same tenant twice
- **Test result:** Attempting duplicate membership raises `IntegrityError`

## Common Pitfalls

1. **Frontend subdomain handling:** Login requires subdomain parameter. Extract from `window.location.host` or provide input field.

2. **Database URL is hardcoded** in `backend/database.py` - Should use environment variable for production.

3. **SECRET_KEY in auth.py** is placeholder - Must change for production deployment.

4. **Stock movements don't have tenant_id** - They inherit it through the product relationship.

5. **Users can belong to multiple tenants** - Don't assume one-to-one relationship.

6. **Subscription limits are defined but not enforced** - `max_users` and `max_products` exist in schema but no enforcement logic yet.

7. **SKU constraints are per-tenant** - When validating SKU uniqueness, always include tenant_id in the query. The database allows same SKU across tenants by design.
