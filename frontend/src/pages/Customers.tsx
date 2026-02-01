import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, Customer, CustomerCreate, CreditTransactionResponse, PaymentCreate, PaymentResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, Plus, X, User, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function Customers() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBalance, setFilterBalance] = useState<boolean | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<'credit' | 'payments'>('credit');
  const [creditTransactions, setCreditTransactions] = useState<CreditTransactionResponse[]>([]);
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Create form state
  const [createForm, setCreateForm] = useState<CustomerCreate>({ name: '' });

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentCreate>({
    credit_transaction_id: 0,
    amount: 0,
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
  });

  const fetchCustomers = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params: [string, string | undefined, boolean | undefined] = [token, searchTerm || undefined, filterBalance ?? undefined];
      const data = await api.getCustomers(...params);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      setErrorMessage('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [token, searchTerm, filterBalance]);

  const fetchCustomerDetails = async (customer: Customer) => {
    if (!token) return;
    setSelectedCustomer(customer);
    setActiveTab('credit');
    try {
      const [credit, pays] = await Promise.all([
        api.getCustomerCredit(token, customer.id),
        api.getCustomerPayments(token, customer.id)
      ]);
      setCreditTransactions(credit);
      setPayments(pays);
    } catch (err) {
      console.error('Failed to fetch customer details:', err);
    }
  };

  const handleCreate = async () => {
    if (!token || !createForm.name.trim()) return;
    try {
      await api.createCustomer(token, createForm);
      setShowCreateModal(false);
      setCreateForm({ name: '' });
      setSuccessMessage('Customer created successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchCustomers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create customer');
    }
  };

  const handleRecordPayment = async () => {
    if (!token || !selectedCustomer) return;
    try {
      await api.recordPayment(token, selectedCustomer.id, paymentForm);
      setShowPaymentForm(false);
      setPaymentForm({ credit_transaction_id: 0, amount: 0, payment_method: 'Cash', payment_date: new Date().toISOString().split('T')[0] });
      setSuccessMessage('Payment recorded successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
      // Refresh data
      fetchCustomers();
      const [credit, pays] = await Promise.all([
        api.getCustomerCredit(token, selectedCustomer.id),
        api.getCustomerPayments(token, selectedCustomer.id)
      ]);
      setCreditTransactions(credit);
      setPayments(pays);
      // Update selected customer balance
      const updated = await api.getCustomer(token, selectedCustomer.id);
      setSelectedCustomer(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record payment');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700';
      case 'partially_paid': return 'bg-blue-100 text-blue-700';
      case 'overdue': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partially_paid': return 'Partial';
      case 'overdue': return 'Overdue';
      default: return 'Pending';
    }
  };

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-600">Manage customers and credit accounts</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or email..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterBalance === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBalance(null)}
          >All</Button>
          <Button
            variant={filterBalance === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBalance(true)}
          >Has Balance</Button>
          <Button
            variant={filterBalance === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBalance(false)}
          >No Balance</Button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Create Customer</CardTitle>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input
                  value={createForm.email || ''}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <Input
                  value={createForm.phone || ''}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="+254 xxx xxx xxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit (optional)</label>
                <Input
                  type="number"
                  min="0"
                  value={createForm.credit_limit ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, credit_limit: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <Input
                  value={createForm.notes || ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={handleCreate} disabled={!createForm.name.trim()}>
                  Create Customer
                </Button>
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customer List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading customers...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No customers found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map(customer => (
            <Card
              key={customer.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => fetchCustomerDetails(customer)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{customer.name}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {customer.email || customer.phone || 'No contact info'}
                    </p>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className={`font-bold ${customer.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(customer.current_balance)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {customer.current_balance > 0 ? 'Outstanding' : 'No balance'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{selectedCustomer.name}</CardTitle>
                  <p className="text-sm text-gray-500">
                    {selectedCustomer.email || 'No email'} {selectedCustomer.phone ? `· ${selectedCustomer.phone}` : ''}
                  </p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Balance Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Outstanding Balance</p>
                  <p className={`font-bold text-lg ${selectedCustomer.current_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(selectedCustomer.current_balance)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Credit Limit</p>
                  <p className="font-bold text-lg text-gray-700">
                    {selectedCustomer.credit_limit ? formatCurrency(selectedCustomer.credit_limit) : 'No limit'}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b">
                <button
                  className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'credit' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}
                  onClick={() => setActiveTab('credit')}
                >
                  Credit Transactions
                </button>
                <button
                  className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'payments' ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}`}
                  onClick={() => setActiveTab('payments')}
                >
                  Payments
                </button>
              </div>

              {/* Credit Transactions Tab */}
              {activeTab === 'credit' && (
                <div className="space-y-2">
                  {creditTransactions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No credit transactions</p>
                  ) : (
                    creditTransactions.map(txn => (
                      <div key={txn.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Sale #{txn.sale_id}</p>
                            <p className="text-xs text-gray-500">
                              Due: {new Date(txn.due_date).toLocaleDateString()} · Created: {new Date(txn.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(txn.status)}`}>
                            {getStatusLabel(txn.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex justify-between text-sm">
                          <span className="text-gray-600">Original: {formatCurrency(txn.original_amount)}</span>
                          <span className="text-gray-600">Paid: {formatCurrency(txn.amount_paid)}</span>
                          <span className={txn.amount_due > 0 ? 'font-semibold text-red-600' : 'text-green-600'}>
                            Due: {formatCurrency(txn.amount_due)}
                          </span>
                        </div>
                        {txn.status !== 'paid' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentForm({ ...paymentForm, credit_transaction_id: txn.id, amount: txn.amount_due });
                              setShowPaymentForm(true);
                            }}
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            Record Payment
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === 'payments' && (
                <div className="space-y-2">
                  {payments.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No payments recorded</p>
                  ) : (
                    payments.map(pay => (
                      <div key={pay.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-700">{formatCurrency(pay.amount)}</p>
                            <p className="text-xs text-gray-500">
                              {pay.payment_method} · {new Date(pay.payment_date).toLocaleDateString()}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">TXN #{pay.credit_transaction_id}</p>
                        </div>
                        {pay.notes && <p className="text-xs text-gray-500 mt-1">{pay.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Payment Form Modal */}
              {showPaymentForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentForm(false)}>
                  <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>Record Payment</CardTitle>
                        <button onClick={() => setShowPaymentForm(false)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <select
                          className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          value={paymentForm.payment_method}
                          onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                        >
                          <option value="Cash">Cash</option>
                          <option value="M-Pesa">M-Pesa</option>
                          <option value="Card">Card</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                        <input
                          type="date"
                          value={paymentForm.payment_date}
                          onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                          className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <Input
                          value={paymentForm.notes || ''}
                          onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                          placeholder="Optional notes"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button className="flex-1" onClick={handleRecordPayment} disabled={paymentForm.amount <= 0}>
                          Record Payment
                        </Button>
                        <Button variant="outline" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
