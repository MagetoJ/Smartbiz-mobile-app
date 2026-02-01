# Price Variance Report Fix

## Issue
The Price Variance report under Reports tab was **not showing data correctly** because the backend was counting **sale items instead of sales**.

### The Problem
When a sale had multiple items (e.g., 3 products in one transaction), the system would count it as:
- ❌ 3 sales total
- ❌ Inflated percentages
- ❌ Meaningless override rates

**Example:**
```
Sale #100: 3 items (2 with custom price, 1 standard price)

OLD LOGIC (Incorrect):
- Total Sales: 3 ❌
- Overridden Sales: 2 ❌
- Override Rate: 66.7% ❌

NEW LOGIC (Correct):
- Total Sales: 1 ✅
- Overridden Sales: 1 ✅ (sale had at least one override)
- Override Rate: 100% ✅
```

## Solution Implemented

### Backend Changes (`backend/main.py` - `get_price_variance_report`)

#### 1. **Sale-Level Tracking**
```python
# NEW: Track unique sales per dimension
product_sale_ids = {}  # product_id -> set of sale_ids
staff_sale_ids = {}    # user_id -> set of sale_ids
branch_sale_ids = {}   # branch_id -> set of sale_ids
```

#### 2. **Aggregation Per Sale**
```python
for sale in sales:
    sale_has_override = False
    sale_variance = 0.0
    
    for item in sale.sale_items:
        # Check each item
        if is_override:
            sale_has_override = True
            sale_variance += variance
    
    # Count sale once after checking all items
    if sale_has_override:
        overridden_sales += 1
        total_variance += sale_variance
```

#### 3. **Unique Sale Counting**
```python
# Products: Count how many unique sales included this product
total_sales_count = len(product_sale_ids.get(pid, set()))
overridden_sales_count = len(stats['override_prices'])

# Staff: Count unique sales per staff member
total_staff_sales = len(staff_sale_ids.get(uid, set()))

# Branch: Count unique sales per branch
total_branch_sales = len(branch_sale_ids.get(bid, set()))
```

## What This Means

### For Product Analysis
- **Total Sales Count**: How many unique transactions included this product
- **Overridden Sales Count**: How many transactions had custom pricing for this product
- **Variance**: Total revenue lost/gained from price overrides
- **Override Rate**: Percentage of transactions with custom pricing

### For Staff Analysis
- **Total Sales**: Actual transaction count per staff member
- **Overridden Sales**: Transactions where staff gave custom pricing
- **Override Rate**: % of transactions with discounts/markups
- **Variance**: Total revenue impact from price changes

### For Branch Analysis
- **Total Sales**: Transaction count per branch
- **Overridden Sales**: Transactions with custom pricing
- **Override Rate**: Discount frequency per branch

## Example Output

### Before (Incorrect):
```
Product: Laptop Bag
- Total Sales: 45 (includes multi-item sales)
- Overridden: 30
- Override Rate: 66.7%
- Variance: -KES 15,000
```

### After (Correct):
```
Product: Laptop Bag
- Total Sales: 15 (unique transactions)
- Overridden: 10 (transactions with custom price)
- Override Rate: 66.7%
- Variance: -KES 15,000
```

## Technical Details

### Data Structures
```python
# Tracking sets prevent double-counting
product_sale_ids[product_id] = {sale_id_1, sale_id_2, ...}
staff_sale_ids[user_id] = {sale_id_1, sale_id_2, ...}
branch_sale_ids[branch_id] = {sale_id_1, sale_id_2, ...}

# Unique count
total_sales = len(product_sale_ids[product_id])
```

### Logic Flow
1. **Iterate sales** (not items)
2. **Check each item** in sale for price override
3. **Mark sale as overridden** if ANY item has custom price
4. **Aggregate variance** across all items in sale
5. **Track sale ID** in appropriate sets (product/staff/branch)
6. **Count unique sales** using set length

## Benefits

✅ **Accurate Counts** - Transaction-based metrics  
✅ **Meaningful Percentages** - Correct override rates  
✅ **Proper Variance** - Total revenue impact accurate  
✅ **Staff Insights** - Who gives discounts most often  
✅ **Product Insights** - Which products get discounted  
✅ **Branch Comparison** - Pricing patterns by location  

## Areas Affected

### ✅ Updated:
- Backend price variance endpoint (`backend/main.py` line 3246+)

### ℹ️ No Changes Needed:
- Frontend Reports.tsx (was already correct)
- API calls (api.ts was already correct)
- Schema definitions (already correct)

---

**Implementation Date**: January 25, 2026  
**Issue**: Counting items instead of sales  
**Status**: ✅ Fixed
