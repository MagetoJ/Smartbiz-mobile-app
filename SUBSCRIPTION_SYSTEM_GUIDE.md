# Subscription System Implementation Guide

## 📋 Overview

This guide covers the complete implementation of the subscription system with Paystack integration for the StatBricks platform.

**Pricing Structure:**
- **Monthly:** KES 2,000/month
- **6-Month:** KES 10,000 (Save KES 2,000!)
- **Annual:** KES 20,000 (Save KES 4,000!)
- **Trial Period:** 14 days free trial for all new signups

---

## ✅ Phase 1: Database Changes (COMPLETED)

### Files Created:
1. ✅ `backend/migrations/subscription_schema.sql` - Complete SQL migration
2. ✅ `backend/migrations/add_subscription_fields.py` - Python migration (optional)
3. ✅ `backend/migrations/create_subscription_transactions.py` - Transactions table

### Database Changes Made:

**Tenant Table (New Fields):**
```sql
- trial_ends_at (TIMESTAMP)
- subscription_status (VARCHAR) - 'trial', 'active', 'expired', 'cancelled'
- paystack_customer_code (VARCHAR)
- paystack_subscription_code (VARCHAR)
- paystack_plan_code (VARCHAR)
- last_payment_date (TIMESTAMP)
- next_billing_date (TIMESTAMP)
- payment_method (VARCHAR)
- billing_cycle (VARCHAR) - 'monthly', 'semi_annual', 'annual'
```

**New Table: subscription_transactions**
- Tracks all subscription payments
- Stores Paystack transaction details
- Records subscription periods

### To Run Migration:

```bash
# Option 1: Direct SQL (Recommended)
psql -U chef_user -d chef_db -f backend/migrations/subscription_schema.sql

# Option 2: Via setup script
./setup_database.sh
```

---

## ✅ Phase 2: Backend - Paystack Integration (COMPLETED)

### Files Created:

1. ✅ `backend/paystack_service.py`
   - PaystackService class
   - Transaction initialization
   - Payment verification
   - Webhook signature verification
   - Subscription date calculations

2. ✅ `backend/config.py` (Updated)
   - Added Paystack configuration
   - Added subscription settings

3. ✅ `backend/.env.template` (Updated)
   - Paystack keys template
   - Subscription settings

### Your Action Required:

Add your Paystack keys to `backend/.env`:

```bash
# Paystack Payment Configuration
PAYSTACK_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY
PAYSTACK_PUBLIC_KEY=pk_test_YOUR_ACTUAL_PUBLIC_KEY
PAYSTACK_WEBHOOK_SECRET=  # Optional

# Subscription Settings
TRIAL_PERIOD_DAYS=14
GRACE_PERIOD_DAYS=3
```

---

## 🚧 Phase 3: Backend - API Endpoints (TO DO)

### Need to Create: `backend/subscription_api.py`

This file will handle all subscription-related API endpoints.

```python
"""
Subscription API Endpoints
Handles payment initialization, verification, and subscription management
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from typing import Optional
import logging

from database import get_db
from models import Tenant, User, SubscriptionTransaction
from auth import get_current_user
from paystack_service import paystack_service, SUBSCRIPTION_PLANS
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/subscription", tags=["subscription"])


# 1. Initialize Payment
@router.post("/initialize")
async def initialize_payment(
    billing_cycle: str,  # 'monthly', 'semi_annual', 'annual'
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Initialize Paystack payment for subscription"""
    
    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get plan details
    plan = paystack_service.get_plan_details(billing_cycle)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid billing cycle")
    
    # Initialize payment
    callback_url = f"{settings.FRONTEND_URL}/subscription/verify"
    
    result = await paystack_service.initialize_transaction(
        email=tenant.owner_email,
        amount=plan['amount'],
        billing_cycle=billing_cycle,
        tenant_id=tenant.id,
        callback_url=callback_url
    )
    
    if result['status']:
        # Create pending transaction record
        transaction = SubscriptionTransaction(
            tenant_id=tenant.id,
            amount=paystack_service.format_amount_kes(plan['amount']),
            currency="KES",
            billing_cycle=billing_cycle,
            paystack_reference=result['reference'],
            paystack_status='pending',
            subscription_start_date=datetime.utcnow(),
            subscription_end_date=datetime.utcnow() + timedelta(days=plan['duration_days'])
        )
        db.add(transaction)
        await db.commit()
        
        logger.info(f"✅ Payment initialized for tenant {tenant.id}: {result['reference']}")
        
        return {
            "status": True,
            "authorization_url": result['authorization_url'],
            "reference": result['reference'],
            "amount": plan['amount'] / 100,  # Convert to KES
            "plan_name": plan['name']
        }
    else:
        raise HTTPException(status_code=400, detail=result.get('message', 'Payment initialization failed'))


# 2. Verify Payment
@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Verify payment and activate subscription"""
    
    # Verify with Paystack
    result = await paystack_service.verify_transaction(reference)
    
    if not result['status']:
        raise HTTPException(status_code=400, detail="Verification failed")
    
    transaction_data = result['data']
    
    if transaction_data['status'] != 'success':
        raise HTTPException(status_code=400, detail="Payment not successful")
    
    # Get transaction record
    db_result = await db.execute(
        select(SubscriptionTransaction).where(
            SubscriptionTransaction.paystack_reference == reference
        )
    )
    transaction = db_result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update transaction
    transaction.paystack_status = 'success'
    transaction.payment_date = datetime.utcnow()
    transaction.paystack_customer_code = transaction_data['customer'].get('customer_code')
    transaction.channel = transaction_data.get('channel')
    
    if transaction_data.get('authorization'):
        transaction.paystack_authorization_code = transaction_data['authorization'].get('authorization_code')
    
    # Update tenant subscription
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == transaction.tenant_id)
    )
    tenant = tenant_result.scalar_one()
    
    tenant.subscription_status = 'active'
    tenant.subscription_plan = 'PREMIUM'
    tenant.billing_cycle = transaction.billing_cycle
    tenant.last_payment_date = transaction.payment_date
    tenant.next_billing_date = transaction.subscription_end_date
    tenant.paystack_customer_code = transaction.paystack_customer_code
    tenant.payment_method = transaction_data.get('channel')
    
    await db.commit()
    
    logger.info(f"✅ Subscription activated for tenant {tenant.id}")
    
    return {
        "status": True,
        "message": "Subscription activated successfully!",
        "subscription_end_date": transaction.subscription_end_date.isoformat(),
        "plan": transaction.billing_cycle
    }


# 3. Get Subscription Status
@router.get("/status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current subscription status"""
    
    # Get user's tenant
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Calculate days remaining
    days_remaining = None
    if tenant.trial_ends_at and tenant.subscription_status == 'trial':
        days_remaining = (tenant.trial_ends_at - datetime.utcnow()).days
    elif tenant.next_billing_date and tenant.subscription_status == 'active':
        days_remaining = (tenant.next_billing_date - datetime.utcnow()).days
    
    return {
        "subscription_status": tenant.subscription_status,
        "subscription_plan": tenant.subscription_plan,
        "billing_cycle": tenant.billing_cycle,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "next_billing_date": tenant.next_billing_date.isoformat() if tenant.next_billing_date else None,
        "days_remaining": days_remaining,
        "is_trial": tenant.subscription_status == 'trial',
        "is_active": tenant.subscription_status in ['trial', 'active'],
        "payment_method": tenant.payment_method
    }


# 4. Get Payment History
@router.get("/history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment history for current tenant"""
    
    result = await db.execute(
        select(SubscriptionTransaction)
        .where(SubscriptionTransaction.tenant_id == current_user.tenants[0].id)
        .order_by(SubscriptionTransaction.created_at.desc())
    )
    transactions = result.scalars().all()
    
    return [
        {
            "id": t.id,
            "amount": t.amount,
            "currency": t.currency,
            "billing_cycle": t.billing_cycle,
            "status": t.paystack_status,
            "payment_date": t.payment_date.isoformat() if t.payment_date else None,
            "subscription_start_date": t.subscription_start_date.isoformat(),
            "subscription_end_date": t.subscription_end_date.isoformat(),
            "reference": t.paystack_reference
        }
        for t in transactions
    ]


# 5. Cancel Subscription
@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel subscription (will remain active until end of billing period)"""
    
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenants[0].id)
    )
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if tenant.subscription_status != 'active':
        raise HTTPException(status_code=400, detail="No active subscription to cancel")
    
    tenant.subscription_status = 'cancelled'
    await db.commit()
    
    logger.info(f"✅ Subscription cancelled for tenant {tenant.id}")
    
    return {
        "status": True,
        "message": "Subscription cancelled. Access will continue until end of billing period.",
        "access_until": tenant.next_billing_date.isoformat() if tenant.next_billing_date else None
    }


# 6. Get Available Plans
@router.get("/plans")
async def get_available_plans():
    """Get all available subscription plans"""
    
    return {
        "plans": [
            {
                "id": key,
                "name": plan['name'],
                "amount": plan['amount'] / 100,  # Convert to KES
                "amount_kobo": plan['amount'],
                "interval": plan['interval'],
                "duration_days": plan['duration_days'],
                "description": plan['description'],
                "savings": 0 if key == 'monthly' else (2000 if key == 'semi_annual' else 4000)
            }
            for key, plan in SUBSCRIPTION_PLANS.items()
        ],
        "currency": "KES",
        "trial_period_days": settings.TRIAL_PERIOD_DAYS
    }
```

---

## 🚧 Phase 4: Webhook Handler (TO DO)

### Add to `main.py`:

```python
# Webhook endpoint for Paystack
@app.post("/api/webhooks/paystack")
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Handle Paystack webhook events"""
    
    # Get raw body
    body = await request.body()
    
    # Verify signature
    if not paystack_service.verify_webhook_signature(body, x_paystack_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Parse event
    import json
    event = json.loads(body)
    
    event_type = event.get('event')
    data = event.get('data', {})
    
    logger.info(f"📨 Webhook received: {event_type}")
    
    if event_type == 'charge.success':
        # Handle successful payment
        reference = data.get('reference')
        
        # Find and update transaction
        result = await db.execute(
            select(SubscriptionTransaction).where(
                SubscriptionTransaction.paystack_reference == reference
            )
        )
        transaction = result.scalar_one_or_none()
        
        if transaction and transaction.paystack_status == 'pending':
            transaction.paystack_status = 'success'
            transaction.payment_date = datetime.utcnow()
            
            # Update tenant
            tenant_result = await db.execute(
                select(Tenant).where(Tenant.id == transaction.tenant_id)
            )
            tenant = tenant_result.scalar_one()
            tenant.subscription_status = 'active'
            tenant.last_payment_date = datetime.utcnow()
            
            await db.commit()
            logger.info(f"✅ Webhook processed: Subscription activated for tenant {tenant.id}")
    
    return {"status": "success"}
```

---

## 🚧 Phase 5: Subscription Middleware (TO DO)

### Create: `backend/subscription_middleware.py`

```python
"""
Subscription Middleware
Checks subscription status and blocks access if expired
"""

from fastapi import Request, HTTPException
from datetime import datetime
from sqlalchemy import select
from database import get_db
from models import Tenant
import logging

logger = logging.getLogger(__name__)

EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/subscription',
    '/api/webhooks',
    '/docs',
    '/openapi.json'
]

async def check_subscription_status(request: Request, call_next):
    """Check if tenant's subscription is active"""
    
    # Skip check for exempt paths
    if any(request.url.path.startswith(path) for path in EXEMPT_PATHS):
        return await call_next(request)
    
    # Get tenant from request (assuming you have tenant context)
    # This depends on your authentication setup
    
    response = await call_next(request)
    return response
```

---

## 🚧 Phase 6: Frontend Implementation (TO DO)

### Files to Create:

#### 1. `frontend/src/pages/Subscription.tsx` - Pricing Page

```typescript
// Beautiful pricing page with 3 plan cards
// Shows monthly, 6-month, and annual options
// Highlights savings on longer plans
// Integrates Paystack popup for payment
```

#### 2. `frontend/src/components/SubscriptionBanner.tsx` - Status Banner

```typescript
// Shows trial expiry warning
// Shows subscription status
// Link to upgrade page
```

#### 3. `frontend/src/pages/SubscriptionManagement.tsx` - Manage Subscription

```typescript
// Current plan details
// Payment history
// Cancel subscription option
```

---

## 📝 Testing Checklist

### Payment Flow:
- [ ] Initialize payment with monthly plan
- [ ] Initialize payment with 6-month plan
- [ ] Initialize payment with annual plan
- [ ] Verify payment success
- [ ] Check subscription activation
- [ ] Verify transaction record created

### Trial Period:
- [ ] New signup gets 14-day trial
- [ ] Trial expiry warning shows 7 days before
- [ ] Access blocked after trial expires
- [ ] Billing page remains accessible

### Webhook:
- [ ] Paystack webhook signature verification
- [ ] Successful payment webhook processing
- [ ] Failed payment webhook handling

---

## 🚀 Deployment Steps

1. **Run database migration**
   ```bash
   psql -U chef_user -d chef_db -f backend/migrations/subscription_schema.sql
   ```

2. **Add Paystack keys to production .env**

3. **Set up Paystack webhook**
   - URL: `https://your-domain.com/api/webhooks/paystack`
   - Get webhook secret from Paystack dashboard

4. **Test with Paystack test keys first**

5. **Switch to live keys for production**

---

## 📚 Resources

- **Paystack API Docs:** https://paystack.com/docs/api
- **Paystack Dashboard:** https://dashboard.paystack.com
- **Test Cards:** https://paystack.com/docs/payments/test-payments

---

## ✅ Summary of Completed Work

**Database:**
- ✅ Subscription fields added to tenants table
- ✅ SubscriptionTransaction model created
- ✅ Migration scripts ready

**Backend:**
- ✅ Paystack service implemented
- ✅ Configuration updated
- ✅ Payment initialization ready
- ✅ Transaction verification ready
- ✅ Webhook signature verification ready

**Remaining:**
- ⏳ API endpoints (subscribe, verify, status, history, cancel)
- ⏳ Webhook handler integration
- ⏳ Subscription middleware
- ⏳ Frontend pricing page
- ⏳ Frontend subscription banner
- ⏳ Frontend subscription management
- ⏳ Testing and deployment

---

## 💡 Next Steps

1. **Add your Paystack keys** to `backend/.env`
2. **Run the database migration** (subscription_schema.sql)
3. **Create subscription API endpoints** (subscription_api.py)
4. **Integrate endpoints** in main.py
5. **Build frontend pricing page**
6. **Test complete flow** with test keys
7. **Deploy to production**

The foundation is solid - the core payment service and database structure are complete!
