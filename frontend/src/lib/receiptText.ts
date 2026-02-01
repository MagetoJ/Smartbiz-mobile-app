import { Sale, Tenant } from './api';
import { parseAsUTC } from './utils';

/**
 * Generate plain text receipt for WhatsApp sharing
 */
export function generateReceiptText(sale: Sale, tenant: Tenant): string {
  const receiptNumber = `RCPT-${sale.id.toString().padStart(8, '0')}`;
  const date = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: tenant.timezone || 'Africa/Nairobi',
  }).format(parseAsUTC(sale.created_at));
  const currency = tenant.currency || 'KES'; // Default to KES if not set

  let text = `${tenant.name}\n`;
  if (tenant.address) text += `${tenant.address}\n`;
  if (tenant.phone) text += `Tel: ${tenant.phone}\n`;
  text += `${'='.repeat(30)}\n`;
  text += `Receipt: ${receiptNumber}\n`;
  text += `Date: ${date}\n`;
  text += `Cashier: ${sale.user.full_name}\n`;
  if (sale.customer_name) text += `Customer: ${sale.customer_name}\n`;
  text += `${'='.repeat(30)}\n`;
  text += `ITEMS\n`;
  text += `${'-'.repeat(30)}\n`;

  sale.sale_items.forEach(item => {
    text += `${item.product.name}\n`;
    text += `  ${item.quantity} x ${currency} ${item.price.toFixed(2)} = ${currency} ${item.subtotal.toFixed(2)}\n`;
  });

  text += `${'-'.repeat(30)}\n`;
  text += `Subtotal: ${currency} ${sale.subtotal.toFixed(2)}\n`;
  text += `VAT: ${currency} ${sale.tax.toFixed(2)}\n`;
  text += `${'='.repeat(30)}\n`;
  text += `*TOTAL: ${currency} ${sale.total.toFixed(2)}*\n`;
  text += `${'='.repeat(30)}\n`;
  text += `Payment: ${sale.payment_method}\n`;
  text += `\nThank you for your business!\n`;

  return text;
}

/**
 * Generate WhatsApp link with pre-filled receipt message
 * @param phone Phone number with country code (e.g., +254712345678)
 * @param receiptText Plain text receipt content
 * @returns WhatsApp URL that opens chat with pre-filled message
 */
export function generateWhatsAppLink(phone: string, receiptText: string): string {
  // Clean phone number - remove spaces, dashes, parentheses
  // Keep the + at the start if present
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // URL encode the message
  const encodedMessage = encodeURIComponent(receiptText);

  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}
