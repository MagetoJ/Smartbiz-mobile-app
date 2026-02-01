"""
Paystack Payment Service
Handles subscription payments via Paystack API
"""

import httpx
import hmac
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from config import settings

logger = logging.getLogger(__name__)


# Subscription Plan Configuration
# Base price: KES 2,000/month (monthly)
# Monthly equivalent pricing:
#   - Monthly: KES 2,000/month (no discount)
#   - Quarterly (3 months): KES 1,800/month = KES 5,400 total (save KES 600)
#   - Semi-annual (6 months): KES 1,620/month = KES 9,720 total (save KES 2,280)
#   - Annual (12 months): KES 1,530/month = KES 18,360 total (save KES 5,640)
SUBSCRIPTION_PLANS = {
    'monthly': {
        'name': 'Monthly',
        'amount': 200000,  # KES 2,000 in kobo (Paystack uses kobo: 100 kobo = 1 KES)
        'interval': 'monthly',
        'duration_days': 30,
        'monthly_equivalent': 2000,
        'description': 'Flexible monthly billing'
    },
    'quarterly': {
        'name': '3-Month',
        'amount': 540000,  # KES 5,400 in kobo
        'interval': 'quarterly',
        'duration_days': 90,
        'monthly_equivalent': 1800,
        'description': 'Save KES 600 vs monthly'
    },
    'semi_annual': {
        'name': '6-Month',
        'amount': 972000,  # KES 9,720 in kobo
        'interval': 'semiannually',
        'duration_days': 180,
        'monthly_equivalent': 1620,
        'description': 'Save KES 2,280 vs monthly'
    },
    'annual': {
        'name': 'Annual',
        'amount': 1836000,  # KES 18,360 in kobo
        'interval': 'annually',
        'duration_days': 365,
        'monthly_equivalent': 1530,
        'description': 'Save KES 5,640 vs monthly'
    }
}


class PaystackService:
    """Service for Paystack payment operations"""

    def __init__(self):
        self.secret_key = settings.PAYSTACK_SECRET_KEY
        self.public_key = settings.PAYSTACK_PUBLIC_KEY
        self.base_url = "https://api.paystack.co"
        self.headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json"
        }

    def is_configured(self) -> bool:
        """Check if Paystack keys are configured"""
        return bool(self.secret_key and self.public_key)

    def get_configuration_status(self) -> Dict[str, Any]:
        """
        Get detailed Paystack configuration status without exposing actual keys.
        Useful for admin diagnostics.
        """
        secret_key = self.secret_key or ""
        public_key = self.public_key or ""

        # Determine key type (test vs live)
        secret_is_test = secret_key.startswith("sk_test_")
        secret_is_live = secret_key.startswith("sk_live_")
        public_is_test = public_key.startswith("pk_test_")
        public_is_live = public_key.startswith("pk_live_")

        # Check for common misconfigurations
        issues = []

        if not secret_key:
            issues.append("PAYSTACK_SECRET_KEY is not set")
        elif not (secret_is_test or secret_is_live):
            issues.append("PAYSTACK_SECRET_KEY has invalid format (should start with sk_test_ or sk_live_)")
        elif secret_key.startswith("pk_"):
            issues.append("PAYSTACK_SECRET_KEY appears to be a public key (starts with pk_)")

        if not public_key:
            issues.append("PAYSTACK_PUBLIC_KEY is not set")
        elif not (public_is_test or public_is_live):
            issues.append("PAYSTACK_PUBLIC_KEY has invalid format (should start with pk_test_ or pk_live_)")
        elif public_key.startswith("sk_"):
            issues.append("PAYSTACK_PUBLIC_KEY appears to be a secret key (starts with sk_)")

        # Check mode mismatch
        if secret_key and public_key:
            if secret_is_test and public_is_live:
                issues.append("Mode mismatch: secret key is TEST but public key is LIVE")
            elif secret_is_live and public_is_test:
                issues.append("Mode mismatch: secret key is LIVE but public key is TEST")

        # Check for whitespace issues
        if secret_key != secret_key.strip():
            issues.append("PAYSTACK_SECRET_KEY has leading/trailing whitespace")
        if public_key != public_key.strip():
            issues.append("PAYSTACK_PUBLIC_KEY has leading/trailing whitespace")

        # Determine mode
        mode = "unknown"
        if secret_is_test or public_is_test:
            mode = "test"
        elif secret_is_live or public_is_live:
            mode = "live"

        return {
            "is_configured": self.is_configured(),
            "secret_key_set": bool(secret_key),
            "public_key_set": bool(public_key),
            "secret_key_preview": f"{secret_key[:12]}..." if len(secret_key) > 12 else "not_set",
            "public_key_preview": f"{public_key[:12]}..." if len(public_key) > 12 else "not_set",
            "mode": mode,
            "issues": issues,
            "has_issues": len(issues) > 0
        }

    async def verify_credentials(self) -> Dict[str, Any]:
        """
        Test API connection with current credentials.
        Makes a simple API call to verify the secret key is valid.
        """
        if not self.is_configured():
            return {
                "status": False,
                "message": "Paystack keys are not configured"
            }

        try:
            async with httpx.AsyncClient() as client:
                # Use the balance endpoint as a simple API test
                response = await client.get(
                    f"{self.base_url}/balance",
                    headers=self.headers,
                    timeout=10.0
                )

                if response.status_code == 200:
                    return {
                        "status": True,
                        "message": "Paystack credentials are valid"
                    }
                elif response.status_code == 401:
                    return {
                        "status": False,
                        "message": "Invalid API key - authentication failed"
                    }
                else:
                    data = response.json()
                    return {
                        "status": False,
                        "message": data.get("message", f"API error: {response.status_code}")
                    }

        except httpx.TimeoutException:
            return {
                "status": False,
                "message": "Connection timeout - unable to reach Paystack API"
            }
        except Exception as e:
            return {
                "status": False,
                "message": f"Connection error: {str(e)}"
            }
    
    async def initialize_transaction(
        self,
        email: str,
        amount: int,  # Amount in kobo
        billing_cycle: str,
        tenant_id: int,
        callback_url: str
    ) -> Dict[str, Any]:
        """
        Initialize a payment transaction
        
        Args:
            email: Customer email
            amount: Amount in kobo (100 kobo = 1 KES)
            billing_cycle: 'monthly', 'semi_annual', or 'annual'
            tenant_id: Tenant ID
            callback_url: URL to redirect after payment
        
        Returns:
            Dictionary with authorization_url and reference
        """
        # Check if Paystack is configured before attempting payment
        if not self.is_configured():
            logger.error("❌ Payment initialization failed: Paystack keys not configured")
            return {
                "status": False,
                "message": "Payment service is not configured. Please contact support."
            }

        try:
            plan = SUBSCRIPTION_PLANS.get(billing_cycle)
            if not plan:
                raise ValueError(f"Invalid billing cycle: {billing_cycle}")
            
            # Generate unique reference
            reference = f"SUB_{tenant_id}_{int(datetime.utcnow().timestamp())}"
            
            payload = {
                "email": email,
                "amount": amount,
                "currency": "KES",
                "reference": reference,
                "callback_url": callback_url,
                "channels": ["card", "mobile_money", "bank"],  # Enable Card, M-Pesa & Bank payments
                "metadata": {
                    "tenant_id": tenant_id,
                    "billing_cycle": billing_cycle,
                    "plan_name": plan['name'],
                    "custom_fields": [
                        {
                            "display_name": "Tenant ID",
                            "variable_name": "tenant_id",
                            "value": tenant_id
                        },
                        {
                            "display_name": "Billing Cycle",
                            "variable_name": "billing_cycle",
                            "value": billing_cycle
                        }
                    ]
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/transaction/initialize",
                    json=payload,
                    headers=self.headers,
                    timeout=30.0
                )
                
                response.raise_for_status()
                data = response.json()
                
                if data.get('status'):
                    logger.info(f"✅ Payment initialized for tenant {tenant_id}: {reference}")
                    return {
                        "status": True,
                        "authorization_url": data['data']['authorization_url'],
                        "access_code": data['data']['access_code'],
                        "reference": data['data']['reference']
                    }
                else:
                    logger.error(f"❌ Payment initialization failed: {data.get('message')}")
                    return {"status": False, "message": data.get('message')}
        
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Paystack API error: {e.response.text}")
            # Provide user-friendly error messages based on status code
            if e.response.status_code == 401:
                return {
                    "status": False,
                    "message": "Payment service configuration error. Please contact support."
                }
            elif e.response.status_code == 400:
                try:
                    error_data = e.response.json()
                    return {
                        "status": False,
                        "message": error_data.get("message", "Invalid payment request")
                    }
                except Exception:
                    return {"status": False, "message": "Invalid payment request"}
            else:
                return {"status": False, "message": "Payment service temporarily unavailable"}
        except Exception as e:
            logger.error(f"❌ Error initializing payment: {str(e)}")
            return {"status": False, "message": "Payment initialization failed. Please try again."}
    
    async def verify_transaction(self, reference: str) -> Dict[str, Any]:
        """
        Verify a transaction
        
        Args:
            reference: Transaction reference
        
        Returns:
            Dictionary with transaction details
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/transaction/verify/{reference}",
                    headers=self.headers,
                    timeout=30.0
                )
                
                response.raise_for_status()
                data = response.json()
                
                if data.get('status'):
                    transaction_data = data['data']
                    logger.info(f"✅ Transaction verified: {reference} - Status: {transaction_data.get('status')}")
                    
                    return {
                        "status": True,
                        "data": {
                            "reference": transaction_data.get('reference'),
                            "amount": transaction_data.get('amount'),
                            "currency": transaction_data.get('currency'),
                            "status": transaction_data.get('status'),
                            "paid_at": transaction_data.get('paid_at'),
                            "customer": transaction_data.get('customer'),
                            "metadata": transaction_data.get('metadata'),
                            "channel": transaction_data.get('channel'),
                            "authorization": transaction_data.get('authorization')
                        }
                    }
                else:
                    return {"status": False, "message": data.get('message')}
        
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Verification error: {e.response.text}")
            return {"status": False, "message": "Verification failed"}
        except Exception as e:
            logger.error(f"❌ Error verifying transaction: {str(e)}")
            return {"status": False, "message": str(e)}
    
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Verify Paystack webhook signature
        
        Args:
            payload: Request body as bytes
            signature: X-Paystack-Signature header value
        
        Returns:
            True if signature is valid, False otherwise
        """
        try:
            computed_signature = hmac.new(
                self.secret_key.encode('utf-8'),
                payload,
                hashlib.sha512
            ).hexdigest()
            
            is_valid = hmac.compare_digest(computed_signature, signature)
            
            if is_valid:
                logger.info("✅ Webhook signature verified")
            else:
                logger.warning("❌ Invalid webhook signature")
            
            return is_valid
        
        except Exception as e:
            logger.error(f"❌ Error verifying signature: {str(e)}")
            return False
    
    def calculate_subscription_dates(self, billing_cycle: str) -> Dict[str, datetime]:
        """
        Calculate subscription start and end dates
        
        Args:
            billing_cycle: 'monthly', 'semi_annual', or 'annual'
        
        Returns:
            Dictionary with start_date and end_date
        """
        plan = SUBSCRIPTION_PLANS.get(billing_cycle)
        if not plan:
            raise ValueError(f"Invalid billing cycle: {billing_cycle}")
        
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=plan['duration_days'])
        
        return {
            "start_date": start_date,
            "end_date": end_date,
            "duration_days": plan['duration_days']
        }
    
    def get_plan_details(self, billing_cycle: str) -> Optional[Dict[str, Any]]:
        """Get subscription plan details"""
        return SUBSCRIPTION_PLANS.get(billing_cycle)
    
    def format_amount_kes(self, amount_kobo: int) -> float:
        """Convert kobo to KES"""
        return amount_kobo / 100
    
    def calculate_total_with_branches(self, billing_cycle: str, num_branches: int = 0) -> Dict[str, Any]:
        """
        Calculate total subscription cost including branches

        Main business: Full price
        Each branch: 80% discount (20% of main price)

        Args:
            billing_cycle: 'monthly', 'semi_annual', or 'annual'
            num_branches: Number of branches

        Returns:
            Dictionary with pricing breakdown
        """
        plan = SUBSCRIPTION_PLANS.get(billing_cycle)
        if not plan:
            raise ValueError(f"Invalid billing cycle: {billing_cycle}")

        base_price = plan['amount']  # In kobo
        branch_price = int(base_price * 0.8)  # 20% discount = 80% of base price

        total_branches_cost = branch_price * num_branches
        total_amount = base_price + total_branches_cost

        return {
            "base_price_kobo": base_price,
            "base_price_kes": base_price / 100,
            "branch_price_kobo": branch_price,
            "branch_price_kes": branch_price / 100,
            "num_branches": num_branches,
            "branches_total_kobo": total_branches_cost,
            "branches_total_kes": total_branches_cost / 100,
            "total_amount_kobo": total_amount,
            "total_amount_kes": total_amount / 100,
            "billing_cycle": billing_cycle,
            "plan_name": plan['name']
        }

    def calculate_total_for_selected_branches(
        self,
        billing_cycle: str,
        selected_branch_ids: list,
        branches_data: list
    ) -> Dict[str, Any]:
        """
        Calculate total subscription cost for specific selected branches.

        Main location: Full price (KES 2,000 for monthly)
        Each branch: 80% of main price (KES 1,600 for monthly)

        Args:
            billing_cycle: 'monthly', 'semi_annual', or 'annual'
            selected_branch_ids: List of tenant IDs to include
            branches_data: List of dicts with branch info [{"id": int, "name": str, "is_main": bool}]

        Returns:
            Dictionary with detailed pricing breakdown
        """
        plan = SUBSCRIPTION_PLANS.get(billing_cycle)
        if not plan:
            raise ValueError(f"Invalid billing cycle: {billing_cycle}")

        base_price = plan['amount']  # Main location price in kobo
        branch_price = int(base_price * 0.8)  # Branch price (80% of main)

        # Identify main location and branches from selected IDs
        main_location = None
        selected_branches = []

        for branch in branches_data:
            if branch['id'] in selected_branch_ids:
                if branch.get('is_main', False):
                    main_location = {
                        "tenant_id": branch['id'],
                        "name": branch['name'],
                        "price_kobo": base_price,
                        "price_kes": base_price / 100
                    }
                else:
                    selected_branches.append({
                        "tenant_id": branch['id'],
                        "name": branch['name'],
                        "price_kobo": branch_price,
                        "price_kes": branch_price / 100
                    })

        if not main_location:
            raise ValueError("Main location must be included in subscription")

        # Calculate totals
        branches_total_kobo = len(selected_branches) * branch_price
        total_amount_kobo = base_price + branches_total_kobo

        return {
            "main_location": main_location,
            "branches": selected_branches,
            "num_branches": len(selected_branches),
            "branches_total_kobo": branches_total_kobo,
            "branches_total_kes": branches_total_kobo / 100,
            "total_amount_kobo": total_amount_kobo,
            "total_amount_kes": total_amount_kobo / 100,
            "billing_cycle": billing_cycle,
            "plan_name": plan['name']
        }

    def calculate_prorata_price(
        self,
        billing_cycle: str,
        days_remaining: int
    ) -> Dict[str, Any]:
        """
        Calculate pro-rated price for adding a branch mid-subscription.

        Used when a new branch is added to an existing active subscription.
        Price is proportional to the remaining days in the current cycle.

        Args:
            billing_cycle: 'monthly', 'semi_annual', or 'annual'
            days_remaining: Number of days left in current subscription period

        Returns:
            Dictionary with pro-rata pricing details
        """
        plan = SUBSCRIPTION_PLANS.get(billing_cycle)
        if not plan:
            raise ValueError(f"Invalid billing cycle: {billing_cycle}")

        base_price = plan['amount']
        branch_price = int(base_price * 0.8)  # Branch price (80% of main)
        total_days = plan['duration_days']

        # Calculate pro-rata amount
        prorata_multiplier = days_remaining / total_days
        prorata_amount_kobo = int(branch_price * prorata_multiplier)

        return {
            "full_price_kobo": branch_price,
            "full_price_kes": branch_price / 100,
            "prorata_amount_kobo": prorata_amount_kobo,
            "prorata_amount_kes": prorata_amount_kobo / 100,
            "days_remaining": days_remaining,
            "total_days": total_days,
            "prorata_percentage": round(prorata_multiplier * 100, 2),
            "billing_cycle": billing_cycle
        }

    # ========================================================================
    # PAYSTACK SUBSCRIPTIONS - Auto-Renewal
    # ========================================================================

    async def create_subscription_plan(
        self,
        plan_code: str,
        name: str,
        amount: int,
        interval: str
    ) -> Dict[str, Any]:
        """
        Create a subscription plan on Paystack.
        Plans must be created on Paystack before customers can subscribe.

        Args:
            plan_code: Unique identifier for the plan (e.g., 'monthly-main-2000')
            name: Display name for the plan
            amount: Amount in kobo (100 kobo = 1 KES)
            interval: 'monthly', 'quarterly', 'biannually', 'annually'

        Returns:
            Dictionary with plan details from Paystack
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "name": name,
                    "amount": amount,
                    "interval": interval,
                    "plan_code": plan_code,
                    "currency": "KES",
                    "description": f"{name} subscription plan",
                    "send_invoices": True,
                    "send_sms": False
                }

                response = await client.post(
                    f"{self.base_url}/plan",
                    json=payload,
                    headers=self.headers
                )
                result = response.json()

                if result.get('status'):
                    logger.info(f"✅ Subscription plan created: {plan_code}")
                    return {"status": True, "data": result.get('data'), "message": result.get('message')}
                else:
                    logger.error(f"❌ Failed to create plan: {result.get('message')}")
                    return {"status": False, "message": result.get('message')}

        except Exception as e:
            logger.error(f"❌ Error creating subscription plan: {str(e)}")
            return {"status": False, "message": str(e)}

    async def create_subscription(
        self,
        customer_email: str,
        plan_code: str,
        authorization_code: str = None
    ) -> Dict[str, Any]:
        """
        Subscribe a customer to a recurring subscription plan.

        Args:
            customer_email: Customer's email address
            plan_code: The plan code to subscribe to
            authorization_code: Optional authorization code from previous payment

        Returns:
            Dictionary with subscription details including subscription_code
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "customer": customer_email,
                    "plan": plan_code
                }

                if authorization_code:
                    payload["authorization"] = authorization_code

                response = await client.post(
                    f"{self.base_url}/subscription",
                    json=payload,
                    headers=self.headers
                )
                result = response.json()

                if result.get('status'):
                    subscription_data = result.get('data', {})
                    logger.info(f"✅ Subscription created: {subscription_data.get('subscription_code')}")
                    return {
                        "status": True,
                        "data": subscription_data,
                        "subscription_code": subscription_data.get('subscription_code'),
                        "email_token": subscription_data.get('email_token'),
                        "next_payment_date": subscription_data.get('next_payment_date')
                    }
                else:
                    logger.error(f"❌ Failed to create subscription: {result.get('message')}")
                    return {"status": False, "message": result.get('message')}

        except Exception as e:
            logger.error(f"❌ Error creating subscription: {str(e)}")
            return {"status": False, "message": str(e)}

    async def disable_subscription(self, subscription_code: str, email_token: str) -> Dict[str, Any]:
        """
        Disable/cancel a Paystack subscription.

        Args:
            subscription_code: The subscription code to disable
            email_token: Email token for the subscription

        Returns:
            Dictionary with status and message
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "code": subscription_code,
                    "token": email_token
                }

                response = await client.post(
                    f"{self.base_url}/subscription/disable",
                    json=payload,
                    headers=self.headers
                )
                result = response.json()

                if result.get('status'):
                    logger.info(f"✅ Subscription disabled: {subscription_code}")
                    return {"status": True, "message": "Subscription disabled successfully"}
                else:
                    logger.error(f"❌ Failed to disable subscription: {result.get('message')}")
                    return {"status": False, "message": result.get('message')}

        except Exception as e:
            logger.error(f"❌ Error disabling subscription: {str(e)}")
            return {"status": False, "message": str(e)}

    async def enable_subscription(self, subscription_code: str, email_token: str) -> Dict[str, Any]:
        """
        Re-enable a disabled Paystack subscription.

        Args:
            subscription_code: The subscription code to enable
            email_token: Email token for the subscription

        Returns:
            Dictionary with status and message
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "code": subscription_code,
                    "token": email_token
                }

                response = await client.post(
                    f"{self.base_url}/subscription/enable",
                    json=payload,
                    headers=self.headers
                )
                result = response.json()

                if result.get('status'):
                    logger.info(f"✅ Subscription enabled: {subscription_code}")
                    return {"status": True, "message": "Subscription enabled successfully"}
                else:
                    logger.error(f"❌ Failed to enable subscription: {result.get('message')}")
                    return {"status": False, "message": result.get('message')}

        except Exception as e:
            logger.error(f"❌ Error enabling subscription: {str(e)}")
            return {"status": False, "message": str(e)}

    async def fetch_subscription(self, id_or_code: str) -> Dict[str, Any]:
        """
        Fetch subscription details from Paystack.

        Args:
            id_or_code: Subscription ID or subscription code

        Returns:
            Dictionary with subscription details
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/subscription/{id_or_code}",
                    headers=self.headers
                )
                result = response.json()

                if result.get('status'):
                    return {"status": True, "data": result.get('data')}
                else:
                    logger.error(f"❌ Failed to fetch subscription: {result.get('message')}")
                    return {"status": False, "message": result.get('message')}

        except Exception as e:
            logger.error(f"❌ Error fetching subscription: {str(e)}")
            return {"status": False, "message": str(e)}


# Initialize service
paystack_service = PaystackService()
