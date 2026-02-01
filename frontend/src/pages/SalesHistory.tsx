import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, Sale } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ProductImage } from '@/components/ProductImage';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DollarSign, ShoppingCart, ChevronDown, ChevronUp, Package, Mail, MessageCircle, Edit, Save, X, CheckCircle, AlertCircle } from 'lucide-react';
import { generateReceiptText, generateWhatsAppLink } from '@/lib/receiptText';

interface SalesSummary {
  total_revenue: number;
  total_sales: number;
}

type DateRange = 'today' | '30days' | 'quarter';

interface DateRangeOption {
  value: DateRange;
  label: string;
  days: number;
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '30days', label: 'Last 30 Days', days: 30 },
  { value: 'quarter', label: 'Last 3 Months', days: 90 },
];

const DEFAULT_DATE_RANGE: DateRange = '30days';
const STORAGE_KEY = 'sales-history-date-range';

export function SalesHistory() {
  const { token, user, tenant } = useAuth();
  const isStaff = user?.role === 'staff';

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  
  // Customer management state
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Date range state with localStorage persistence
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as DateRange) || DEFAULT_DATE_RANGE;
  });

  // Derived state for selected option
  const selectedOption = DATE_RANGE_OPTIONS.find(
    opt => opt.value === selectedDateRange
  ) || DATE_RANGE_OPTIONS[1];

  const toggleExpand = (saleId: number) => {
    setExpandedSaleId(expandedSaleId === saleId ? null : saleId);
  };

  const handleDateRangeChange = (range: DateRange) => {
    setSelectedDateRange(range);
    localStorage.setItem(STORAGE_KEY, range);
  };

  // Fetch data function
  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [salesData, summaryData] = await Promise.all([
        api.getSales(token, selectedOption.days),
        api.getSalesSummary(token, selectedOption.days),
      ]);
      setSales(salesData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to fetch sales data:', error);
      setErrorMessage('Failed to load sales data. Please try again.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Customer management handlers
  const handleUpdateCustomer = async (saleId: number) => {
    if (!token) return;
    try {
      await api.updateSaleCustomer(token, saleId, {
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        customer_phone: customerPhone || undefined,
      });

      // Refresh sales data
      await fetchData();
      setEditingSaleId(null);
      setSuccessMessage('Customer information updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to update customer info');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleSendEmail = async (saleId: number) => {
    if (!token) return;
    setSendingEmail(saleId);
    try {
      await api.sendEmailReceipt(token, saleId);

      // Refresh sales to show updated email_sent status
      await fetchData();
      setSuccessMessage('Email receipt sent successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to send email receipt');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setSendingEmail(null);
    }
  };

  const handleSendWhatsApp = async (sale: Sale) => {
    if (!token || !sale.customer_phone || !tenant) return;

    try {
      const receiptText = generateReceiptText(sale, tenant);
      const whatsappUrl = generateWhatsAppLink(sale.customer_phone, receiptText);
      window.open(whatsappUrl, '_blank');

      // Mark as sent
      await api.markWhatsAppSent(token, sale.id);
      await fetchData();
      setSuccessMessage('WhatsApp receipt opened - marked as sent!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to send WhatsApp receipt');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Auto-fetch when date range changes or on mount
  useEffect(() => {
    fetchData();
  }, [token, selectedDateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="font-medium text-sm flex-1">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="font-medium text-sm flex-1">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header with Date Range Filter */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
            {isStaff ? 'My Sales History' : 'Sales History'}
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            View and track all sales transactions
          </p>
        </div>

        {/* Date Range Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          {DATE_RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={selectedDateRange === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDateRangeChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Total Revenue Card */}
          <Card className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                    {formatCurrency(summary.total_revenue)}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
                    <DollarSign className="w-4 h-4" />
                    <span>{selectedOption.label}</span>
                  </div>
                </div>
                <div className="bg-green-100 text-green-600 rounded-lg p-3">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Sales Card */}
          <Card className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Sales</p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                    {summary.total_sales.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
                    <ShoppingCart className="w-4 h-4" />
                    <span>{summary.total_sales} {summary.total_sales === 1 ? 'transaction' : 'transactions'}</span>
                  </div>
                </div>
                <div className="bg-blue-100 text-blue-600 rounded-lg p-3">
                  <ShoppingCart className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Desktop Sales Table */}
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">
            Sales Transactions ({sales.length})
          </CardTitle>
          <p className="text-sm text-gray-600 mt-1">
            Showing results for {selectedOption.label}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground font-medium">
                <tr>
                  <th className="w-[50px]"></th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Branch</th>
                  <th className="p-4">Staff</th>
                  <th className="p-4 text-center">Items</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Payment</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <React.Fragment key={sale.id}>
                    <tr 
                      className={`border-t hover:bg-muted/50 cursor-pointer transition-colors ${expandedSaleId === sale.id ? 'bg-muted/50' : ''}`}
                      onClick={() => toggleExpand(sale.id)}
                    >
                      <td className="p-4 text-center">
                        {expandedSaleId === sale.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        )}
                      </td>
                      <td className="p-4">{formatDate(sale.created_at)}</td>
                      <td className="p-4 font-medium">{sale.customer_name || 'Walk-in Customer'}</td>
                      <td className="p-4">
                        {sale.branch ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{sale.branch.name}</span>
                            <span className="text-xs text-muted-foreground">{sale.branch.subdomain}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500 italic">Main Location</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{sale.user.full_name}</span>
                          <span className="text-xs text-muted-foreground">@{sale.user.username}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="text-xs text-muted-foreground">
                          {sale.sale_items.length} items
                        </div>
                      </td>
                      <td className="p-4 text-right font-bold">{formatCurrency(sale.total)}</td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {sale.payment_method}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          sale.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {sale.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                    {expandedSaleId === sale.id && (
                      <tr className="bg-muted/30 border-t border-b">
                        <td colSpan={9} className="p-0">
                          <div className="p-4 md:p-6 space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                              <Package className="h-5 w-5 text-gray-500" />
                              <h3 className="font-semibold text-gray-900">Transaction Details</h3>
                            </div>
                            
                            <div className="bg-white rounded-lg border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                  <tr>
                                    <th className="p-3 text-left">Item</th>
                                    <th className="p-3 text-center">Quantity</th>
                                    <th className="p-3 text-right">Unit Price</th>
                                    <th className="p-3 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {sale.sale_items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50">
                                      <td className="p-3">
                                        <div className="flex items-center gap-3">
                                          <ProductImage
                                            imageUrl={item.product.image_url}
                                            productName={item.product.name}
                                            size="thumb"
                                            className="w-10 h-10 object-cover rounded-md border"
                                          />
                                          <div>
                                            <p className="font-medium text-gray-900">{item.product.name}</p>
                                            <p className="text-xs text-gray-500">{item.product.sku}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className="font-medium">{item.quantity}</span>
                                        <span className="text-xs text-gray-500 ml-1">{item.product.unit}</span>
                                      </td>
                                      <td className="p-3 text-right text-gray-600">
                                        {formatCurrency(item.price)}
                                      </td>
                                      <td className="p-3 text-right font-medium">
                                        {formatCurrency(item.subtotal)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t font-medium">
                                  <tr>
                                    <td colSpan={3} className="p-3 text-right text-gray-600">Subtotal</td>
                                    <td className="p-3 text-right">{formatCurrency(sale.subtotal)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="p-3 text-right text-gray-600">Tax</td>
                                    <td className="p-3 text-right">{formatCurrency(sale.tax)}</td>
                                  </tr>
                                  <tr className="border-t border-gray-200">
                                    <td colSpan={3} className="p-3 text-right font-bold text-gray-900">Total</td>
                                    <td className="p-3 text-right font-bold text-primary-600">{formatCurrency(sale.total)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                            
                            {sale.notes && (
                              <div className="bg-yellow-50 p-4 rounded-md border border-yellow-100 text-sm">
                                <span className="font-semibold text-yellow-800">Notes: </span>
                                <span className="text-yellow-700">{sale.notes}</span>
                              </div>
                            )}

                            {/* Customer Information & Receipt Management */}
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  Customer & Receipt Management
                                </h4>
                                {editingSaleId === sale.id ? (
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleUpdateCustomer(sale.id)}>
                                      <Save className="h-3 w-3 mr-1" /> Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingSaleId(null)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => {
                                    setEditingSaleId(sale.id);
                                    setCustomerName(sale.customer_name || '');
                                    setCustomerEmail(sale.customer_email || '');
                                    setCustomerPhone(sale.customer_phone || '');
                                  }}>
                                    <Edit className="h-3 w-3 mr-1" /> Edit Info
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
                                    placeholder="Email Address"
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
                                <div className="space-y-1 text-sm mb-3">
                                  <p><strong>Name:</strong> {sale.customer_name || <span className="text-gray-500 italic">Not provided</span>}</p>
                                  <p><strong>Email:</strong> {sale.customer_email || <span className="text-gray-500 italic">Not provided</span>}</p>
                                  <p><strong>Phone:</strong> {sale.customer_phone || <span className="text-gray-500 italic">Not provided</span>}</p>
                                </div>
                              )}
                              
                              <div className="flex gap-2 mt-3">
                                <Button
                                  size="sm"
                                  disabled={!sale.customer_email || sendingEmail === sale.id}
                                  onClick={() => handleSendEmail(sale.id)}
                                  className="flex items-center gap-1"
                                >
                                  {sale.email_sent && <CheckCircle className="h-3 w-3 text-green-600" />}
                                  <Mail className="h-3 w-3" />
                                  {sendingEmail === sale.id ? 'Sending...' : 'Send Email'}
                                </Button>
                                
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!sale.customer_phone}
                                  onClick={() => handleSendWhatsApp(sale)}
                                  className="flex items-center gap-1"
                                >
                                  {sale.whatsapp_sent && <CheckCircle className="h-3 w-3 text-green-600" />}
                                  <MessageCircle className="h-3 w-3" />
                                  WhatsApp
                                </Button>
                              </div>
                              
                              {(sale.email_sent || sale.whatsapp_sent) && (
                                <div className="mt-2 flex gap-2">
                                  {sale.email_sent && (
                                    <Badge variant="success" className="text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Email Sent
                                    </Badge>
                                  )}
                                  {sale.whatsapp_sent && (
                                    <Badge variant="success" className="text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      WhatsApp Sent
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      No sales records found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Sales Cards */}
      <div className="lg:hidden space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold text-gray-900">
            Sales Transactions ({sales.length})
          </h2>
        </div>
        <p className="text-sm text-gray-600 px-1">
          Showing results for {selectedOption.label}
        </p>
        
        {sales.map((sale) => (
          <Card key={sale.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {sale.customer_name || 'Walk-in Customer'}
                    </h3>
                    <Badge variant={sale.status === 'completed' ? 'success' : 'warning'}>
                      {sale.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{formatDate(sale.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary-600">{formatCurrency(sale.total)}</p>
                  <Badge variant="secondary" className="text-xs mt-1">{sale.payment_method}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-3 pb-3 border-b">
                <div>
                  <p className="text-gray-600">Branch</p>
                  <p className="font-medium text-gray-900">
                    {sale.branch ? sale.branch.name : 'Main Location'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Staff</p>
                  <p className="font-medium text-gray-900">{sale.user.full_name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Items</p>
                  <p className="font-medium text-gray-900">{sale.sale_items.length} items</p>
                </div>
                <div>
                  <p className="text-gray-600">Subtotal</p>
                  <p className="font-medium text-gray-900">{formatCurrency(sale.subtotal)}</p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleExpand(sale.id)}
                className="w-full"
              >
                {expandedSaleId === sale.id ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    View Details
                  </>
                )}
              </Button>

              {/* Expanded Details for Mobile */}
              {expandedSaleId === sale.id && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Items
                    </h4>
                    <div className="space-y-3">
                      {sale.sale_items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                          <ProductImage
                            imageUrl={item.product.image_url}
                            productName={item.product.name}
                            size="thumb"
                            className="w-12 h-12 object-cover rounded-md border flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.product.name}</p>
                            <p className="text-xs text-gray-500">{item.product.sku}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              {item.quantity} {item.product.unit} × {formatCurrency(item.price)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax</span>
                      <span className="font-medium">{formatCurrency(sale.tax)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t pt-2">
                      <span>Total</span>
                      <span className="text-primary-600">{formatCurrency(sale.total)}</span>
                    </div>
                  </div>

                  {sale.notes && (
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                      <p className="text-sm font-semibold text-yellow-800">Notes:</p>
                      <p className="text-sm text-yellow-700 mt-1">{sale.notes}</p>
                    </div>
                  )}

                  {/* Customer & Receipt Management */}
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Customer Info
                      </h4>
                      {editingSaleId === sale.id ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateCustomer(sale.id)}>
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingSaleId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingSaleId(sale.id);
                          setCustomerName(sale.customer_name || '');
                          setCustomerEmail(sale.customer_email || '');
                          setCustomerPhone(sale.customer_phone || '');
                        }}>
                          <Edit className="h-3 w-3 mr-1" /> Edit
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
                          placeholder="Email Address"
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
                      <div className="space-y-1 text-sm mb-3">
                        <p><strong>Name:</strong> {sale.customer_name || <span className="text-gray-500 italic">Not provided</span>}</p>
                        <p><strong>Email:</strong> {sale.customer_email || <span className="text-gray-500 italic">Not provided</span>}</p>
                        <p><strong>Phone:</strong> {sale.customer_phone || <span className="text-gray-500 italic">Not provided</span>}</p>
                      </div>
                    )}
                    
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        disabled={!sale.customer_email || sendingEmail === sale.id}
                        onClick={() => handleSendEmail(sale.id)}
                        className="flex-1"
                      >
                        {sale.email_sent && <CheckCircle className="h-3 w-3 mr-1 text-green-600" />}
                        <Mail className="h-3 w-3 mr-1" />
                        {sendingEmail === sale.id ? 'Sending...' : 'Email'}
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!sale.customer_phone}
                        onClick={() => handleSendWhatsApp(sale)}
                        className="flex-1"
                      >
                        {sale.whatsapp_sent && <CheckCircle className="h-3 w-3 mr-1 text-green-600" />}
                        <MessageCircle className="h-3 w-3 mr-1" />
                        WhatsApp
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        
        {sales.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>No sales records found for this period.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
