# Dashboard Permission Fix

## Issue
Dashboard and Reports were showing 403 Forbidden errors in production despite user having sales data.

### Error Logs
```
2026-01-25 11:29:36 INFO: "GET /dashboard/stats HTTP/1.1" 403 Forbidden
2026-01-25 11:29:36 INFO: "GET /reports/financial?days=90 HTTP/1.1" 403 Forbidden
```

## Root Cause
The `get_user_role_type()` function in `backend/auth.py` was incorrectly classifying admin users as "staff" when they had:
- `role = "admin"`
- `is_owner = NULL or False`  
- `branch_id = NULL`

This meant they were getting "staff" role type, which only has `MANAGE_POS` and `VIEW_SALES_HISTORY` permissions - **NO dashboard/reports access**.

## Solution
Modified `backend/auth.py` line 334-356 to treat admins without branch assignment as "owner":

### Before
```python
# Owner: admin with is_owner=True
if role == "admin" and is_owner:
    return "owner"
# Branch Admin: admin with branch_id assigned
elif role == "admin" and branch_id:
    return "branch_admin"
# Staff: everyone else
else:
    return "staff"
```

### After
```python
# Owner: admin with is_owner=True OR admin without branch assignment
if role == "admin" and (is_owner or not branch_id):
    return "owner"
# Branch Admin: admin with branch_id assigned (but not marked as owner)
elif role == "admin" and branch_id:
    return "branch_admin"
# Staff: everyone else
else:
    return "staff"
```

## Role Type Permissions

### Owner (Full Access)
- ✅ VIEW_DASHBOARD
- ✅ VIEW_REPORTS  
- ✅ MANAGE_POS
- ✅ VIEW_SALES_HISTORY
- ✅ MANAGE_INVENTORY
- ✅ MANAGE_USERS
- ✅ MANAGE_SETTINGS
- ✅ MANAGE_BRANCHES

### Branch Admin (Branch-Scoped)
- ✅ VIEW_DASHBOARD (filtered to branch)
- ✅ VIEW_REPORTS (filtered to branch)
- ✅ MANAGE_POS
- ✅ VIEW_SALES_HISTORY
- ✅ MANAGE_INVENTORY
- ✅ MANAGE_USERS

### Staff (Limited)
- ✅ MANAGE_POS
- ✅ VIEW_SALES_HISTORY
- ❌ NO dashboard access
- ❌ NO reports access

## Result
- **Owners** now see full tenant-wide data
- **Branch Admins** see data filtered to their branch
- **Staff** continue to have limited access (POS and their sales only)

## Deployment
No database migration required - this is a code-only fix. The backend will need to be restarted to apply the changes.

---
**Fixed:** 2026-01-25  
**File:** `backend/auth.py`  
**Function:** `get_user_role_type()`
