# Subscription Verification Idempotency Fix

## Problem Identified

The `/api/subscription/verify/{reference}` endpoint was experiencing duplicate key constraint violations when users refreshed the verification page or the endpoint was called multiple times.

### Error Details
```
asyncpg.exceptions.UniqueViolationError: duplicate key value violates unique constraint "uq_transaction_tenant"
DETAIL:  Key (transaction_id, tenant_id)=(7, 1) already exists.
```

### Root Cause
The verification endpoint was **not idempotent**. When called multiple times for the same payment reference, it would:
1. Try to create duplicate `BranchSubscription` records
2. Violate the unique constraint `uq_transaction_tenant` on `(transaction_id, tenant_id)`
3. Cause the entire transaction to rollback with a 500 error

This happened because:
- Users could refresh the verification page
- Payment gateways might send multiple webhook notifications
- Network retries could trigger duplicate calls

## Solution Implemented

Made the `verify_payment` endpoint **idempotent** by implementing two key changes:

### 1. Early Return for Already-Verified Transactions
```python
# Check if already verified - return existing data (idempotent behavior)
if transaction.paystack_status == 'success':
    logger.info(f"🔄 Transaction {reference} already verified, returning cached result")
    return {
        "status": "success",
        "message": "Subscription already activated",
        "subscription_end_date": transaction.subscription_end_date,
        "amount_paid": transaction.amount
    }
```

**Benefits:**
- If a transaction is already successfully verified, return immediately
- No database writes attempted
- Fast response time
- Safe for multiple calls

### 2. Check Before Creating Branch Subscription Records
```python
# Check if historical record already exists (idempotent)
existing_branch_sub_result = await db.execute(
    select(BranchSubscription).where(
        BranchSubscription.transaction_id == transaction.id,
        BranchSubscription.tenant_id == branch_id
    )
)
existing_branch_sub = existing_branch_sub_result.scalar_one_or_none()

# Create historical record only if it doesn't exist (branch_subscriptions)
if not existing_branch_sub:
    branch_sub = BranchSubscription(
        transaction_id=transaction.id,
        tenant_id=branch_id,
        is_main_location=is_main
    )
    db.add(branch_sub)
else:
    logger.info(f"🔄 BranchSubscription already exists for transaction {transaction.id}, branch {branch_id}")
```

**Benefits:**
- Prevents duplicate `BranchSubscription` records
- Logs when a duplicate is detected
- Continues processing without error
- Safe to call multiple times

## Impact

### Before Fix
- ❌ 500 Internal Server Error on page refresh
- ❌ Poor user experience (users think payment failed)
- ❌ Database rollback on every duplicate verification attempt
- ❌ Potential data inconsistency

### After Fix
- ✅ Returns success immediately if already verified
- ✅ Users can safely refresh the verification page
- ✅ Network retries don't cause errors
- ✅ Idempotent behavior follows REST best practices
- ✅ Clean logging for debugging
- ✅ Maintains data integrity

## Testing Recommendations

Test the following scenarios:

1. **Normal Flow:**
   - Complete payment on Paystack
   - Verify payment → Should succeed

2. **Duplicate Verification:**
   - Complete payment on Paystack
   - Verify payment → Should succeed
   - **Refresh page** → Should return success with same data (no error)

3. **Multiple Rapid Calls:**
   - Complete payment on Paystack
   - Call verify endpoint multiple times in quick succession
   - All calls should succeed (first creates records, others return cached data)

4. **Partial State:**
   - Manually mark transaction as 'success' in database
   - Call verify endpoint
   - Should return immediately without attempting to create branch subscriptions

## Code Changes Summary

**File:** `backend/subscription_api.py`

**Function:** `verify_payment` (lines ~143-285)

**Changes:**
1. Moved transaction lookup to beginning of function
2. Added early return check for already-verified transactions
3. Added duplicate check before creating `BranchSubscription` records
4. Added informative logging for idempotent operations

## Related Files

- `backend/models.py` - Contains `BranchSubscription` model with `uq_transaction_tenant` constraint
- `backend/schemas.py` - Response schemas used by verification endpoint

## Deployment Notes

- No database migration required
- No breaking changes to API contract
- Fully backward compatible
- Can be deployed without downtime

## Monitoring

Look for these log messages:
- `🔄 Transaction {reference} already verified, returning cached result` - Early return triggered
- `🔄 BranchSubscription already exists for transaction {id}, branch {branch_id}` - Duplicate record detected
- `✅ Subscription activated for tenant {id} with {N} branches` - Successful activation

---

**Status:** ✅ **FIXED AND DEPLOYED**  
**Date:** January 20, 2026  
**Developer:** Claude (AI Assistant)
