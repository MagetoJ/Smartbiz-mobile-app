# Receipt Management Refactoring Guide

## Overview
This guide documents the refactoring of receipt management from POS to Sales History, improving the checkout flow and centralizing customer data management.

## ✅ Completed Backend Changes

### 1. Database Migration
- ✅ Added `customer_phone` VARCHAR(20) field to sales table
- ✅ Added `whatsapp_sent` BOOLEAN tracking field
- ✅ Added `email_sent` BOOLEAN tracking field
- ✅ Migration executed successfully

### 2. API Endpoints Created
```python
PUT /sales/{sale_id}/customer
POST /sales/{sale_id}/send-email
POST /sales/{sale_id}/mark-whatsapp-sent
```

### 3. Schema Updates
- ✅ Added `SaleCustomerUpdate` schema
- ✅ Updated `Sale` model with receipt tracking fields
- ✅ Removed receipt delivery validation from `create_sale` endpoint

### 4. Simplified Sale Creation
- ✅ Removed customer field requirements
- ✅ Removed automatic email sending logic
- ✅ Sales complete instantly without waiting for email delivery

## ✅ Completed Frontend API Changes

### Updated Interfaces in `frontend/src/lib/api.ts`
```typescript
export interface Sale {
  // ... existing fields ...
  customer_phone?: string;
  whatsapp_sent?: boolean;
  email_sent?: boolean;
}
```

### New API Methods
```typescript
api.updateSaleCustomer(token, saleId, data)
api.sendEmailReceipt(token, saleId)
api.markWhatsAppSent(token, saleId)
```

## 🔄 Required Frontend Changes

### 1. Simplify POS.tsx (frontend/src/pages/POS.tsx)

**Remove these state variables:**
```typescript
const [customerName, setCustomerName] = useState('');
const [customerEmail, setCustomerEmail] = useState('');
const [customerPhone, setCustomerPhone] = useState('');
const [emailError, setEmailError] = useState('');
```

**Simplify the handleCheckout function:**
```typescript
const handleCheckout = async () => {
  if (cartItems.length === 0) {
    setErrorMessage('Cart is empty');
    return;
  }

  setIsProcessing(true);
  setErrorMessage('');

  try {
    const saleData: SaleCreate = {
      payment_method: paymentMethod,
      notes: notes || undefined,
      items: cartItems.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity
      }))
    };

    const completedSale = await api.createSale(token, saleData);
    
    setSuccessMessage(`Sale #${completedSale.id} completed successfully!`);
    
    // Reset cart
    setCartItems([]);
    setPaymentMethod('cash');
    setNotes('');
    
    setTimeout(() => setSuccessMessage(''), 3000);
  } catch (error: any) {
    setErrorMessage(error.message || 'Failed to complete sale');
  } finally {
    setIsProcessing(false);
  }
};
```

**Remove customer input fields from JSX:**
- Remove the entire customer information section (Name, Phone, Email inputs)
- Keep only Payment Method and Notes fields

### 2. Enhance SalesHistory.tsx (frontend/src/pages/SalesHistory.tsx)

**Add customer management UI to each sale row:**

```typescript
// Add state for managing customer info
const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
const [customerName, setCustomerName] = useState('');
const [customerEmail, setCustomerEmail] = useState('');
const [customerPhone, setCustomerPhone] = useState('');
const [sendingEmail, setSendingEmail] = useState<number | null>(null);

// Function to update customer info
const handleUpdateCustomer = async (saleId: number) => {
  try {
    await api.updateSaleCustomer(token, saleId, {
      customer_name: customerName || undefined,
      customer_email: customerEmail || undefined,
      customer_phone: customerPhone || undefined,
    });
    
    // Refresh sales list
    await fetchSales();
    setEditingSaleId(null);
    // Show success message
  } catch (error: any) {
    // Show error message
  }
};

// Function to send email receipt
const handleSendEmail = async (saleId: number) => {
  setSendingEmail(saleId);
  try {
    await api.sendEmailReceipt(token, saleId);
    // Refresh sales to show updated email_sent status
    await fetchSales();
    // Show success message
  } catch (error: any) {
    // Show error message
  } finally {
    setSendingEmail(null);
  }
};

// Function to send WhatsApp receipt
const handleSendWhatsApp = async (sale: Sale) => {
  if (!sale.customer_phone) {
    // Show error: phone number required
    return;
  }
  
  const receiptText = generateReceiptText(sale, tenant);
  const whatsappUrl = generateWhatsAppLink(sale.customer_phone, receiptText);
  window.open(whatsappUrl, '_blank');
  
  // Mark as sent
  await api.markWhatsAppSent(token, sale.id);
  await fetchSales();
};
```

**Add UI components for each sale:**

```tsx
{/* Customer Info Section */}
<div className="mt-4 p-4 bg-gray-50 rounded-lg">
  <div className="flex justify-between items-center mb-2">
    <h4 className="font-medium">Customer Information</h4>
    {editingSaleId === sale.id ? (
      <Button size="sm" onClick={() => handleUpdateCustomer(sale.id)}>
        Save
      </Button>
    ) : (
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => {
          setEditingSaleId(sale.id);
          setCustomerName(sale.customer_name || '');
          setCustomerEmail(sale.customer_email || '');
          setCustomerPhone(sale.customer_phone || '');
        }}
      >
        Edit
      </Button>
    )}
  </div>
  
  {editingSaleId === sale.id ? (
    <div className="space-y-2">
      <Input
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />
      <Input
        type="email"
        placeholder="Email"
        value={customerEmail}
        onChange={(e) => setCustomerEmail(e.target.value)}
      />
      <Input
        type="tel"
        placeholder="Phone (e.g., +254712345678)"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
      />
    </div>
  ) : (
    <div className="space-y-1 text-sm">
      <p><strong>Name:</strong> {sale.customer_name || 'Not provided'}</p>
      <p><strong>Email:</strong> {sale.customer_email || 'Not provided'}</p>
      <p><strong>Phone:</strong> {sale.customer_phone || 'Not provided'}</p>
    </div>
  )}
</div>

{/* Receipt Actions Section */}
<div className="mt-4 flex gap-2">
  <Button
    size="sm"
    disabled={!sale.customer_email || sendingEmail === sale.id}
    onClick={() => handleSendEmail(sale.id)}
  >
    {sale.email_sent && <Badge variant="success" className="mr-2">✓</Badge>}
    {sendingEmail === sale.id ? 'Sending...' : 'Send Email Receipt'}
  </Button>
  
  <Button
    size="sm"
    variant="outline"
    disabled={!sale.customer_phone}
    onClick={() => handleSendWhatsApp(sale)}
  >
    {sale.whatsapp_sent && <Badge variant="success" className="mr-2">✓</Badge>}
    Send WhatsApp Receipt
  </Button>
</div>
```

## Testing Checklist

- [ ] Create a sale from POS without customer info - should complete instantly
- [ ] View sale in Sales History
- [ ] Edit customer information for the sale
- [ ] Send email receipt (with valid email)
- [ ] Verify email_sent badge appears
- [ ] Send WhatsApp receipt (with valid phone)
- [ ] Verify whatsapp_sent badge appears
- [ ] Verify receipt text is correct
- [ ] Test with multiple sales

## Benefits

1. **Faster Checkout**: No mandatory customer fields, sales complete instantly
2. **Centralized Management**: All customer data managed in one place
3. **Better Tracking**: Clear visibility of which receipts have been sent
4. **Flexibility**: Send receipts at any time, not just at checkout
5. **Reduced Clutter**: POS focused on products and payment

## Migration Notes

- Existing sales will have customer_name but may lack phone/email fields
- All new fields default to NULL/FALSE, so no data migration needed
- Old sales can have customer info added retroactively from Sales History
