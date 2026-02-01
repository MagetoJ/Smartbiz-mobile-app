"""
PDF generation service for receipts.
Uses WeasyPrint to convert HTML receipts to PDF format.
"""

import io
import logging
from weasyprint import HTML
from email_service import generate_receipt_html

logger = logging.getLogger(__name__)


def generate_receipt_pdf(
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
) -> bytes:
    """
    Generate a PDF receipt from HTML template.
    
    Args:
        All the same arguments as generate_receipt_html
        
    Returns:
        PDF file as bytes
    """
    
    try:
        # Generate HTML using existing template
        html_content = generate_receipt_html(
            receipt_number=receipt_number,
            sale_date=sale_date,
            cashier_name=cashier_name,
            customer_name=customer_name,
            tenant_name=tenant_name,
            tenant_address=tenant_address,
            tenant_phone=tenant_phone,
            logo_url=logo_url,
            sale_items=sale_items,
            subtotal=subtotal,
            tax=tax,
            total=total,
            payment_method=payment_method,
            currency=currency,
            tax_rate=tax_rate
        )
        
        # Convert HTML to PDF
        pdf_buffer = io.BytesIO()
        HTML(string=html_content).write_pdf(pdf_buffer)
        pdf_bytes = pdf_buffer.getvalue()
        
        logger.info(f"Generated PDF receipt {receipt_number} ({len(pdf_bytes)} bytes)")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Failed to generate PDF receipt {receipt_number}: {str(e)}")
        raise


async def generate_receipt_pdf_from_sale(sale, tenant, cashier_name: str) -> bytes:
    """
    Generate PDF receipt from sale object.
    
    Args:
        sale: Sale object with items loaded
        tenant: Tenant object with business information
        cashier_name: Name of the cashier who made the sale
        
    Returns:
        PDF file as bytes
    """
    # Format receipt number
    receipt_number = f"RCPT-{sale.id:08d}"
    
    # Format sale date
    sale_date = sale.created_at.strftime("%B %d, %Y %I:%M %p") if hasattr(sale.created_at, 'strftime') else str(sale.created_at)
    
    # Prepare sale items for template
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
    
    # Generate PDF
    return generate_receipt_pdf(
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
