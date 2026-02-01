# Multi-Tenant Setup Guide

This document describes the multi-tenant setup for the Chef Inventory Management System.

## Backend Changes (Completed)

### 1. Database Schema
- Added `tenants` table with subscription plans, business settings
- Added `tenant_users` association table for user-tenant relationships
- All data tables (products, sales, stock_movements) now have `tenant_id` foreign keys
- CASCADE delete ensures data cleanup when tenants are removed

### 2. Authentication
- Login endpoint now requires `subdomain` parameter
- JWT tokens include `tenant_id` in payload
- All API endpoints automatically filter data by tenant context
- Users can belong to multiple tenants with different roles (ADMIN/STAFF)

### 3. Scripts
- `reset_tables.py` - Drop and recreate all tables (FIXED: now imports tenant_users)
- `seed_multi_tenant_data.py` - Seed 3 demo tenants with sample data
- `reset_and_seed.py` - Combined reset + seed in one command
- `drop_old_tables.py` - Remove orphaned tables from old schema

## Frontend Changes (Completed)

### 1. Authentication Context (`src/contexts/AuthContext.tsx`)
- Added `Tenant` interface with tenant details
- Added `tenant` state to AuthContext
- Updated `login()` function to accept `subdomain` parameter
- Tenant info stored in localStorage alongside token

### 2. API Service (`src/lib/api.ts`)
- Updated `login()` to send subdomain with credentials
- Backend automatically handles tenant context via JWT token

### 3. Login Page (`src/pages/Login.tsx`)
- Added subdomain input field
- Default subdomain: "demo"
- Shows credentials for all 3 demo tenants

### 4. Layout Component (`src/components/Layout.tsx`)
- Header now displays tenant name instead of "StatBricks"
- Shows subdomain in header subtitle

### 5. Dashboard (`src/pages/Dashboard.tsx`)
- Welcome message shows tenant-specific text
- All data automatically filtered by tenant via token

## Testing Instructions

### 1. Start the Backend

```bash
cd /home/dmaangi/cdc-projects/apps/Chef/backend
source venv/bin/activate
python main.py
```

The backend should start on http://localhost:8000

### 2. Start the Frontend

Open a new terminal:

```bash
cd /home/dmaangi/cdc-projects/apps/Chef/frontend
npm run dev
```

The frontend should start on http://localhost:5173

### 3. Test Multi-Tenancy

#### Test Scenario 1: Demo Tenant
1. Navigate to http://localhost:5173
2. Login with:
   - Subdomain: `demo`
   - Username: `admin`
   - Password: `admin123`
3. Verify:
   - Header shows "Demo Business"
   - Dashboard shows "Demo Business's business overview"
   - You can see 8 products (Laptop, Mouse, Chair, etc.)
   - Sales history shows 2 sales

#### Test Scenario 2: Acme Tenant
1. Logout
2. Login with:
   - Subdomain: `acme`
   - Username: `acme_admin`
   - Password: `acme123`
3. Verify:
   - Header shows "Acme Corporation"
   - You can see 5 products (Industrial Pump, Safety Helmet, etc.)
   - Sales history shows 1 sale
   - **Different data than Demo tenant**

#### Test Scenario 3: Globex Tenant
1. Logout
2. Login with:
   - Subdomain: `globex`
   - Username: `globex_admin`
   - Password: `globex123`
3. Verify:
   - Header shows "Globex Inc"
   - You can see 4 products (Burger Patty, French Fries, etc.)
   - Sales history shows 1 sale
   - **Different data than other tenants**

#### Test Scenario 4: Multi-Tenant Consultant
1. Logout
2. Login with:
   - Subdomain: `demo` (or `acme` or `globex`)
   - Username: `consultant`
   - Password: `consultant123`
3. Verify:
   - Can access any tenant's data by changing subdomain
   - Has STAFF role in all tenants

### 4. Verify Data Isolation

Critical test: Make sure each tenant only sees their own data!

1. Login as Demo admin
2. Note the product list (8 products starting with Laptop)
3. Logout and login as Acme admin
4. Verify you see completely different products (5 industrial products)
5. Create a new product in Acme tenant
6. Logout and login as Demo admin
7. Verify the new product does NOT appear in Demo tenant

## Architecture Summary

### Data Flow
1. User enters subdomain + credentials in login form
2. Frontend sends `POST /auth/login` with `{username, password, subdomain}`
3. Backend validates credentials and tenant membership
4. Backend returns JWT token with `tenant_id` in payload + tenant object
5. Frontend stores token + tenant in localStorage
6. All subsequent API calls include token in Authorization header
7. Backend extracts `tenant_id` from token
8. Backend automatically filters all queries by `tenant_id`

### Security Features
- JWT tokens include tenant context
- Backend validates user belongs to requested tenant
- All database queries automatically scoped by tenant_id
- No way to access another tenant's data with valid token
- CASCADE delete prevents orphaned data

## Database Structure

### Tenants Table
- `id` - Primary key
- `name` - Business name (e.g., "Demo Business")
- `subdomain` - Unique subdomain (e.g., "demo")
- `subscription_plan` - FREE, BASIC, PREMIUM
- `currency`, `tax_rate`, `timezone` - Business settings

### Tenant-Scoped Tables
All these tables have `tenant_id` foreign key:
- `products` - Inventory items
- `sales` - Sales records
- `sale_items` - Line items in sales
- `stock_movements` - Inventory audit trail

### User-Tenant Association
- `tenant_users` - Many-to-many relationship
- Links users to tenants with role (ADMIN/STAFF)
- Users can belong to multiple tenants

## Available Demo Tenants

| Subdomain | Name | Plan | Admin Username | Password | Products | Business Type |
|-----------|------|------|----------------|----------|----------|---------------|
| demo | Demo Business | PREMIUM | admin | admin123 | 8 | Retail |
| acme | Acme Corporation | BASIC | acme_admin | acme123 | 5 | Wholesale |
| globex | Globex Inc | FREE | globex_admin | globex123 | 4 | Restaurant |

## Troubleshooting

### Issue: Cannot reset database
**Solution:** Run `python drop_old_tables.py` first to remove orphaned tables

### Issue: Login fails with "user not found"
**Solution:** Make sure you've run `python reset_and_seed.py` to populate the database

### Issue: See data from another tenant
**Solution:** This is a critical bug. Check:
1. JWT token includes correct `tenant_id`
2. Backend filters queries by `tenant_id` from token
3. Check browser localStorage for correct tenant data

### Issue: Frontend shows "StatBricks" instead of tenant name
**Solution:** Check that:
1. Backend returns `tenant` object in login response
2. Frontend stores tenant in localStorage
3. Layout component reads tenant from AuthContext

## API Endpoints

### Authentication
- `POST /auth/login` - Login with subdomain
  - Body: `{username, password, subdomain}`
  - Returns: `{access_token, tenant, user}`

### Products (all automatically tenant-scoped)
- `GET /products` - List products for current tenant
- `POST /products` - Create product in current tenant
- `PUT /products/{id}` - Update product (only if belongs to tenant)

### Sales (all automatically tenant-scoped)
- `GET /sales` - List sales for current tenant
- `POST /sales` - Create sale in current tenant

### Dashboard (tenant-scoped)
- `GET /dashboard/stats` - Stats for current tenant
- `GET /reports/financial` - Financial report for current tenant

## Next Steps (Optional Enhancements)

1. **Tenant Switcher** - Dropdown to switch between accessible tenants without logout
2. **Tenant Registration** - Self-service tenant creation form
3. **Tenant Settings** - Admin page to update business info, upload logo
4. **User Management** - Invite users, manage roles within tenant
5. **Subscription Management** - Upgrade/downgrade plans, usage limits
6. **Custom Branding** - Allow tenants to customize colors, logo
7. **Subdomain Routing** - Support actual subdomain URLs (demo.statbricks.com)
8. **Audit Logs** - Track all actions per tenant for compliance

## Files Modified

### Backend
- `backend/models.py` - Multi-tenant schema
- `backend/reset_tables.py` - Fixed tenant_users import
- `backend/seed_multi_tenant_data.py` - Seed 3 tenants
- `backend/reset_and_seed.py` - NEW: Combined reset+seed script
- `backend/drop_old_tables.py` - NEW: Clean up old schema

### Frontend
- `frontend/src/contexts/AuthContext.tsx` - Added tenant state
- `frontend/src/lib/api.ts` - Updated login with subdomain
- `frontend/src/pages/Login.tsx` - Added subdomain input
- `frontend/src/components/Layout.tsx` - Display tenant name
- `frontend/src/pages/Dashboard.tsx` - Tenant-specific welcome

## Success Criteria

✅ Users can login with subdomain parameter
✅ Each tenant sees only their own data
✅ Header displays correct tenant name
✅ Dashboard shows tenant-specific overview
✅ Products are isolated per tenant
✅ Sales are isolated per tenant
✅ Consultant user can access multiple tenants
✅ Data cannot leak between tenants
✅ Token includes tenant context
✅ All API calls automatically scoped by tenant

---

**Status:** ✅ COMPLETE - Frontend and backend fully support multi-tenancy
**Date:** 2026-01-07
**Version:** 1.0
