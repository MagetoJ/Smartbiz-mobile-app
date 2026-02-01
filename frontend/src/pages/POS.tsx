import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/contexts/ProductContext';
import { api, Product, Sale, SaleCreate, Customer } from '@/lib/api';
import { Receipt } from '@/components/Receipt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Minus, Trash, ShoppingCart, CreditCard, AlertCircle, CheckCircle, X, RefreshCw, Camera, History } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ProductImage } from '@/components/ProductImage';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { printerService } from '@/lib/printerService';

interface CartItemWithPrice {
  product: Product;
  quantity: number;
  customPrice?: number;  // Optional price override
}

export function POS() {
  const navigate = useNavigate();
  const { token, tenant } = useAuth();
  const { products: allProducts, isRefreshing, refreshProducts } = useProducts();

  // Filter products for POS: available and has stock (or is a service)
  const products = allProducts.filter((p: Product) => p.is_available && (p.is_service || p.quantity > 0));

  const [cart, setCart] = useState<CartItemWithPrice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditCustomerSearch, setCreditCustomerSearch] = useState('');
  const [creditCustomers, setCreditCustomers] = useState<Customer[]>([]);
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showConfirmSale, setShowConfirmSale] = useState(false);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    if (!token) return;

    try {
      // Use new search endpoint (searches barcode first, then SKU)
      const product = await api.searchProductByBarcode(token, barcode);

      addToCart(product);
      setSuccessMessage(`✅ ${product.name} added to cart`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        setErrorMessage(`❌ Product with barcode "${barcode}" not found`);
      } else {
        setErrorMessage(`❌ Error: ${error.message || 'Unknown error'}`);
      }
      setTimeout(() => setErrorMessage(''), 3000);
    }

    setShowScanner(false);
  }, [token]);

  // Search customers when Credit is selected
  useEffect(() => {
    if (paymentMethod !== 'Credit' || !token) return;
    const timer = setTimeout(async () => {
      try {
        const customers = await api.getCustomers(token, creditCustomerSearch || undefined);
        setCreditCustomers(customers);
      } catch (err) {
        console.error('Failed to fetch customers:', err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [paymentMethod, creditCustomerSearch, token]);

  // Auto-print receipt when a sale is completed (desktop only)
  useEffect(() => {
    if (completedSale && tenant) {
      // Only auto-print on desktop (lg breakpoint = 1024px)
      if (window.innerWidth >= 1024) {
        setTimeout(async () => {
          const result = await printerService.smartPrint(
            completedSale,
            tenant,
            () => window.print() // Fallback to browser print
          );
          
          if (!result.usedFallback) {
            // Direct printing succeeded
            setSuccessMessage(`✓ ${result.message}`);
            setTimeout(() => {
              setSuccessMessage('');
              setCompletedSale(null); // Auto-close receipt after successful print
            }, 2000);
          }
          // If fallback was used, browser print dialog will handle it
        }, 150);
      }
    }
  }, [completedSale, tenant]);

  // Clear receipt after print dialog closes
  useEffect(() => {
    const handleAfterPrint = () => setCompletedSale(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (!product.is_service && existing.quantity >= product.quantity) return prev;
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setShowCart(true);
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          if (!item.product.is_service && newQuantity > item.product.quantity) return item;
          return { ...item, quantity: newQuantity };
        }
        return item;
      });
    });
  };

  const handlePriceChange = (productId: number, newPrice: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const sellingPrice = item.product.selling_price || 0;

        // Warning: Price below cost (but allow it)
        if (item.product.base_cost && newPrice < item.product.base_cost) {
          setErrorMessage(`⚠️ Warning: Price (${formatCurrency(newPrice)}) is below cost (${formatCurrency(item.product.base_cost)})`);
          setTimeout(() => setErrorMessage(''), 4000);
        }

        // Set custom price (or undefined if matches standard price)
        if (Math.abs(newPrice - sellingPrice) < 0.01) {
          return { ...item, customPrice: undefined };  // Reset to standard
        } else {
          return { ...item, customPrice: newPrice };
        }
      }
      return item;
    }));
  };

  const resetPrice = (productId: number) => {
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, customPrice: undefined } : item
    ));
  };

  const calculateTotal = () => {
    // VAT-INCLUSIVE CALCULATION
    // Product prices already include VAT, so we extract it
    const total = cart.reduce((sum, item) => {
      const price = item.customPrice ?? item.product.selling_price ?? 0;
      return sum + (price * item.quantity);
    }, 0);

    const taxRate = tenant?.tax_rate || 0.16;
    // Extract VAT from the total price
    const subtotal = total / (1 + taxRate);
    const tax = total - subtotal;

    // Calculate total variance
    const totalVariance = cart.reduce((sum, item) => {
      if (item.customPrice !== undefined) {
        const sellingPrice = item.product.selling_price ?? 0;
        return sum + ((sellingPrice - item.customPrice) * item.quantity);
      }
      return sum;
    }, 0);

    return { subtotal, tax, total, taxRate, variance: totalVariance };
  };

  const handleCheckout = () => {
    setShowCart(false);  // Close mobile cart first to prevent z-index conflicts
    setShowConfirmSale(true);
  };

  const processCheckout = async () => {
    if (loading) return;  // Prevent double-processing from rapid taps
    setLoading(true);     // Set loading immediately to block duplicate submissions
    setShowConfirmSale(false);

    if (!token || cart.length === 0) {
      setLoading(false);
      return;
    }
    if (paymentMethod === 'Credit' && !creditCustomer) {
      setErrorMessage('Please select a customer for Credit payment');
      setLoading(false);
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    try {
      const saleData: SaleCreate = {
        payment_method: paymentMethod,
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          custom_price: item.customPrice  // Include custom price if set
        })),
        ...(paymentMethod === 'Credit' && creditCustomer ? {
          customer_id: creditCustomer.id,
          due_date: creditDueDate
        } : {})
      };

      const newSale = await api.createSale(token, saleData);
      setCompletedSale(newSale);

      // Clear cart
      setCart([]);
      setShowCart(false);

      // Refresh products via context
      await refreshProducts();

      // Show success message
      const { total } = calculateTotal();
      setSuccessMessage(`Sale #${newSale.id} completed! Total: ${formatCurrency(total)}. Add customer info from Sales History to send receipt.`);

      // Auto-hide success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error: any) {
      console.error('Checkout failed:', error);
      setErrorMessage(error.message || 'Checkout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { subtotal, tax, total, taxRate, variance } = calculateTotal();
  const taxPercentage = (taxRate * 100).toFixed(1);

  return (
    <div className="space-y-4 lg:space-y-0">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3 lg:col-span-2">
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3 lg:col-span-2">
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

      {/* Header - Mobile */}
      <div className="lg:hidden space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
            <p className="text-sm text-gray-600">Select products to add to cart</p>
          </div>
          {cart.length > 0 && (
            <Button
              onClick={() => setShowCart(!showCart)}
              className="relative"
            >
              <ShoppingCart className="w-5 h-5" />
              <Badge variant="danger" className="absolute -top-2 -right-2">
                {cart.length}
              </Badge>
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/sales-history')}
            title="Sales History"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={refreshProducts}
            disabled={isRefreshing}
            title="Refresh products"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowScanner(true)}
            title="Scan barcode"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex lg:gap-6 lg:h-[calc(100vh-12rem)]">
        {/* Product Selection Area */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Point of Sale</h1>
            <div className="flex gap-2">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search products..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/sales-history')}
                title="Sales History"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={refreshProducts}
                disabled={isRefreshing}
                title="Refresh products"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-4">
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="cursor-pointer hover:border-primary-500 hover:shadow-lg transition-all active:scale-95"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-4">
                  <ProductImage
                    imageUrl={product.image_url}
                    productName={product.name}
                    size="thumb"
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-bold text-lg text-gray-900">{product.name}</div>
                    {product.is_service && (
                      <Badge variant="info" className="text-xs">Service</Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">{product.sku}</div>
                  <div className="flex justify-between items-end">
                    <span className="font-bold text-lg text-primary-600">
                      {formatCurrency(product.selling_price ?? 0)}
                    </span>
                    {product.is_service ? (
                      <Badge variant="info">Service</Badge>
                    ) : (
                      <Badge variant={product.quantity > 10 ? 'success' : 'warning'}>
                        Stock: {product.quantity}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="font-medium">No products available for sale</p>
                <p className="text-sm mt-2">Products need to be Active and have stock &gt; 0</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshProducts}
                  className="mt-4"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Products
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Cart Area - Desktop */}
        <Card className="w-[28rem] flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center text-xl">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Current Order
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {/* Scrollable: Cart Items + Customer Forms */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Cart Items */}
              <div className="space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                    <p>Cart is empty</p>
                    <p className="text-sm mt-1">Click on products to add them</p>
                  </div>
                ) : (
                  cart.map((item) => {
                    const effectivePrice = item.customPrice ?? item.product.selling_price ?? 0;
                    const isCustomPrice = item.customPrice !== undefined;
                    const variance = isCustomPrice ? (item.product.selling_price ?? 0) - effectivePrice : 0;

                    return (
                      <div key={item.product.id} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 pr-2">
                            <div className="font-medium text-gray-900">{item.product.name}</div>
                            <div className="text-xs text-gray-500">{item.product.sku}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">
                              {formatCurrency(effectivePrice * item.quantity)}
                            </div>
                            {isCustomPrice && (
                              <div className="text-xs text-gray-500 line-through">
                                {formatCurrency((item.product.selling_price ?? 0) * item.quantity)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Price editing section */}
                        <div className="mb-2">
                          <label className="text-xs text-gray-600">Price per unit:</label>
                          <div className="flex items-center gap-1 mt-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={effectivePrice || 0}
                              onChange={(e) => handlePriceChange(item.product.id, parseFloat(e.target.value) || 0)}
                              className={`h-8 text-sm ${
                                item.product.base_cost && effectivePrice < item.product.base_cost
                                  ? 'border-orange-400 focus:ring-orange-500'
                                  : ''
                              }`}
                            />
                            {isCustomPrice && (
                              <div className="flex items-center gap-1">
                                <span className={`text-xs ${variance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {variance >= 0 ? '-' : '+'}{formatCurrency(Math.abs(variance))}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetPrice(item.product.id)}
                                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                                >
                                  Reset
                                </Button>
                              </div>
                            )}
                          </div>
                          {item.product.base_cost && effectivePrice < item.product.base_cost && (
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="warning" className="text-xs">
                                ⚠️ Below cost ({formatCurrency(item.product.base_cost)})
                              </Badge>
                            </div>
                          )}
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(item.product.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(item.product.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeFromCart(item.product.id)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* Fixed at Bottom: Payment + Totals + Complete Button */}
            {cart.length > 0 && (
              <div className="border-t p-4 space-y-4 bg-gray-50 flex-shrink-0">
                <select
                  className="w-full h-10 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  value={paymentMethod}
                  onChange={(e) => { setPaymentMethod(e.target.value); setCreditCustomer(null); }}
                >
                  <option value="Cash">Cash</option>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Card">Card</option>
                  <option value="Credit">Credit</option>
                </select>

                {paymentMethod === 'Credit' && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                      <input
                        type="text"
                        placeholder="Search customers..."
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={creditCustomer ? creditCustomer.name : creditCustomerSearch}
                        onChange={(e) => { setCreditCustomerSearch(e.target.value); setCreditCustomer(null); }}
                      />
                      {!creditCustomer && creditCustomers.length > 0 && (
                        <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                          {creditCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => { setCreditCustomer(c); setCreditCustomerSearch(''); }}
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                      {!creditCustomer && creditCustomerSearch && creditCustomers.length === 0 && (
                        <p className="text-xs text-gray-500 mt-1">No customers found</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-700">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  {variance > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Price Discount</span>
                      <span>-{formatCurrency(variance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>VAT ({taxPercentage}%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t text-gray-900">
                    <span>Total</span>
                    <span className="text-primary-600">{formatCurrency(total)}</span>
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  size="lg" 
                  disabled={loading}
                  onClick={handleCheckout}
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  {loading ? 'Processing...' : `Complete Sale ${formatCurrency(total)}`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mobile Product Grid */}
      <div className="lg:hidden">
        {filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="font-medium">No products available for sale</p>
              <p className="text-sm mt-2">Products need to be Active and have stock &gt; 0</p>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshProducts}
                className="mt-4"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Products
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:border-primary-500 transition-all active:scale-95"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  <ProductImage
                    imageUrl={product.image_url}
                    productName={product.name}
                    size="thumb"
                    className="w-full h-24 object-cover rounded-lg mb-2"
                  />
                  <div className="flex items-start gap-1 mb-1">
                    <div className="font-semibold text-sm text-gray-900 line-clamp-2 flex-1">{product.name}</div>
                    {product.is_service && (
                      <Badge variant="info" className="text-[10px] px-1 py-0">Svc</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mb-2">{product.sku}</div>
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-base text-primary-600">
                      {formatCurrency(product.selling_price ?? 0)}
                    </span>
                    {product.is_service ? (
                      <Badge variant="info" className="text-xs">Service</Badge>
                    ) : (
                      <Badge variant={product.quantity > 10 ? 'success' : 'warning'} className="text-xs">
                        Stock: {product.quantity}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Cart - Using Desktop Structure */}
      {showCart && cart.length > 0 && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setShowCart(false)}>
          <Card
            className="absolute bottom-16 inset-x-0 rounded-t-2xl flex flex-col"
            style={{ height: 'calc(100vh - 5rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center text-lg">
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Current Order
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowCart(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              {/* Scrollable Cart Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {cart.map((item) => {
                  const effectivePrice = item.customPrice ?? item.product.selling_price ?? 0;
                  const isCustomPrice = item.customPrice !== undefined;
                  const variance = isCustomPrice ? (item.product.selling_price ?? 0) - effectivePrice : 0;

                  return (
                    <div key={item.product.id} className="bg-gray-50 p-4 rounded-lg shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 pr-2">
                          <div className="font-semibold text-base text-gray-900">{item.product.name}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            {formatCurrency(effectivePrice || 0)} × {item.quantity}
                          </div>
                          {isCustomPrice && (
                            <div className="text-xs text-orange-600 mt-1">
                              Custom price (was {formatCurrency(item.product.selling_price ?? 0)})
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg text-gray-900">
                            {formatCurrency(effectivePrice * item.quantity)}
                          </div>
                          {isCustomPrice && variance !== 0 && (
                            <div className={`text-xs mt-1 ${variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {variance > 0 ? '-' : '+'}{formatCurrency(Math.abs(variance * item.quantity))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Price editing section for mobile */}
                      <div className="mb-3 pb-3 border-b border-gray-200">
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Unit Price:</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={effectivePrice || 0}
                            onChange={(e) => handlePriceChange(item.product.id, parseFloat(e.target.value) || 0)}
                            className={`h-11 text-base flex-1 ${
                              item.product.base_cost && effectivePrice < item.product.base_cost
                                ? 'border-orange-400 focus:ring-orange-500'
                                : ''
                            }`}
                          />
                          {isCustomPrice && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetPrice(item.product.id)}
                              className="text-xs whitespace-nowrap touch-active"
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                        {item.product.base_cost && effectivePrice < item.product.base_cost && (
                          <div className="mt-2">
                            <Badge variant="warning" className="text-xs">
                              ⚠️ Below cost ({formatCurrency(item.product.base_cost)})
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 touch-active" 
                            onClick={() => updateQuantity(item.product.id, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-10 text-center text-base font-semibold">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-10 w-10 touch-active" 
                            onClick={() => updateQuantity(item.product.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 text-red-600 hover:text-red-700 hover:bg-red-50 touch-active" 
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Fixed Checkout Section - Same as Desktop */}
              <div className="border-t p-4 space-y-4 bg-gray-50 flex-shrink-0">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Payment Method</label>
                  <select
                    className="w-full h-12 px-4 py-2 border border-gray-300 rounded-lg bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    value={paymentMethod}
                    onChange={(e) => { setPaymentMethod(e.target.value); setCreditCustomer(null); }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="M-Pesa">M-Pesa</option>
                    <option value="Card">Card</option>
                    <option value="Credit">Credit</option>
                  </select>
                </div>

                {paymentMethod === 'Credit' && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                      <input
                        type="text"
                        placeholder="Search customers..."
                        className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        value={creditCustomer ? creditCustomer.name : creditCustomerSearch}
                        onChange={(e) => { setCreditCustomerSearch(e.target.value); setCreditCustomer(null); }}
                      />
                      {!creditCustomer && creditCustomers.length > 0 && (
                        <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                          {creditCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50"
                              onClick={() => { setCreditCustomer(c); setCreditCustomerSearch(''); }}
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                      {!creditCustomer && creditCustomerSearch && creditCustomers.length === 0 && (
                        <p className="text-xs text-gray-500 mt-1">No customers found</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-700">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  {variance > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Price Discount</span>
                      <span>-{formatCurrency(variance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>VAT ({taxPercentage}%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t text-gray-900">
                    <span>Total</span>
                    <span className="text-primary-600">{formatCurrency(total)}</span>
                  </div>
                </div>

                <Button 
                  className="w-full h-14 text-base touch-active" 
                  disabled={loading}
                  onClick={handleCheckout}
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  {loading ? 'Processing...' : `Complete Sale ${formatCurrency(total)}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sale Confirmation Modal */}
      {showConfirmSale && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
          onClick={() => setShowConfirmSale(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Complete Sale</h3>
                <p className="text-sm text-gray-600">Please confirm this transaction</p>
              </div>
            </div>

            {/* Sale Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items:</span>
                <span className="font-medium text-gray-900">{cart.length} product(s)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-medium text-gray-900">{paymentMethod}</span>
              </div>
              {paymentMethod === 'Credit' && creditCustomer && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-medium text-gray-900">{creditCustomer.name}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Total Amount:</span>
                <span className="font-bold text-xl text-primary-600">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmSale(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={processCheckout}
                disabled={loading}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {loading ? 'Processing...' : 'Confirm Sale'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />

      {/* Receipt Modal - Mobile */}
      {completedSale && tenant && (
        <div className="lg:hidden fixed inset-0 bg-white z-[70] flex flex-col print:hidden">
          <div className="flex items-center justify-between p-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold">Receipt</h2>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={async () => {
                  const result = await printerService.smartPrint(
                    completedSale,
                    tenant,
                    () => window.print()
                  );
                  if (!result.usedFallback) {
                    setSuccessMessage(`✓ ${result.message}`);
                    setTimeout(() => {
                      setSuccessMessage('');
                      setCompletedSale(null);
                    }, 2000);
                  }
                }}
              >
                Print
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCompletedSale(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <Receipt sale={completedSale} />
          </div>
        </div>
      )}

      {/* Receipt - Desktop (hidden, for print only) */}
      <div className="hidden print:block">
        {completedSale && <Receipt sale={completedSale} />}
      </div>
    </div>
  );
}
