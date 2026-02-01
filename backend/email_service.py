"""
Email service for sending invitation and notification emails.
Uses Postmark HTTP API for email delivery.
"""

import httpx
import logging
from html import escape
from config import settings

logger = logging.getLogger(__name__)


def generate_invitation_html(
    full_name: str,
    temp_password: str,
    login_url: str,
    tenant_name: str,
    role: str,
    invited_by: str
) -> str:
    """Generate HTML email for user invitation"""

    # Escape user-provided content to prevent HTML injection
    full_name = escape(full_name)
    tenant_name = escape(tenant_name)
    invited_by = escape(invited_by)
    role = escape(role)

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .header h1 {{ margin: 0; font-size: 28px; }}
        .header p {{ margin: 10px 0 0 0; font-size: 16px; }}
        .content {{ padding: 30px; background: #f9fafb; border-radius: 0 0 8px 8px; }}
        .button {{ display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }}
        .button:hover {{ background: #4338CA; }}
        .code {{ background: #e5e7eb; padding: 12px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 16px; letter-spacing: 1px; margin: 10px 0; text-align: center; }}
        .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        .role-badge {{ display: inline-block; padding: 4px 12px; background: #10b981; color: white; border-radius: 12px; font-size: 14px; font-weight: bold; }}
        .warning-box {{ background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }}
        .warning-box p {{ margin: 5px 0; }}
        .info-section {{ margin: 20px 0; }}
        .info-section strong {{ color: #4F46E5; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to {tenant_name}!</h1>
            <p>You've been invited to join the team</p>
        </div>
        <div class="content">
            <p>Hello <strong>{full_name}</strong>,</p>

            <p><strong>{invited_by}</strong> has invited you to join <strong>{tenant_name}</strong> as a <span class="role-badge">{role.upper()}</span>.</p>

            <div class="info-section">
                <h3 style="color: #4F46E5; margin-bottom: 10px;">Your Login Credentials:</h3>

                <p><strong>Login URL:</strong></p>
                <div style="text-align: center;">
                    <a href="{login_url}" class="button">Login to {tenant_name}</a>
                </div>
                <p style="margin-top: 10px; font-size: 14px; color: #6b7280; text-align: center;">Or copy this link: {login_url}</p>

                <p style="margin-top: 20px;"><strong>Your temporary password:</strong></p>
                <div class="code">{temp_password}</div>
            </div>

            <div class="warning-box">
                <p style="margin: 0;"><strong>⚠️ Important Security Notice:</strong></p>
                <p style="margin: 5px 0 0 0;">Please change your password immediately after your first login for security purposes.</p>
            </div>

            <p>As a <strong>{role}</strong>, you'll have access to the {tenant_name} management system. If you have any questions, please contact your administrator.</p>

            <p style="margin-top: 30px;">Best regards,<br>The {tenant_name} Team</p>
        </div>
        <div class="footer">
            <p>This invitation was sent by {invited_by}</p>
            <p>Powered by mBiz</p>
        </div>
    </div>
</body>
</html>"""


def generate_invitation_plain(
    full_name: str,
    temp_password: str,
    login_url: str,
    tenant_name: str,
    role: str,
    invited_by: str
) -> str:
    """Generate plain text email for user invitation (fallback)"""

    return f"""Welcome to {tenant_name}!

Hello {full_name},

{invited_by} has invited you to join {tenant_name} as a {role.upper()}.

YOUR LOGIN CREDENTIALS:

Login URL: {login_url}
Temporary Password: {temp_password}

IMPORTANT SECURITY NOTICE:
Please change your password immediately after your first login for security purposes.

As a {role}, you'll have access to the {tenant_name} management system.

If you have any questions, please contact your administrator.

Best regards,
The {tenant_name} Team

---
This invitation was sent by {invited_by}
Powered by mBiz
"""


def generate_welcome_html(
    full_name: str,
    business_name: str,
    subdomain: str,
    login_url: str
) -> str:
    """Generate HTML email for business registration welcome"""

    # Escape user-provided content to prevent HTML injection
    full_name = escape(full_name)
    business_name = escape(business_name)
    subdomain = escape(subdomain)

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .header h1 {{ margin: 0; font-size: 32px; }}
        .header p {{ margin: 10px 0 0 0; font-size: 18px; opacity: 0.95; }}
        .content {{ padding: 30px; background: #f9fafb; border-radius: 0 0 8px 8px; }}
        .button {{ display: inline-block; padding: 14px 28px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: bold; font-size: 16px; }}
        .button:hover {{ background: #059669; }}
        .info-box {{ background: white; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        .info-box h3 {{ color: #10b981; margin-top: 0; }}
        .checklist {{ list-style: none; padding: 0; margin: 20px 0; }}
        .checklist li {{ padding: 10px 0 10px 30px; position: relative; }}
        .checklist li:before {{ content: "✓"; position: absolute; left: 0; color: #10b981; font-weight: bold; font-size: 20px; }}
        .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        .subdomain {{ background: #e5e7eb; padding: 8px 16px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; display: inline-block; margin: 5px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to StatBricks!</h1>
            <p>Your business is ready to go</p>
        </div>
        <div class="content">
            <p>Hello <strong>{full_name}</strong>,</p>

            <p>Congratulations! Your business <strong>{business_name}</strong> has been successfully registered on StatBricks.</p>

            <div class="info-box">
                <h3>Your Business Details:</h3>
                <p><strong>Business Name:</strong> {business_name}</p>
                <p><strong>Subdomain:</strong> <span class="subdomain">{subdomain}.statbricks.com</span></p>
                <p><strong>Login URL:</strong> {login_url}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{login_url}" class="button">Access Your Dashboard</a>
            </div>

            <h3 style="color: #10b981; margin-top: 30px;">Getting Started:</h3>
            <ul class="checklist">
                <li><strong>Set up your business profile</strong> - Add your logo, address, and contact details</li>
                <li><strong>Add your products</strong> - Build your inventory catalog</li>
                <li><strong>Invite your team</strong> - Add staff members to help manage your business</li>
                <li><strong>Start selling</strong> - Use the POS system to record your first sale</li>
            </ul>

            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 4px;">
                <p style="margin: 0;"><strong>💡 Tip:</strong> Explore the dashboard to see sales analytics, manage inventory, and track your business performance in real-time.</p>
            </div>

            <p style="margin-top: 30px;">If you have any questions or need assistance, don't hesitate to reach out to our support team.</p>

            <p style="margin-top: 30px;">Best regards,<br><strong>The StatBricks Team</strong></p>
        </div>
        <div class="footer">
            <p>Thank you for choosing StatBricks for your business management needs</p>
            <p>d</p>
        </div>
    </div>
</body>
</html>"""


def generate_password_reset_html(
    full_name: str,
    reset_url: str
) -> str:
    """Generate HTML email for password reset"""

    # Escape user-provided content
    full_name = escape(full_name)

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f9fafb; }}
        .container {{ max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .header {{ text-align: center; border-bottom: 2px solid #4F46E5; padding-bottom: 20px; margin-bottom: 20px; }}
        .header h1 {{ margin: 0; font-size: 28px; color: #4F46E5; }}
        .button {{ display: inline-block; padding: 14px 28px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }}
        .button:hover {{ background: #4338CA; }}
        .warning-box {{ background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px; }}
        .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Password Reset Request</h1>
        </div>
        
        <p>Hello <strong>{full_name}</strong>,</p>

        <p>We received a request to reset your password for your StatBricks account.</p>

        <p>Click the button below to reset your password:</p>

        <div style="text-align: center;">
            <a href="{reset_url}" class="button">Reset Password</a>
        </div>

        <p style="margin-top: 20px; font-size: 14px; color: #6b7280; text-align: center;">Or copy this link: {reset_url}</p>

        <div class="warning-box">
            <p style="margin: 0;"><strong>⚠️ Security Notice:</strong></p>
            <p style="margin: 5px 0 0 0;">This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        </div>

        <p style="margin-top: 30px;">If you have any questions, please contact our support team.</p>

        <div class="footer">
            <p>Powered by mBiz</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>"""


def generate_password_reset_plain(
    full_name: str,
    reset_url: str
) -> str:
    """Generate plain text email for password reset (fallback)"""

    return f"""Password Reset Request

Hello {full_name},

We received a request to reset your password for your StatBricks account.

Click the link below to reset your password:
{reset_url}

SECURITY NOTICE:
This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.

If you have any questions, please contact our support team.

---
Powered by mBiz
This is an automated message, please do not reply to this email.
"""


def generate_welcome_plain(
    full_name: str,
    business_name: str,
    subdomain: str,
    login_url: str
) -> str:
    """Generate plain text email for business registration welcome (fallback)"""

    return f"""Welcome to StatBricks!

Hello {full_name},

Congratulations! Your business {business_name} has been successfully registered on StatBricks.

YOUR BUSINESS DETAILS:
Business Name: {business_name}
Subdomain: {subdomain}.statbricks.com
Login URL: {login_url}

GETTING STARTED:
✓ Set up your business profile - Add your logo, address, and contact details
✓ Add your products - Build your inventory catalog
✓ Invite your team - Add staff members to help manage your business
✓ Start selling - Use the POS system to record your first sale

TIP: Explore the dashboard to see sales analytics, manage inventory, and track your business performance in real-time.

If you have any questions or need assistance, don't hesitate to reach out to our support team.

Best regards,
The StatBricks Team

---
Thank you for choosing StatBricks for your business management needs
Powered by mBiz
"""


def generate_receipt_html(
    receipt_number: str,
    sale_date: str,
    cashier_name: str,
    customer_name: str,
    tenant_name: str,
    tenant_address: str,
    tenant_phone: str,
    logo_url: str,
    sale_items: list,
    subtotal: float,
    tax: float,
    total: float,
    payment_method: str,
    currency: str,
    tax_rate: float
) -> str:
    """Generate HTML receipt email"""

    # Escape user-provided content
    tenant_name = escape(tenant_name)
    customer_name = escape(customer_name)
    cashier_name = escape(cashier_name)
    tenant_address = escape(tenant_address or "")
    tenant_phone = escape(tenant_phone or "")

    # Build items HTML
    items_html = ""
    for item in sale_items:
        product_name = escape(item['product_name'])
        items_html += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{product_name}</td>
            <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">{item['quantity']}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">{currency} {item['price']:.2f}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: bold;">{currency} {item['subtotal']:.2f}</td>
        </tr>
        """

    logo_html = f'<img src="{logo_url}" alt="{tenant_name}" style="max-width: 120px; max-height: 80px; margin-bottom: 10px;">' if logo_url else ""

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: 'Courier New', monospace; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f9fafb; }}
        .container {{ max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .header {{ text-align: center; border-bottom: 2px dashed #333; padding-bottom: 20px; margin-bottom: 20px; }}
        .header h1 {{ margin: 10px 0; font-size: 24px; }}
        .header p {{ margin: 5px 0; font-size: 14px; color: #666; }}
        .info-section {{ margin: 20px 0; font-size: 14px; }}
        .info-section div {{ margin: 5px 0; }}
        .items-table {{ width: 100%; margin: 20px 0; border-collapse: collapse; }}
        .items-table th {{ background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #333; font-size: 14px; }}
        .totals-section {{ border-top: 2px dashed #333; padding-top: 15px; margin-top: 20px; }}
        .totals-row {{ display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }}
        .totals-row.grand-total {{ font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }}
        .footer {{ text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px dashed #333; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            {logo_html}
            <h1>{tenant_name}</h1>
            {f'<p>{tenant_address}</p>' if tenant_address else ''}
            {f'<p>Tel: {tenant_phone}</p>' if tenant_phone else ''}
        </div>

        <div class="info-section">
            <div><strong>Receipt #:</strong> {receipt_number}</div>
            <div><strong>Date:</strong> {sale_date}</div>
            <div><strong>Cashier:</strong> {cashier_name}</div>
            <div><strong>Customer:</strong> {customer_name}</div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Price</th>
                    <th style="text-align: right;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
            </tbody>
        </table>

        <div class="totals-section">
            <div class="totals-row">
                <span>Subtotal:</span>
                <span>{currency} {subtotal:.2f}</span>
            </div>
            <div class="totals-row">
                <span>VAT ({tax_rate * 100:.1f}%):</span>
                <span>{currency} {tax:.2f}</span>
            </div>
            <div class="totals-row grand-total">
                <span>TOTAL:</span>
                <span>{currency} {total:.2f}</span>
            </div>
        </div>

        <div style="margin-top: 20px; font-size: 14px;">
            <strong>Payment Method:</strong> {payment_method}
        </div>

        <div class="footer">
            <p><strong>Thank you for your business!</strong></p>
            <p>Powered by mBiz</p>
        </div>
    </div>
</body>
</html>"""


def generate_receipt_plain(
    receipt_number: str,
    sale_date: str,
    cashier_name: str,
    customer_name: str,
    tenant_name: str,
    tenant_address: str,
    tenant_phone: str,
    sale_items: list,
    subtotal: float,
    tax: float,
    total: float,
    payment_method: str,
    currency: str,
    tax_rate: float
) -> str:
    """Generate plain text receipt email"""

    # Build items text
    items_text = ""
    for item in sale_items:
        items_text += f"{item['product_name']}\n"
        items_text += f"  {item['quantity']} x {currency} {item['price']:.2f} = {currency} {item['subtotal']:.2f}\n\n"

    return f"""{tenant_name}
{tenant_address if tenant_address else ''}
{f'Tel: {tenant_phone}' if tenant_phone else ''}
{'='*50}

Receipt #: {receipt_number}
Date: {sale_date}
Cashier: {cashier_name}
Customer: {customer_name}

{'='*50}
ITEMS
{'='*50}

{items_text}
{'='*50}
TOTALS
{'='*50}

Subtotal:        {currency} {subtotal:>10.2f}
VAT ({tax_rate * 100:.1f}%):       {currency} {tax:>10.2f}
{'='*50}
TOTAL:           {currency} {total:>10.2f}

Payment Method: {payment_method}

{'='*50}

Thank you for your business!
Powered by mBiz
"""


class EmailService:
    """Async email service using Postmark HTTP API"""

    POSTMARK_API_URL = "https://api.postmarkapp.com/email"

    def __init__(self):
        self.server_token = settings.POSTMARK_SERVER_TOKEN
        self.from_email = settings.POSTMARK_FROM_EMAIL
        self.from_name = settings.POSTMARK_FROM_NAME
        self.enabled = settings.POSTMARK_ENABLED
        self.test_mode = settings.EMAIL_TEST_MODE

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        plain_content: str,
        pdf_attachment: bytes = None,
        pdf_filename: str = None
    ) -> bool:
        """
        Send email via Postmark HTTP API.

        Args:
            to_email: Recipient email address
            subject: Email subject line
            html_content: HTML version of email
            plain_content: Plain text fallback

        Returns:
            True if email sent successfully, False otherwise
        """

        # Test mode - log email instead of sending
        if self.test_mode:
            print(f"\n{'='*80}")
            print(f"[TEST MODE] Email would be sent to: {to_email}")
            print(f"[TEST MODE] Subject: {subject}")
            print(f"[TEST MODE] Plain content:")
            print(f"{'-'*80}")
            print(plain_content)
            print(f"{'='*80}\n")
            return True

        # Check if Postmark is enabled
        if not self.enabled:
            print(f"Postmark disabled - email not sent to {to_email}")
            return False

        if not self.server_token:
            print(f"ERROR: POSTMARK_SERVER_TOKEN not configured - email not sent to {to_email}")
            return False

        try:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": self.server_token
            }

            payload = {
                "From": f"{self.from_name} <{self.from_email}>",
                "To": to_email,
                "Subject": subject,
                "HtmlBody": html_content,
                "TextBody": plain_content,
                "MessageStream": "outbound"
            }
            
            # Add PDF attachment if provided
            if pdf_attachment and pdf_filename:
                import base64
                pdf_base64 = base64.b64encode(pdf_attachment).decode('utf-8')
                payload["Attachments"] = [
                    {
                        "Name": pdf_filename,
                        "Content": pdf_base64,
                        "ContentType": "application/pdf"
                    }
                ]

            print(f"Sending email to {to_email} via Postmark...")

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.POSTMARK_API_URL,
                    headers=headers,
                    json=payload,
                    timeout=30.0
                )

                if response.status_code == 200:
                    logger.info(f"Email sent successfully to {to_email}")
                    print(f"Email sent successfully to {to_email}")
                    return True
                else:
                    error_detail = response.text
                    logger.error(f"Postmark API error for {to_email}: {response.status_code} - {error_detail}")
                    print(f"ERROR: Postmark API error: {response.status_code} - {error_detail}")
                    return False

        except httpx.TimeoutException:
            logger.error(f"Timeout sending email to {to_email}")
            print(f"ERROR: Timeout sending email to {to_email}")
            return False

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            print(f"ERROR: Failed to send email to {to_email}: {str(e)}")
            return False

    async def send_invitation_email(
        self,
        user_email: str,
        user_full_name: str,
        temp_password: str,
        tenant_subdomain: str,
        tenant_name: str,
        user_role: str,
        invited_by: str
    ) -> bool:
        """
        Send invitation email to a newly invited user.

        Args:
            user_email: User's email address
            user_full_name: User's full name
            temp_password: Temporary password for first login
            tenant_subdomain: Tenant subdomain (e.g., 'demo')
            tenant_name: Tenant's business name
            user_role: User's role (admin/staff)
            invited_by: Name of the person who sent the invitation

        Returns:
            True if email sent successfully, False otherwise
        """

        # Build login URL using configured frontend URL
        login_url = f"{settings.FRONTEND_URL}/login"

        # Generate email content
        html_content = generate_invitation_html(
            full_name=user_full_name,
            temp_password=temp_password,
            login_url=login_url,
            tenant_name=tenant_name,
            role=user_role,
            invited_by=invited_by
        )

        plain_content = generate_invitation_plain(
            full_name=user_full_name,
            temp_password=temp_password,
            login_url=login_url,
            tenant_name=tenant_name,
            role=user_role,
            invited_by=invited_by
        )

        subject = f"You've been invited to join {tenant_name}"

        print(f"Preparing invitation email for {user_email} to join {tenant_name} as {user_role}")

        return await self.send_email(
            to_email=user_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_welcome_email(
        self,
        user_email: str,
        user_full_name: str,
        business_name: str,
        subdomain: str
    ) -> bool:
        """
        Send welcome email to new business owner after registration.

        Args:
            user_email: Business owner's email address
            user_full_name: Business owner's full name
            business_name: Name of the registered business
            subdomain: Business subdomain (e.g., 'acme-store')

        Returns:
            True if email sent successfully, False otherwise
        """

        # Build login URL using configured frontend URL
        login_url = f"{settings.FRONTEND_URL}/login"

        # Generate email content
        html_content = generate_welcome_html(
            full_name=user_full_name,
            business_name=business_name,
            subdomain=subdomain,
            login_url=login_url
        )

        plain_content = generate_welcome_plain(
            full_name=user_full_name,
            business_name=business_name,
            subdomain=subdomain,
            login_url=login_url
        )

        subject = f"Welcome to StatBricks - {business_name} is ready!"

        print(f"Preparing welcome email for {user_email} - Business: {business_name}")

        return await self.send_email(
            to_email=user_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_password_reset_email(
        self,
        user_email: str,
        user_full_name: str,
        reset_token: str
    ) -> bool:
        """
        Send password reset email to user.

        Args:
            user_email: User's email address
            user_full_name: User's full name
            reset_token: Password reset token

        Returns:
            True if email sent successfully, False otherwise
        """

        # Build reset URL using configured frontend URL
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

        # Generate email content
        html_content = generate_password_reset_html(
            full_name=user_full_name,
            reset_url=reset_url
        )

        plain_content = generate_password_reset_plain(
            full_name=user_full_name,
            reset_url=reset_url
        )

        subject = "Password Reset Request - StatBricks"

        print(f"Preparing password reset email for {user_email}")

        return await self.send_email(
            to_email=user_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_receipt_email(
        self,
        customer_email: str,
        sale,
        tenant,
        cashier_name: str
    ) -> bool:
        """
        Send receipt email to customer after sale completion.

        Args:
            customer_email: Customer's email address
            sale: Sale object with items loaded
            tenant: Tenant object with business information
            cashier_name: Name of the cashier who made the sale

        Returns:
            True if email sent successfully, False otherwise
        """
        # Format receipt number
        receipt_number = f"RCPT-{sale.id:08d}"

        # Format sale date
        sale_date = sale.created_at.strftime("%B %d, %Y %I:%M %p") if hasattr(sale.created_at, 'strftime') else str(sale.created_at)

        # Prepare sale items for templates
        items_data = []
        for item in sale.sale_items:
            items_data.append({
                'product_name': item.product.name,
                'quantity': item.quantity,
                'price': item.price,
                'subtotal': item.subtotal
            })

        # Construct full logo URL from R2 storage
        from config import settings as app_settings
        logo_url = ""
        if tenant.logo_url and app_settings.R2_PUBLIC_URL:
            logo_url = f"{app_settings.R2_PUBLIC_URL}/{tenant.logo_url}"

        # Generate email content
        html_content = generate_receipt_html(
            receipt_number=receipt_number,
            sale_date=sale_date,
            cashier_name=cashier_name,
            customer_name=sale.customer_name or "Walk-in Customer",
            tenant_name=tenant.name,
            tenant_address=tenant.address or "",
            tenant_phone=tenant.phone or "",
            logo_url=logo_url,
            sale_items=items_data,
            subtotal=sale.subtotal,
            tax=sale.tax,
            total=sale.total,
            payment_method=sale.payment_method or "Cash",
            currency=tenant.currency,
            tax_rate=tenant.tax_rate
        )

        plain_content = generate_receipt_plain(
            receipt_number=receipt_number,
            sale_date=sale_date,
            cashier_name=cashier_name,
            customer_name=sale.customer_name or "Walk-in Customer",
            tenant_name=tenant.name,
            tenant_address=tenant.address or "",
            tenant_phone=tenant.phone or "",
            sale_items=items_data,
            subtotal=sale.subtotal,
            tax=sale.tax,
            total=sale.total,
            payment_method=sale.payment_method or "Cash",
            currency=tenant.currency,
            tax_rate=tenant.tax_rate
        )

        subject = f"Receipt #{receipt_number} - {tenant.name}"

        logger.info(f"Preparing receipt email with PDF for {customer_email} - Receipt #{receipt_number}")

        # Generate PDF attachment
        try:
            from pdf_service import generate_receipt_pdf_from_sale
            pdf_bytes = await generate_receipt_pdf_from_sale(sale, tenant, cashier_name)
            pdf_filename = f"{receipt_number}.pdf"
            
            return await self.send_email(
                to_email=customer_email,
                subject=subject,
                html_content=html_content,
                plain_content=plain_content,
                pdf_attachment=pdf_bytes,
                pdf_filename=pdf_filename
            )
        except Exception as e:
            logger.error(f"Failed to generate PDF for receipt {receipt_number}: {str(e)}")
            # Fall back to sending without PDF attachment
            return await self.send_email(
                to_email=customer_email,
                subject=subject,
                html_content=html_content,
                plain_content=plain_content
            )

    async def send_subscription_expiring_notification(
        self,
        tenant_name: str,
        tenant_subdomain: str,
        admin_email: str,
        days_remaining: int,
        subscription_end_date: str,
        unpaid_branches: list = None
    ) -> bool:
        """
        Send notification when subscription is about to expire.

        Args:
            tenant_name: Name of the tenant/organization
            tenant_subdomain: Subdomain for login
            admin_email: Email of the tenant admin
            days_remaining: Number of days until subscription expires
            subscription_end_date: Formatted end date string
            unpaid_branches: Optional list of unpaid branch names
        """
        if not admin_email:
            logger.warning(f"Cannot send subscription expiring notification - no admin email for tenant {tenant_name}")
            return False

        urgency_text = "urgently renew" if days_remaining <= 3 else "renew"
        urgency_color = "#dc2626" if days_remaining <= 3 else "#f59e0b"

        branches_warning = ""
        if unpaid_branches and len(unpaid_branches) > 0:
            branches_list = ", ".join(unpaid_branches)
            branches_warning = f"""
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e;">
                    <strong>Note:</strong> The following branches currently have unpaid subscriptions and are in read-only mode: {branches_list}
                </p>
            </div>
            """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">StatBricks</h1>
            </div>

            <div style="padding: 30px; background-color: #ffffff;">
                <div style="background-color: {urgency_color}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px;">⚠️ Subscription Expiring in {days_remaining} Day{'s' if days_remaining != 1 else ''}</h2>
                </div>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Hello,
                </p>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    This is a reminder that your subscription for <strong>{tenant_name}</strong> will expire on <strong>{subscription_end_date}</strong>.
                </p>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    After this date, all branches will switch to read-only mode and you won't be able to:
                </p>

                <ul style="color: #374151; font-size: 16px; line-height: 1.6;">
                    <li>Create new sales or transactions</li>
                    <li>Add or modify products</li>
                    <li>Update inventory or stock levels</li>
                    <li>Access POS functionality</li>
                </ul>

                {branches_warning}

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Please {urgency_text} your subscription to maintain full access to your account.
                </p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://{tenant_subdomain}.statbricks.com/settings?tab=subscription"
                       style="display: inline-block; background-color: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Renew Subscription Now
                    </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    If you have any questions, please contact our support team.
                </p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px; text-align: center;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                    © 2025 StatBricks. All rights reserved.
                </p>
            </div>
        </div>
        """

        plain_content = f"""
        StatBricks - Subscription Expiring

        Hello,

        This is a reminder that your subscription for {tenant_name} will expire on {subscription_end_date} (in {days_remaining} day{'s' if days_remaining != 1 else ''}).

        After this date, all branches will switch to read-only mode and you won't be able to:
        - Create new sales or transactions
        - Add or modify products
        - Update inventory or stock levels
        - Access POS functionality

        Please {urgency_text} your subscription to maintain full access to your account.

        Renew now: https://{tenant_subdomain}.statbricks.com/settings?tab=subscription

        If you have any questions, please contact our support team.

        © 2025 StatBricks. All rights reserved.
        """

        subject = f"⚠️ Your StatBricks subscription expires in {days_remaining} day{'s' if days_remaining != 1 else ''}"

        return await self.send_email(
            to_email=admin_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_subscription_expired_notification(
        self,
        tenant_name: str,
        tenant_subdomain: str,
        admin_email: str,
        expired_date: str,
        affected_branches: list = None
    ) -> bool:
        """
        Send notification when subscription has expired.

        Args:
            tenant_name: Name of the tenant/organization
            tenant_subdomain: Subdomain for login
            admin_email: Email of the tenant admin
            expired_date: Formatted expiration date string
            affected_branches: Optional list of affected branch names
        """
        if not admin_email:
            logger.warning(f"Cannot send subscription expired notification - no admin email for tenant {tenant_name}")
            return False

        branches_text = ""
        if affected_branches and len(affected_branches) > 0:
            branches_list = ", ".join(affected_branches)
            branches_text = f"""
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0;">
                <p style="margin: 0; color: #7f1d1d;">
                    <strong>Affected Branches:</strong> {branches_list}
                </p>
            </div>
            """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">StatBricks</h1>
            </div>

            <div style="padding: 30px; background-color: #ffffff;">
                <div style="background-color: #dc2626; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px;">🔒 Subscription Expired</h2>
                </div>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Hello,
                </p>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Your subscription for <strong>{tenant_name}</strong> expired on <strong>{expired_date}</strong>.
                </p>

                {branches_text}

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Your account is now in <strong>read-only mode</strong>. You can view your data, but cannot:
                </p>

                <ul style="color: #374151; font-size: 16px; line-height: 1.6;">
                    <li>Create new sales or transactions</li>
                    <li>Add or modify products</li>
                    <li>Update inventory or stock levels</li>
                    <li>Access POS functionality</li>
                </ul>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    <strong>Renew your subscription now to restore full access.</strong>
                </p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://{tenant_subdomain}.statbricks.com/settings?tab=subscription"
                       style="display: inline-block; background-color: #dc2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Renew Subscription
                    </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    Questions? Contact our support team for assistance.
                </p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px; text-align: center;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                    © 2025 StatBricks. All rights reserved.
                </p>
            </div>
        </div>
        """

        plain_content = f"""
        StatBricks - Subscription Expired

        Hello,

        Your subscription for {tenant_name} expired on {expired_date}.

        Your account is now in read-only mode. You can view your data, but cannot:
        - Create new sales or transactions
        - Add or modify products
        - Update inventory or stock levels
        - Access POS functionality

        Renew your subscription now to restore full access.

        Renew now: https://{tenant_subdomain}.statbricks.com/settings?tab=subscription

        Questions? Contact our support team for assistance.

        © 2025 StatBricks. All rights reserved.
        """

        subject = f"🔒 Your StatBricks subscription has expired"

        return await self.send_email(
            to_email=admin_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_branch_added_confirmation(
        self,
        tenant_name: str,
        tenant_subdomain: str,
        admin_email: str,
        branch_name: str,
        amount_paid_kes: int,
        subscription_end_date: str,
        is_prorata: bool = False,
        days_remaining: int = None
    ) -> bool:
        """
        Send confirmation when a branch is added to subscription.

        Args:
            tenant_name: Name of the parent tenant/organization
            tenant_subdomain: Subdomain for login
            admin_email: Email of the tenant admin
            branch_name: Name of the branch that was added
            amount_paid_kes: Amount paid in KES (e.g., 1600 or 800 for pro-rata)
            subscription_end_date: Formatted end date string
            is_prorata: Whether this was a pro-rata payment
            days_remaining: Days remaining in subscription (if pro-rata)
        """
        if not admin_email:
            logger.warning(f"Cannot send branch added confirmation - no admin email for tenant {tenant_name}")
            return False

        payment_type_text = ""
        if is_prorata and days_remaining:
            payment_type_text = f"""
            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 20px 0;">
                <p style="margin: 0; color: #065f46;">
                    <strong>Pro-rata Payment:</strong> You paid KES {amount_paid_kes:,} for the remaining {days_remaining} day{'s' if days_remaining != 1 else ''} of your current billing cycle.
                </p>
            </div>
            """

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">StatBricks</h1>
            </div>

            <div style="padding: 30px; background-color: #ffffff;">
                <div style="background-color: #10b981; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px;">✅ Branch Added to Subscription</h2>
                </div>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Hello,
                </p>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    Great news! <strong>{branch_name}</strong> has been successfully added to your <strong>{tenant_name}</strong> subscription.
                </p>

                {payment_type_text}

                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">Branch Name:</td>
                            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right;">{branch_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">Amount Paid:</td>
                            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right;">KES {amount_paid_kes:,}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">Subscription Expires:</td>
                            <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right;">{subscription_end_date}</td>
                        </tr>
                    </table>
                </div>

                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                    This branch now has full access to all features including:
                </p>

                <ul style="color: #374151; font-size: 16px; line-height: 1.6;">
                    <li>Point of Sale (POS) system</li>
                    <li>Inventory management</li>
                    <li>Sales tracking and reporting</li>
                    <li>Stock movement tracking</li>
                </ul>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://{tenant_subdomain}.statbricks.com/settings?tab=branches"
                       style="display: inline-block; background-color: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        View All Branches
                    </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                    Thank you for choosing StatBricks!
                </p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px; text-align: center;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                    © 2025 StatBricks. All rights reserved.
                </p>
            </div>
        </div>
        """

        plain_content = f"""
        StatBricks - Branch Added to Subscription

        Hello,

        Great news! {branch_name} has been successfully added to your {tenant_name} subscription.

        Details:
        - Branch Name: {branch_name}
        - Amount Paid: KES {amount_paid_kes:,}
        - Subscription Expires: {subscription_end_date}

        {"Pro-rata Payment: You paid KES " + str(amount_paid_kes) + " for the remaining " + str(days_remaining) + " day(s) of your current billing cycle." if is_prorata and days_remaining else ""}

        This branch now has full access to all features including:
        - Point of Sale (POS) system
        - Inventory management
        - Sales tracking and reporting
        - Stock movement tracking

        View all branches: https://{tenant_subdomain}.statbricks.com/settings?tab=branches

        Thank you for choosing StatBricks!

        © 2025 StatBricks. All rights reserved.
        """

        subject = f"✅ {branch_name} added to your subscription"

        return await self.send_email(
            to_email=admin_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )

    async def send_credit_reminder_email(
        self,
        customer_email: str,
        customer_name: str,
        business_name: str,
        amount_due: float,
        due_date: str,
        days_overdue: int,
        currency: str = "KES"
    ) -> bool:
        """
        Send escalating credit reminder email based on days overdue.

        Args:
            customer_email: Customer email
            customer_name: Customer name
            business_name: Business/tenant name
            amount_due: Remaining amount due
            due_date: Formatted due date string
            days_overdue: Days since due date (0 = due today)
            currency: Currency code

        Returns:
            True if email sent successfully
        """
        customer_name = escape(customer_name)
        business_name = escape(business_name)

        # Stage-based subject and tone
        if days_overdue == 0:
            subject = f"Payment Due Today - {business_name}"
            tone_color = "#3B82F6"
            tone_bg = "#EFF6FF"
            message = f"Your payment of <strong>{currency} {amount_due:,.2f}</strong> is due today."
            action_text = "Please make your payment at your earliest convenience."
        elif days_overdue <= 3:
            subject = f"Payment Overdue ({days_overdue} days) - {business_name}"
            tone_color = "#F59E0B"
            tone_bg = "#FFFBEB"
            message = f"Your payment of <strong>{currency} {amount_due:,.2f}</strong> is now <strong>{days_overdue} day(s) overdue</strong>."
            action_text = "Please arrange payment as soon as possible to keep your account in good standing."
        elif days_overdue <= 7:
            subject = f"Urgent: Payment Overdue ({days_overdue} days) - {business_name}"
            tone_color = "#EA580C"
            tone_bg = "#FFF7ED"
            message = f"Your payment of <strong>{currency} {amount_due:,.2f}</strong> is now <strong>{days_overdue} days overdue</strong>."
            action_text = "Please contact us immediately to arrange payment or discuss repayment options."
        else:
            subject = f"Final Notice: Payment Overdue ({days_overdue} days) - {business_name}"
            tone_color = "#DC2626"
            tone_bg = "#FEF2F2"
            message = f"Your payment of <strong>{currency} {amount_due:,.2f}</strong> is now <strong>{days_overdue} days overdue</strong>."
            action_text = "This is a final notice. Failure to settle this balance may result in further action on your account."

        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: {tone_color}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">{business_name}</h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Payment Reminder</p>
        </div>
        <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px;">Dear <strong>{customer_name}</strong>,</p>
            <div style="background: {tone_bg}; border-left: 4px solid {tone_color}; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 16px;">{message}</p>
            </div>
            <div style="background: #fff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Amount Due:</td>
                        <td style="padding: 8px 0; color: #111827; font-weight: bold; text-align: right;">{currency} {amount_due:,.2f}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Original Due Date:</td>
                        <td style="padding: 8px 0; color: #111827; text-align: right;">{due_date}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280;">Status:</td>
                        <td style="padding: 8px 0; text-align: right;"><span style="color: {tone_color}; font-weight: bold;">{"Due Today" if days_overdue == 0 else f"{days_overdue} Day(s) Overdue"}</span></td>
                    </tr>
                </table>
            </div>
            <p style="font-size: 16px; color: #374151;">{action_text}</p>
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                If you believe this is an error, please contact {business_name} directly.
            </p>
        </div>
        <div style="text-align: center; padding: 20px;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">© 2025 StatBricks. All rights reserved.</p>
        </div>
    </div>
</body>
</html>"""

        plain_content = f"""{business_name} - Payment Reminder

Dear {customer_name},

{"Your payment is due today." if days_overdue == 0 else f"Your payment is {days_overdue} day(s) overdue."}

Details:
- Amount Due: {currency} {amount_due:,.2f}
- Original Due Date: {due_date}
- Status: {"Due Today" if days_overdue == 0 else f"{days_overdue} Day(s) Overdue"}

{action_text}

If you believe this is an error, please contact {business_name} directly.

© 2025 StatBricks. All rights reserved.
"""

        return await self.send_email(
            to_email=customer_email,
            subject=subject,
            html_content=html_content,
            plain_content=plain_content
        )
