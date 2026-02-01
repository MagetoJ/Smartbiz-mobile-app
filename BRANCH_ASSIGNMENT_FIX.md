# Branch Assignment Sale Recording Fix

## Issue Description

When an administrator assigned a user to a different branch, sales made by that user were still being recorded under the **old branch** instead of the newly assigned branch. This happened even though the database was correctly updated with the new branch assignment.

## Root Cause

The issue was caused by **stale JWT tokens**. Here's what was happening:

1. **User logs in** → JWT token is created containing `branch_id` from the database
2. **Admin updates user's branch** → Database is correctly updated ✅
3. **User makes a sale** → System uses the **old** `branch_id` from the JWT token ❌
4. **Sale recorded with wrong branch!** 

The JWT token is cached in the frontend and remains valid for 8 hours. The `create_sale` function was extracting `branch_id` directly from the JWT token via the `get_current_branch_id()` dependency, which meant it was using stale data.

### Code Location
**File:** `backend/main.py`  
**Function:** `create_sale()` (line ~2250)

**Before (Problematic Code):**
```python
# Determine sale's branch using JWT token (may be stale!)
sale_branch_id = current_tenant.id if is_branch_mode else current_branch_id
```

Where `current_branch_id` came from:
```python
current_branch_id: Optional[int] = Depends(get_current_branch_id)  # From JWT!
```

## Solution

Modified the `create_sale` function to **query the database** for the user's current branch assignment instead of relying on the JWT token.

### Updated Code

```python
# Determine sale's branch:
# - If current tenant is a branch, use its ID
# - Otherwise, query database for user's CURRENT branch assignment (not JWT which may be stale)
if is_branch_mode:
    sale_branch_id = current_tenant.id
else:
    # Query database for user's current branch assignment
    result = await db.execute(
        select(tenant_users.c.branch_id)
        .where(
            tenant_users.c.tenant_id == current_tenant.id,
            tenant_users.c.user_id == current_user.id,
            tenant_users.c.is_active == True
        )
    )
    db_branch_id = result.scalar_one_or_none()
    sale_branch_id = db_branch_id  # Use database value, not JWT
```

## Benefits

1. ✅ **Immediate effect**: Branch assignment changes take effect immediately for sales
2. ✅ **No user action required**: Users don't need to log out and back in
3. ✅ **Accurate reporting**: Sales are always recorded to the correct branch
4. ✅ **Minimal performance impact**: Single database query per sale (negligible)

## Alternative Solutions Considered

### Option 1: Force Re-login ❌
- Display message: "User must log out and back in for changes to take effect"
- **Rejected**: Inconvenient for users, requires manual intervention

### Option 3: Token Refresh Mechanism ❌
- Implement real-time token refresh when assignments change
- **Rejected**: Complex to implement, requires significant infrastructure changes

### Option 2: Database Lookup ✅ (CHOSEN)
- Query database for current assignment during sale creation
- **Selected**: Most reliable, minimal code changes, immediate effect

## Testing Recommendations

1. **Test branch assignment change**:
   - Assign user to Branch A
   - User makes a sale → Verify sale.branch_id = Branch A
   - Admin changes user to Branch B (user stays logged in)
   - User makes another sale → Verify sale.branch_id = Branch B ✅

2. **Test unassigned users**:
   - Unassign user from all branches
   - User makes a sale → Verify sale.branch_id = NULL (main location)

3. **Test branch mode**:
   - User logs in directly as a branch
   - Makes a sale → Verify sale.branch_id = current branch

## Related Files

- `backend/main.py` - Main fix location
- `backend/auth.py` - Contains `get_current_branch_id()` (still used for other purposes)
- `backend/models.py` - `tenant_users` table schema with `branch_id` column
- `frontend/src/pages/Users.tsx` - User management UI (no changes needed)

## Migration Notes

**No database migration required** - this is a code-only fix that resolves a logic issue.

## Impact Assessment

- **Breaking changes**: None
- **Backward compatibility**: Fully maintained
- **Performance**: Single additional query per sale (negligible)
- **User experience**: Improved - changes take effect immediately

---

**Fixed:** January 25, 2026  
**Developer:** Assistant  
**Issue Type:** Bug Fix  
**Priority:** High (Data Integrity)
