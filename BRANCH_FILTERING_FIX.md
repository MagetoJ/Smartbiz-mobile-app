# Branch Filtering Fix - Dashboard Sales & Expenses

## Issue Summary
When filtering the dashboard by "Main Branch", no sales data was shown even though all sales transactions were made at the main branch. Additionally, expenses were not allocated to specific locations at all.

## Root Cause Analysis

### Problem 1: Sales with `branch_id = None`
When sales are created at the main location (not a branch), they are saved with `branch_id = None`. However, when filtering the dashboard by the main branch, the query was looking for `branch_id = main_tenant_id`, which doesn't match `None`.

**Example:**
- Sale made at main location: `branch_id = None`
- Filter by main branch (tenant_id = 1): Looking for `branch_id = 1`
- **Result**: No match! ❌

### Problem 2: Expenses Have No Branch Allocation
The `Expense` model in the database doesn't have a `branch_id` field at all. Expenses are only tracked by `tenant_id`, meaning they cannot be allocated to specific branches.

**Current Expense Model:**
```python
class Expense(Base):
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"))
    type = Column(String(100))
    amount = Column(Float)
    description = Column(Text)
    expense_date = Column(Date)
    # ❌ NO branch_id field!
```

## Solution Implemented

### Fix 1: Handle Main Location Sales (branch_id = None)
Updated the filtering logic in three dashboard endpoints to properly handle main location sales:

#### Endpoints Updated:
1. `/dashboard/stats` (Line ~3067-3074 & ~3095-3102)
2. `/reports/financial` (Line ~3157-3164)

**Before:**
```python
if filter_branch_id:
    query = query.where(Sale.branch_id == filter_branch_id)
```

**After:**
```python
if filter_branch_id:
    # FIXED: Handle main location (branch_id is None) vs actual branches
    if filter_branch_id == current_tenant.id:
        # Filtering by main location: include sales where branch_id is None OR equals main tenant
        query = query.where(or_(Sale.branch_id == None, Sale.branch_id == current_tenant.id))
    else:
        # Filtering by actual branch: exact match
        query = query.where(Sale.branch_id == filter_branch_id)
```

### Fix 2: Expense Filtering Limitation Documented
Since expenses don't have a `branch_id` field, we've documented this limitation:

**Updated Code (Line ~3230-3240):**
```python
# Total Expenses - FIXED: Expenses don't have branch_id, only tenant_id
# For now, show all tenant expenses when viewing main location
# In future, could add branch_id field to Expense model
expense_conditions = [
    Expense.tenant_id == current_tenant.id,  # Only main tenant expenses
    Expense.expense_date >= start_date_utc.date(),
    Expense.expense_date <= end_date_utc.date()
]
# Note: When viewing a branch, expenses still show from main tenant
# This is a limitation until Expense model gets branch_id field
```

## How It Works Now

### Main Location Filtering
When filtering by the main branch (tenant_id = 1):
```sql
-- OLD QUERY (❌ Returns nothing)
WHERE branch_id = 1

-- NEW QUERY (✅ Returns main location sales)
WHERE branch_id IS NULL OR branch_id = 1
```

### Branch Filtering  
When filtering by an actual branch (branch_id = 5):
```sql
-- Exact match (works as expected)
WHERE branch_id = 5
```

## Testing Verification

### Test Case 1: Main Branch Sales
**Scenario:** View dashboard filtered by "Main Branch"
- **Before:** 0 sales shown ❌
- **After:** All main location sales shown ✅

### Test Case 2: All Locations
**Scenario:** View dashboard with "All Locations" selected
- **Before:** Shows all sales (worked correctly) ✅
- **After:** Still shows all sales (unchanged) ✅

### Test Case 3: Specific Branch
**Scenario:** View dashboard filtered by a specific branch
- **Before:** Shows only that branch's sales ✅
- **After:** Still works correctly (unchanged) ✅

### Test Case 4: Expenses
**Scenario:** View expenses on dashboard
- **Before:** Always showed all tenant expenses regardless of filter ⚠️
- **After:** Still shows all tenant expenses (documented limitation) ⚠️
- **Note:** To fix this properly, need to add `branch_id` field to Expense model

## Future Enhancement: Branch-Allocated Expenses

To fully support branch-specific expense filtering, the Expense model should be updated:

### Proposed Database Migration:
```python
# Add branch_id to expenses table
ALTER TABLE expenses 
ADD COLUMN branch_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL;

# Add index for performance
CREATE INDEX idx_expenses_branch ON expenses(branch_id);
```

### Updated Expense Model:
```python
class Expense(Base):
    __tablename__ = "expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete='CASCADE'), nullable=False)
    branch_id = Column(Integer, ForeignKey("tenants.id", ondelete='SET NULL'), nullable=True)  # NEW
    type = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False)
    # ... rest of fields
```

### Updated Filtering Logic:
```python
# With branch_id field, expenses can be properly filtered:
if filter_branch_id:
    if filter_branch_id == current_tenant.id:
        # Main location: branch_id is None OR equals main tenant
        expense_conditions.append(or_(Expense.branch_id == None, Expense.branch_id == current_tenant.id))
    else:
        # Specific branch
        expense_conditions.append(Expense.branch_id == filter_branch_id)
```

## Files Modified
- `backend/main.py` - Dashboard and financial report endpoints

## Related Documentation
- `MULTI_TENANT_GUIDE.md` - Multi-tenant architecture overview
- `BRANCH_ASSIGNMENT_FIX.md` - Branch assignment system

## Date
January 29, 2026
