import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, Expense, ExpenseCreate } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { MinusCircle, CheckSquare, Calendar, Download, Edit, Save, X, Trash2, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { BranchSelector } from '@/components/BranchSelector';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type DateRange = 'today' | '30days' | '90days' | 'custom';

interface DateRangeOption {
  value: DateRange;
  label: string;
  days: number;
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '30days', label: 'Last 30 Days', days: 30 },
  { value: '90days', label: 'Last 3 Months', days: 90 },
  { value: 'custom', label: 'Custom Range', days: 0 },
];

export function Expenses() {
  const { token, tenant } = useAuth();

  // Branch selection state
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(() => {
    const stored = localStorage.getItem('expenses-branch-id');
    if (stored === 'all') return null;
    if (stored) return Number(stored);
    return tenant?.id || null;
  });

  const handleBranchChange = (branchId: number | null) => {
    setSelectedBranchId(branchId);
    localStorage.setItem('expenses-branch-id', branchId === null ? 'all' : String(branchId));
  };

  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    return (localStorage.getItem('expenses-date-range') as DateRange) || '30days';
  });
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const selectedOption = DATE_RANGE_OPTIONS.find(opt => opt.value === dateRange) || DATE_RANGE_OPTIONS[1];

  const getDaysForDateRange = (): number => {
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      const diffTime = Math.abs(new Date(customEndDate).getTime() - new Date(customStartDate).getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return selectedOption.days;
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    localStorage.setItem('expenses-date-range', range);
  };

  // Expenses data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseType, setExpenseType] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseTypeSuggestions, setExpenseTypeSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const expenseTypeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline edit state
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editExpenseType, setEditExpenseType] = useState('');
  const [editExpenseAmount, setEditExpenseAmount] = useState('');
  const [editExpenseDate, setEditExpenseDate] = useState('');
  const [editExpenseDescription, setEditExpenseDescription] = useState('');

  // Messages
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Export states
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const fetchExpenses = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const days = getDaysForDateRange();
      const data = await api.getExpenses(token, days, selectedBranchId);
      setExpenses(data);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [token, dateRange, customStartDate, customEndDate, selectedBranchId]);

  // Autocomplete handlers
  const fetchExpenseTypes = async (prefix: string) => {
    if (!token || prefix.length === 0) {
      setExpenseTypeSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const types = await api.getExpenseTypes(token, prefix);
      setExpenseTypeSuggestions(types.map((t: { type: string }) => t.type));
      setShowSuggestions(types.length > 0);
    } catch {
      setExpenseTypeSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleExpenseTypeChange = (value: string) => {
    setExpenseType(value);
    if (expenseTypeDebounceRef.current) clearTimeout(expenseTypeDebounceRef.current);
    expenseTypeDebounceRef.current = setTimeout(() => fetchExpenseTypes(value), 300);
  };

  // CRUD handlers
  const handleCreateExpense = async () => {
    if (!token || !expenseType || !expenseAmount || !expenseDate) return;
    try {
      const data: ExpenseCreate = {
        type: expenseType,
        amount: parseFloat(expenseAmount),
        description: expenseDescription || undefined,
        expense_date: expenseDate,
        branch_id: selectedBranchId,
      };
      await api.createExpense(token, data);
      setExpenseType('');
      setExpenseAmount('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setExpenseDescription('');
      setShowExpenseForm(false);
      await fetchExpenses();
      setSuccessMessage('Expense created successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to create expense');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setEditExpenseType(expense.type);
    setEditExpenseAmount(expense.amount.toString());
    setEditExpenseDate(expense.expense_date);
    setEditExpenseDescription(expense.description || '');
  };

  const handleSaveExpense = async () => {
    if (!token || !editingExpenseId) return;
    try {
      const updateData: any = {};
      if (editExpenseType) updateData.type = editExpenseType;
      if (editExpenseAmount) updateData.amount = parseFloat(editExpenseAmount);
      if (editExpenseDate) updateData.expense_date = editExpenseDate;
      updateData.description = editExpenseDescription || null;
      await api.updateExpense(token, editingExpenseId, updateData);
      setEditingExpenseId(null);
      await fetchExpenses();
      setSuccessMessage('Expense updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to update expense');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!token || !window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await api.deleteExpense(token, expenseId);
      setExpenses(prev => prev.filter(e => e.id !== expenseId));
      setSuccessMessage('Expense deleted successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to delete expense');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Export handlers
  const exportToPDF = async () => {
    setExportingPDF(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const doc = new jsPDF();
      const dateRangeText = dateRange === 'custom' && customStartDate && customEndDate
        ? `${customStartDate} - ${customEndDate}`
        : selectedOption.label;

      doc.setFontSize(18);
      doc.text('Expenses Report', 14, 22);
      doc.setFontSize(11);
      doc.text(`Date Range: ${dateRangeText}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

      if (expenses.length > 0) {
        const tableData = expenses.map(exp => [
          exp.expense_date,
          exp.type,
          exp.description || '',
          exp.branch_name || 'Main Location',
          formatCurrency(exp.amount)
        ]);
        autoTable(doc, {
          startY: 42,
          head: [['Date', 'Type', 'Description', 'Location', 'Amount']],
          body: tableData,
        });
        doc.save(`expenses-report-${Date.now()}.pdf`);
      } else {
        alert('No data available to export.');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF.');
    } finally {
      setExportingPDF(false);
    }
  };

  const exportToExcel = async () => {
    setExportingExcel(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (expenses.length > 0) {
        const data = expenses.map(exp => ({
          Date: exp.expense_date,
          Type: exp.type,
          Description: exp.description || '',
          Location: exp.branch_name || 'Main Location',
          Amount: exp.amount
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
        XLSX.writeFile(wb, `expenses-report-${Date.now()}.xlsx`);
      } else {
        alert('No data available to export.');
      }
    } catch (error) {
      console.error('Excel export error:', error);
      alert('Failed to export Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading expenses...</p>
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
          <button type="button" onClick={() => setSuccessMessage('')} className="text-green-500 hover:text-green-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="font-medium text-sm flex-1">{errorMessage}</p>
          <button type="button" onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">Expenses</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">Track and manage business expenses</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <BranchSelector selectedBranchId={selectedBranchId} onBranchChange={handleBranchChange} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportToPDF} disabled={exportingPDF || loading}>
                {exportingPDF ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>Exporting...</>) : (<><Download className="w-4 h-4 mr-2" />Export PDF</>)}
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel} disabled={exportingExcel || loading}>
                {exportingExcel ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>Exporting...</>) : (<><Download className="w-4 h-4 mr-2" />Export Excel</>)}
              </Button>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Date Range:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {DATE_RANGE_OPTIONS.map((option) => (
              <Button key={option.value} variant={dateRange === option.value ? 'default' : 'outline'} size="sm" onClick={() => handleDateRangeChange(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="text-sm" />
              <span className="text-gray-500">to</span>
              <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} min={customStartDate} className="text-sm" />
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Total Expenses</p>
                <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{formatCurrency(expenses.reduce((sum, e) => sum + e.amount, 0))}</p>
                <div className="flex items-center gap-1 mt-2 text-sm text-red-600"><MinusCircle className="w-4 h-4" /><span>{selectedOption.label}</span></div>
              </div>
              <div className="bg-red-100 text-red-600 rounded-lg p-3"><MinusCircle className="w-6 h-6" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{expenses.length}</p>
                <div className="flex items-center gap-1 mt-2 text-sm text-gray-600"><CheckSquare className="w-4 h-4" /><span>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</span></div>
              </div>
              <div className="bg-gray-100 text-gray-600 rounded-lg p-3"><CheckSquare className="w-6 h-6" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Expense Button / Form */}
      {!showExpenseForm ? (
        <Button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Expense</Button>
      ) : (
        <Card className="border-2 border-primary-200">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">New Expense</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowExpenseForm(false)}><X className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <Input
                  placeholder="e.g., Rent, Supplies, Utilities"
                  value={expenseType}
                  onChange={(e) => handleExpenseTypeChange(e.target.value)}
                  onFocus={() => { if (expenseType) fetchExpenseTypes(expenseType); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && expenseTypeSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    {expenseTypeSuggestions.map((suggestion) => (
                      <button key={suggestion} type="button" className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50" onMouseDown={() => { setExpenseType(suggestion); setShowSuggestions(false); }}>{suggestion}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input placeholder="Optional description" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} />
              </div>
            </div>
            <Button className="mt-4" disabled={!expenseType || !expenseAmount || !expenseDate} onClick={handleCreateExpense}>Create Expense</Button>
          </CardContent>
        </Card>
      )}

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Expenses ({expenses.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground font-medium">
                <tr>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">Type</th>
                  <th className="p-4 text-left hidden md:table-cell">Description</th>
                  <th className="p-4 text-left hidden md:table-cell">Location</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-t hover:bg-muted/50">
                    {editingExpenseId === expense.id ? (
                      <>
                        <td className="p-2"><Input type="date" value={editExpenseDate} onChange={(e) => setEditExpenseDate(e.target.value)} className="text-sm" /></td>
                        <td className="p-2"><Input value={editExpenseType} onChange={(e) => setEditExpenseType(e.target.value)} className="text-sm" /></td>
                        <td className="p-2 hidden md:table-cell"><Input value={editExpenseDescription} onChange={(e) => setEditExpenseDescription(e.target.value)} className="text-sm" placeholder="Description" /></td>
                        <td className="p-2 text-gray-500 hidden md:table-cell">{expense.branch_name || 'Main Location'}</td>
                        <td className="p-2"><Input type="number" value={editExpenseAmount} onChange={(e) => setEditExpenseAmount(e.target.value)} className="text-sm text-right" /></td>
                        <td className="p-4 text-center"><div className="flex justify-center gap-2"><Button size="sm" onClick={handleSaveExpense}><Save className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => setEditingExpenseId(null)}><X className="h-3 w-3" /></Button></div></td>
                      </>
                    ) : (
                      <>
                        <td className="p-4">{expense.expense_date}</td>
                        <td className="p-4 font-medium">{expense.type}</td>
                        <td className="p-4 text-gray-600 hidden md:table-cell">{expense.description || '—'}</td>
                        <td className="p-4 text-gray-500 hidden md:table-cell">{expense.branch_name || 'Main Location'}</td>
                        <td className="p-4 text-right font-bold">{formatCurrency(expense.amount)}</td>
                        <td className="p-4 text-center"><div className="flex justify-center gap-2"><Button size="sm" variant="outline" onClick={() => handleEditExpense(expense)}><Edit className="h-3 w-3" /></Button><Button size="sm" variant="outline" onClick={() => handleDeleteExpense(expense.id)} className="text-red-600 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button></div></td>
                      </>
                    )}
                  </tr>
                ))}
                {expenses.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No expenses found for this period.</td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
