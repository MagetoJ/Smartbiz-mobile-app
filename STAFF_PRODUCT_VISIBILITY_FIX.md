# Staff Product Visibility Fix

## Issue
Staff users assigned to branches could not see products in the inventory/POS system.

## Root Cause
In `backend/main.py`, the `get_products` endpoint was missing proper validation for staff users with branch assignments. When a staff user had a `current_branch_id` in their JWT token, the code attempted to fetch the branch but didn't validate:
1. Whether the branch actually exists
2. Whether the branch belongs to the correct parent tenant

If the branch didn't exist or validation failed, the code would silently fall through to other logic paths, resulting in empty product lists for staff users.

## Solution Implemented
Added explicit branch validation in the `get_products` endpoint (line ~1340 in `backend/main.py`):

```python
elif current_branch_id:
    # Validate that the assigned branch exists and belongs to this parent
    result = await db.execute(
        select(Tenant).where(
            Tenant.id == current_branch_id,
            Tenant.parent_tenant_id == current_tenant.id
        )
    )
    target_branch = result.scalar_one_or_none()
    if not target_branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Your assigned branch (ID: {current_branch_id}) not found. Please contact your administrator."
        )
```

## Changes Made
1. **Branch Validation**: Added database query to verify the assigned branch exists and belongs to the parent tenant
2. **Error Handling**: Added explicit HTTPException with helpful error message if validation fails
3. **User Feedback**: Error message instructs users to contact their administrator if their branch assignment is invalid

## Testing Recommendations
1. Test with staff user assigned to valid branch - should see products
2. Test with staff user assigned to deleted/invalid branch - should see helpful error
3. Test with admin users - should work as before
4. Test with unassigned staff - should see appropriate access control

## Files Modified
- `backend/main.py` (lines ~1330-1348)

## Related Documentation
- `RBAC_SYSTEM.md` - Role-based access control
- `BRANCH_ASSIGNMENT_FIX.md` - Branch assignment system

## Update: Auto-Switch Error Fixed

### Additional Issue
After the initial fix, an error occurred during auto-switch to branch functionality. The validation added was too strict and would fail during tenant switching, causing "Internal server error".

### Solution
Modified the validation to be more graceful:
- Instead of throwing HTTP 404 error when branch doesn't exist
- Log a warning and fall back to parent inventory
- This handles cases where:
  - Tenant switch is in progress
  - Branch assignment is stale
  - Branch has been deleted but user still has assignment

### Code Change
```python
# If branch doesn't exist, log warning but don't fail
if not target_branch:
    logger.warning(
        f"Branch assignment mismatch: user assigned to branch {current_branch_id} "
        f"but it doesn't exist or doesn't belong to tenant {current_tenant.id}. "
        f"Falling back to parent inventory."
    )
    # Fall through to default query (parent inventory)
    view_target_id = None
```

## Date
January 25, 2026
