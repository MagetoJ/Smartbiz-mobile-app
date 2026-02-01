import { Sale } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { parseAsUTC } from '../lib/utils';

interface ReceiptProps {
  sale: Sale;
}

export function Receipt({ sale }: ReceiptProps) {
  const { tenant } = useAuth();

  if (!sale || !tenant) return null;

  const currency = tenant.currency || 'KES';
  const receiptNumber = `RCPT-${sale.id.toString().padStart(8, '0')}`;
  const saleDate = parseAsUTC(sale.created_at);
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: tenant.timezone || 'Africa/Nairobi',
  }).format(saleDate);

  // Construct full logo URL from R2 storage
  const R2_PUBLIC_URL = 'https://pub-074a09a663eb4769b3da85cd2a134fe6.r2.dev';
  const logoUrl = tenant.logo_url ? `${R2_PUBLIC_URL}/${tenant.logo_url}` : null;

  return (
    <div className="receipt-container" style={{
      maxWidth: '80mm',
      margin: '0 auto',
      padding: '20px',
      background: 'white',
      fontFamily: "'Courier New', monospace",
      fontSize: '12px'
    }}>
      {/* Business Header */}
      <div style={{
        textAlign: 'center',
        borderBottom: '2px dashed #000',
        paddingBottom: '10px',
        marginBottom: '10px'
      }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt={tenant.name}
            style={{
              maxWidth: '100px',
              maxHeight: '60px',
              margin: '0 auto 10px',
              display: 'block'
            }}
          />
        )}
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {tenant.name}
        </div>
        {tenant.address && (
          <div style={{ fontSize: '11px', marginTop: '2px' }}>{tenant.address}</div>
        )}
        {tenant.phone && (
          <div style={{ fontSize: '11px', marginTop: '2px' }}>Tel: {tenant.phone}</div>
        )}
      </div>

      {/* Receipt Details */}
      <div style={{ marginBottom: '10px', fontSize: '11px' }}>
        <div>Receipt #: {receiptNumber}</div>
        <div>Date: {formattedDate}</div>
        <div>Cashier: {sale.user.full_name}</div>
        {sale.customer_name && <div>Customer: {sale.customer_name}</div>}
      </div>

      {/* Items */}
      <div style={{
        borderBottom: '2px dashed #000',
        paddingBottom: '10px',
        marginBottom: '10px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>ITEMS</div>
        {sale.sale_items.map((item, idx) => (
          <div key={idx} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.product.name}</span>
              <span>x{item.quantity}</span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingLeft: '10px',
              fontSize: '11px',
              color: '#666'
            }}>
              <span>@ {currency} {item.price.toFixed(2)}</span>
              <span>{currency} {item.subtotal.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{
        borderBottom: '2px dashed #000',
        paddingBottom: '10px',
        marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>Subtotal:</span>
          <span>{currency} {sale.subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span>VAT ({((tenant.tax_rate || 0.16) * 100).toFixed(0)}%):</span>
          <span>{currency} {sale.tax.toFixed(2)}</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontWeight: 'bold',
          fontSize: '12px',
          borderTop: '1px solid #000',
          paddingTop: '5px',
          marginTop: '5px'
        }}>
          <span>TOTAL:</span>
          <span>{currency} {sale.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment */}
      {sale.payment_method && (
        <div style={{ marginBottom: '10px', fontSize: '11px' }}>
          Payment Method: {sale.payment_method}
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        fontSize: '11px',
        marginTop: '10px'
      }}>
        <div>Thank you for your business!</div>
        <div style={{ marginTop: '5px' }}>Powered by mBiz</div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .receipt-container,
          .receipt-container * {
            visibility: visible;
          }

          .receipt-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            margin: 0;
            padding: 10mm;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
          }

          nav, header, footer, .no-print,
          button, .bg-green-50, .bg-red-50,
          .mobile-nav, .sidebar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
