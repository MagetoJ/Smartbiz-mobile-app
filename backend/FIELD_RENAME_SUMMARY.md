# Field Rename: buying_price → base_cost

**Date**: 2026-01-08
**Status**: ✅ Complete and Tested

## Summary

Successfully renamed the `buying_price` field to `base_cost` throughout the entire Chef Hotel Management System to better reflect its use for both physical products and services.

## Rationale

With the addition of service products (non-inventory items), the term "buying price" was semantically tied to physical products. The more generic term "base cost" works for both:
- **Physical Products**: The cost to purchase/acquire the product
- **Services**: The base cost to provide the service

The `selling_price` field was kept as-is since it's already generic enough.

## Changes Made

### Backend (7 files)

1. **Database Migration** (`migrations/rename_buying_price_to_base_cost.py`)
   - Atomic column rename: `ALTER TABLE products RENAME COLUMN buying_price TO base_cost`
   - Includes rollback function for safety
   - Added column comment for clarity

2. **Database Model** (`models.py` line 179)
   - Updated SQLAlchemy column definition

3. **API Schemas** (`schemas.py` lines 221, 239)
   - ProductBase: `base_cost: float = Field(gt=0, description="Base cost for product or service")`
   - ProductUpdate: `base_cost: Optional[float] = Field(None, gt=0)`

4. **Business Logic** (`main.py`)
   - Line 612: Product creation
   - Line 940: Stock valuation calculation (`base_cost * quantity`)
   - Line 1005: Profit calculation (`selling_price - base_cost`)
   - Lines 688-696: Product update endpoint (added eager loading for category_rel)

5. **Seed Data**
   - `seed_data.py`: 8 products updated
   - `seed_multi_tenant_data.py`: 17 products updated

### Frontend (2 files)

1. **TypeScript Interfaces** (`api.ts` lines 98, 115, 130)
   - Updated Product, ProductCreate, ProductUpdate interfaces

2. **Inventory UI** (`Inventory.tsx`)
   - 21 total changes:
     - Field names: `buying_price` → `base_cost`
     - Variable names: `buyingPrice` → `baseCost`
     - UI labels: "Buying Price" → "Base Cost"
     - Error messages updated

## Testing Results

All tests passed ✅

### Test Coverage

1. **Database Migration**
   - Column renamed successfully
   - No data loss
   - Old column removed

2. **Product Operations**
   - Create product with base_cost: ✓
   - Update product base_cost: ✓
   - Read products with base_cost: ✓

3. **Financial Calculations**
   - Stock valuation: ✓ (uses `sum(base_cost × quantity)`)
   - Profit calculation: ✓ (uses `selling_price - base_cost`)
   - Dashboard statistics: ✓

4. **Sales Processing**
   - Create sale: ✓
   - Sale includes base_cost for profit tracking: ✓

### Test Results

```
Product Created:
  - ID: 33
  - Base Cost: 250.00 ✓

Product Updated:
  - New Base Cost: 275.00 ✓

Stock Valuation:
  - Total: 1,504,550.00 ✓

Profit Calculation:
  - Total Profit: 198,600.00 ✓

Sale Created:
  - Profit per item: 125.00 (400.00 - 275.00) ✓
```

## Deployment

### Pre-Deployment
- ✅ Database backup taken
- ✅ Backend stopped

### Deployment Steps
1. ✅ Ran database migration
2. ✅ Updated backend code
3. ✅ Updated frontend code
4. ✅ Restarted backend server
5. ✅ Comprehensive testing

### Post-Deployment
- ✅ All API endpoints functional
- ✅ No breaking changes for end users
- ✅ Financial calculations accurate

## Rollback Procedure

If needed, rollback using:

```bash
cd /home/dmaangi/cdc-projects/apps/Chef/backend
source venv/bin/activate
python migrations/rename_buying_price_to_base_cost.py --rollback
```

Then revert code changes via git and restart services.

## Impact Assessment

### Breaking Changes
- ✅ API contract changed (field name in requests/responses)
- ✅ Coordinated backend + frontend deployment required

### No Impact
- ✅ Data integrity maintained
- ✅ Business logic unchanged (same calculations)
- ✅ User experience unchanged (just label changes)
- ✅ Performance unaffected

## Files Modified

### Backend
- `/backend/migrations/rename_buying_price_to_base_cost.py` (NEW)
- `/backend/models.py`
- `/backend/schemas.py`
- `/backend/main.py`
- `/backend/seed_data.py`
- `/backend/seed_multi_tenant_data.py`
- `/backend/test_base_cost_rename.py` (NEW - test script)

### Frontend
- `/frontend/src/lib/api.ts`
- `/frontend/src/pages/Inventory.tsx`

## Related Features

This change complements the service product feature (completed 2026-01-08) which added support for non-inventory items that don't require stock tracking.

## Notes

- The term "base cost" is more semantically accurate for both products and services
- All existing data was preserved during migration
- No downtime required for future deployments (migration is idempotent)
- Comprehensive test coverage ensures all financial calculations remain accurate
