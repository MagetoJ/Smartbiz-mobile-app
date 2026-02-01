import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, StaffPerformanceReport, Sale, FinancialReport, BranchPerformanceMetrics, PriceVarianceReport } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ProductImage } from '@/components/ProductImage';
import {
  Users, DollarSign, TrendingUp, TrendingDown, Package,
  CheckSquare, Building2, Download, Calendar, Package2, ShoppingCart,
  History, ChevronDown, ChevronUp, Mail, MessageCircle,
  Edit, Save, X, CheckCircle, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { usePermissions } from '@/hooks/usePermissions';
import { BranchSelector } from '@/components/BranchSelector';
import { generateReceiptText, generateWhatsAppLink } from '@/lib/receiptText';

type DateRange = 'today' | '7days' | '30days' | '90days' | '180days' | 'year' | 'custom';

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


export function Reports() {
  const { token, user, tenant } = useAuth();
  const permissions = usePermissions();
  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';

  // Branch filtering state
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(() => {
    // Branch admins: locked to their branch
    if (permissions.isBranchAdmin && user?.branch_id) {
      return user.branch_id;
    }
    // Owners: default to "All Locations" (null)
    return null;
  });

  // Lock branch admins to their branch
  useEffect(() => {
    if (permissions.isBranchAdmin && user?.branch_id) {
      setSelectedBranchId(user.branch_id);
    }
  }, [permissions.isBranchAdmin, user?.branch_id]);

  // Tab state management with localStorage persistence
  const [activeTab, setActiveTab] = useState<string>(() => {
    const stored = localStorage.getItem('reports-active-tab');
    const userRole = user?.role;
    const isStaffUser = userRole === 'staff';
    // Staff only has 'sales' tab
    if (isStaffUser) return 'sales';
    return stored || 'financial';
  });

  // Global date range state
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    return (localStorage.getItem('reports-date-range') as DateRange) || '30days';
  });

  // Custom date range with 6 months preset
  const getSixMonthsAgo = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date;
  };

  const [customStartDate, setCustomStartDate] = useState<Date | null>(() => getSixMonthsAgo());
  const [customEndDate, setCustomEndDate] = useState<Date | null>(() => new Date());

  // Sales State (used for Reconciliation tab)
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);

  // Financial Report State
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null);
  const [financialLoading, setFinancialLoading] = useState(true);

  // Staff Performance State
  const [staffReport, setStaffReport] = useState<StaffPerformanceReport | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  // Branch Performance State
  const [branchPerformance, setBranchPerformance] = useState<BranchPerformanceMetrics[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);

  // Price Variance State
  const [varianceReport, setVarianceReport] = useState<PriceVarianceReport | null>(null);
  const [varianceLoading, setVarianceLoading] = useState(true);

  // Export States
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Sales History State
  const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(true);
  const [salesSummary, setSalesSummary] = useState<{ total_revenue: number; total_sales: number } | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tab definitions
  const reportsTabs = [
    ...(!isStaff ? [
      { id: 'financial', label: 'Financial Report', icon: <TrendingUp className="w-4 h-4" /> },
      { id: 'products', label: 'Product Performance', icon: <Package className="w-4 h-4" /> },
      { id: 'inventory', label: 'Inventory Analysis', icon: <Package2 className="w-4 h-4" /> },
      { id: 'variance', label: 'Price Variance', icon: <TrendingDown className="w-4 h-4" /> },
    ] : []),
    ...(isAdmin ? [
      { id: 'branches', label: 'Branch Performance', icon: <Building2 className="w-4 h-4" /> },
      { id: 'staff', label: 'Staff Performance', icon: <Users className="w-4 h-4" /> },
    ] : []),
    ...(!isStaff ? [
      { id: 'reconciliation', label: 'Reconciliation', icon: <CheckSquare className="w-4 h-4" /> },
    ] : []),
    { id: 'sales', label: 'Sales History', icon: <History className="w-4 h-4" /> },
  ];

  // Tab change handler with persistence
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    localStorage.setItem('reports-active-tab', tabId);
  };

  // Get selected date range option
  const selectedOption = DATE_RANGE_OPTIONS.find(opt => opt.value === dateRange) || DATE_RANGE_OPTIONS[2];

  // Calculate days based on date range
  const getDaysForDateRange = (): number => {
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      const diffTime = Math.abs(customEndDate.getTime() - customStartDate.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    return selectedOption.days;
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
    localStorage.setItem('reports-date-range', range);
    if (range === 'custom') {
      // Reset to 6 months preset when selecting custom
      setCustomStartDate(getSixMonthsAgo());
      setCustomEndDate(new Date());
    }
  };

  // Helper function to format payment method names
  const formatPaymentMethod = (method: string): string => {
    if (!method) return 'Unknown';
    const normalized = method.toLowerCase();
    if (normalized === 'cash') return 'Cash';
    if (normalized === 'credit_card') return 'Credit Card';
    if (normalized === 'm-pesa') return 'M-Pesa';
    if (normalized === 'mobile_money') return 'Mobile Money';
    return method.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  // Payment method aggregation for Reconciliation tab
  const paymentMethodStats = useMemo(() => {
    if (!sales || sales.length === 0) return null;
    const stats: Record<string, { total: number; count: number }> = {};
    sales.forEach(sale => {
      const rawMethod = sale.payment_method || 'Unknown';
      const method = formatPaymentMethod(rawMethod);
      if (!stats[method]) {
        stats[method] = { total: 0, count: 0 };
      }
      stats[method].total += sale.total;
      stats[method].count += 1;
    });
    return stats;
  }, [sales]);


  // Fetch Financial Report Data
  useEffect(() => {
    const fetchFinancialData = async () => {
      if (!token || activeTab !== 'financial') return;
      setFinancialLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getFinancialReport(token, days, selectedBranchId);
        setFinancialReport(data);
      } catch (error) {
        console.error('Failed to fetch financial report:', error);
      } finally {
        setFinancialLoading(false);
      }
    };
    fetchFinancialData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab, selectedBranchId]);

  // Fetch Product Performance Data
  useEffect(() => {
    const fetchProductData = async () => {
      if (!token || activeTab !== 'products') return;
      setFinancialLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getFinancialReport(token, days, selectedBranchId);
        setFinancialReport(data);
      } catch (error) {
        console.error('Failed to fetch product performance:', error);
      } finally {
        setFinancialLoading(false);
      }
    };
    fetchProductData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab, selectedBranchId]);

  // Fetch Inventory Analysis Data
  useEffect(() => {
    const fetchInventoryData = async () => {
      if (!token || activeTab !== 'inventory') return;
      setFinancialLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getFinancialReport(token, days, selectedBranchId);
        setFinancialReport(data);
      } catch (error) {
        console.error('Failed to fetch inventory analysis:', error);
      } finally {
        setFinancialLoading(false);
      }
    };
    fetchInventoryData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab, selectedBranchId]);

  // Fetch Branch Performance Data
  useEffect(() => {
    const fetchBranchPerformance = async () => {
      if (!token || !isAdmin || activeTab !== 'branches') return;
      setBranchLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getBranchPerformance(token, days);
        setBranchPerformance(data);
      } catch (error) {
        console.error('Failed to fetch branch performance:', error);
      } finally {
        setBranchLoading(false);
      }
    };
    fetchBranchPerformance();
  }, [token, isAdmin, dateRange, customStartDate, customEndDate, activeTab]);

  // Fetch Price Variance Data
  useEffect(() => {
    const fetchVarianceData = async () => {
      if (!token || activeTab !== 'variance') return;
      setVarianceLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getPriceVarianceReport(token, days);
        setVarianceReport(data);
      } catch (error) {
        console.error('Failed to fetch price variance:', error);
      } finally {
        setVarianceLoading(false);
      }
    };
    fetchVarianceData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab]);

  // Fetch Staff Performance Data
  useEffect(() => {
    const fetchStaffReport = async () => {
      if (!token || !isAdmin || activeTab !== 'staff') return;
      setStaffLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getStaffPerformance(token, days);
        setStaffReport(data);
      } catch (error) {
        console.error('Failed to fetch staff performance report:', error);
      } finally {
        setStaffLoading(false);
      }
    };
    fetchStaffReport();
  }, [token, isAdmin, dateRange, customStartDate, customEndDate, activeTab]);

  // Fetch Reconciliation Data (uses sales)
  useEffect(() => {
    const fetchReconciliationData = async () => {
      if (!token || activeTab !== 'reconciliation') return;
      setSalesLoading(true);
      try {
        const days = getDaysForDateRange();
        const data = await api.getSales(token, days);
        setSales(data);
      } catch (error) {
        console.error('Failed to fetch reconciliation data:', error);
      } finally {
        setSalesLoading(false);
      }
    };
    fetchReconciliationData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab]);

  // Fetch Sales History Data
  useEffect(() => {
    const fetchSalesHistoryData = async () => {
      if (!token || activeTab !== 'sales') return;
      setSalesHistoryLoading(true);
      try {
        const days = getDaysForDateRange();
        const [salesData, summaryData] = await Promise.all([
          api.getSales(token, days),
          api.getSalesSummary(token, days),
        ]);
        setSalesHistory(salesData);
        setSalesSummary(summaryData);
      } catch (error) {
        console.error('Failed to fetch sales history:', error);
        setErrorMessage('Failed to load sales data. Please try again.');
        setTimeout(() => setErrorMessage(''), 5000);
      } finally {
        setSalesHistoryLoading(false);
      }
    };
    fetchSalesHistoryData();
  }, [token, dateRange, customStartDate, customEndDate, activeTab]);

  // Sales History handlers
  const fetchSalesHistoryData = useCallback(async () => {
    if (!token) return;
    setSalesHistoryLoading(true);
    try {
      const days = getDaysForDateRange();
      const [salesData, summaryData] = await Promise.all([
        api.getSales(token, days),
        api.getSalesSummary(token, days),
      ]);
      setSalesHistory(salesData);
      setSalesSummary(summaryData);
    } catch (error) {
      console.error('Failed to fetch sales history:', error);
    } finally {
      setSalesHistoryLoading(false);
    }
  }, [token, dateRange, customStartDate, customEndDate]);

  const handleUpdateCustomer = async (saleId: number) => {
    if (!token) return;
    try {
      await api.updateSaleCustomer(token, saleId, {
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        customer_phone: customerPhone || undefined,
      });
      await fetchSalesHistoryData();
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
      await fetchSalesHistoryData();
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
      await api.markWhatsAppSent(token, sale.id);
      await fetchSalesHistoryData();
      setSuccessMessage('WhatsApp receipt opened - marked as sent!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to send WhatsApp receipt');
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Export Functions
  const exportToPDF = async () => {
    console.log('📄 Export PDF clicked. Active tab:', activeTab);
    console.log('📊 Data check:', {
      sales: sales.length,
      financialReport: financialReport ? 'loaded' : 'null',
      staffReport: staffReport ? 'loaded' : 'null',
      branchPerformance: branchPerformance.length
    });

    setExportingPDF(true);
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100));
      const doc = new jsPDF();
      const title = `${reportsTabs.find(t => t.id === activeTab)?.label || 'Report'}`;
      const dateRangeText = dateRange === 'custom' && customStartDate && customEndDate
        ? `${customStartDate.toLocaleDateString()} - ${customEndDate.toLocaleDateString()}`
        : selectedOption.label;

      doc.setFontSize(18);
      doc.text(title, 14, 22);
      doc.setFontSize(11);
      doc.text(`Date Range: ${dateRangeText}`, 14, 30);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);

      let hasData = false;

      // Financial Report - Top Products
      if (activeTab === 'financial' && financialReport?.top_selling_products && financialReport.top_selling_products.length > 0) {
        const tableData = financialReport.top_selling_products.map(product => [
          product.name,
          product.quantity.toString(),
          formatCurrency(product.revenue),
          formatCurrency(product.profit)
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Product', 'Quantity Sold', 'Revenue', 'Profit']],
          body: tableData,
        });
        hasData = true;
      }
      // Product Performance
      else if (activeTab === 'products' && financialReport?.top_selling_products && financialReport.top_selling_products.length > 0) {
        const tableData = financialReport.top_selling_products.map(product => [
          product.name,
          product.quantity.toString(),
          formatCurrency(product.revenue),
          formatCurrency(product.profit)
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Product', 'Quantity', 'Revenue', 'Profit']],
          body: tableData,
        });
        hasData = true;
      }
      // Inventory Analysis - Dead Stock
      else if (activeTab === 'inventory' && financialReport?.non_moving_products && financialReport.non_moving_products.length > 0) {
        const tableData = financialReport.non_moving_products.map(product => [
          product.name,
          product.sku,
          product.quantity.toString(),
          formatCurrency(product.base_cost),
          formatCurrency(product.selling_price),
          `${product.days_without_sales} days`
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Product', 'SKU', 'Stock', 'Cost', 'Price', 'Days Idle']],
          body: tableData,
        });
        hasData = true;
      }
      // Price Variance
      else if (activeTab === 'variance' && varianceReport?.product_variances && varianceReport.product_variances.length > 0) {
        const tableData = varianceReport.product_variances.map(pv => [
          pv.product_name,
          pv.sku,
          formatCurrency(pv.standard_price),
          formatCurrency(pv.avg_override_price),
          `${pv.overridden_sales_count}/${pv.total_sales_count}`,
          formatCurrency(Math.abs(pv.total_variance_amount)),
          `${pv.variance_percentage >= 0 ? '-' : '+'}${Math.abs(pv.variance_percentage).toFixed(1)}%`
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Product', 'SKU', 'Std Price', 'Avg Override', 'Times', 'Variance', '% Var']],
          body: tableData,
        });
        hasData = true;
      }
      // Branch Performance
      else if (activeTab === 'branches' && branchPerformance.length > 0) {
        const tableData = branchPerformance.map(branch => [
          branch.branch_name,
          branch.total_sales.toString(),
          formatCurrency(branch.total_revenue),
          formatCurrency(branch.total_profit),
          formatCurrency(branch.total_sales > 0 ? branch.total_revenue / branch.total_sales : 0)
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Branch', 'Sales', 'Revenue', 'Profit', 'Avg Sale']],
          body: tableData,
        });
        hasData = true;
      }
      // Staff Performance
      else if (activeTab === 'staff' && staffReport && staffReport.staff_metrics.length > 0) {
        const tableData = staffReport.staff_metrics.map(staff => [
          staff.full_name,
          formatCurrency(staff.total_revenue),
          formatCurrency(staff.total_profit),
          staff.total_sales.toString(),
          staff.total_units_sold.toString(),
          formatCurrency(staff.avg_sale_value)
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Staff', 'Revenue', 'Profit', 'Sales', 'Units', 'Avg Sale']],
          body: tableData,
        });
        hasData = true;
      }
      // Reconciliation
      else if (activeTab === 'reconciliation' && sales.length > 0) {
        const tableData = sales.map(sale => [
          formatDate(sale.created_at),
          sale.customer_name || 'Walk-in',
          sale.user?.full_name || 'N/A',
          formatCurrency(sale.total),
          formatPaymentMethod(sale.payment_method),
          sale.status.toUpperCase()
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Date', 'Customer', 'Staff', 'Amount', 'Payment', 'Status']],
          body: tableData,
        });
        hasData = true;
      }
      // Sales History
      else if (activeTab === 'sales' && salesHistory.length > 0) {
        const tableData = salesHistory.map(sale => [
          formatDate(sale.created_at),
          sale.customer_name || 'Walk-in',
          sale.user?.full_name || 'N/A',
          sale.sale_items.length.toString(),
          formatCurrency(sale.total),
          formatPaymentMethod(sale.payment_method),
          sale.status.toUpperCase()
        ]);

        autoTable(doc, {
          startY: 42,
          head: [['Date', 'Customer', 'Staff', 'Items', 'Total', 'Payment', 'Status']],
          body: tableData,
        });
        hasData = true;
      }
      if (hasData) {
        doc.save(`${activeTab}-report-${Date.now()}.pdf`);
        console.log('PDF exported successfully');
      } else {
        alert('No data available to export for this tab. Please ensure data is loaded.');
      }
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExportingPDF(false);
    }
  };

  const exportToExcel = async () => {
    console.log('📊 Export Excel clicked. Active tab:', activeTab);
    console.log('📈 Data check:', {
      sales: sales.length,
      financialReport: financialReport ? 'loaded' : 'null',
      staffReport: staffReport ? 'loaded' : 'null',
      branchPerformance: branchPerformance.length
    });

    setExportingExcel(true);
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100));

      let data: any[] = [];
      let filename = `${activeTab}-report`;

      // Financial Report
      if (activeTab === 'financial' && financialReport?.top_selling_products) {
        data = financialReport.top_selling_products.map(product => ({
          'Product': product.name,
          'Quantity Sold': product.quantity,
          'Revenue': product.revenue,
          'Profit': product.profit
        }));
      }
      // Product Performance
      else if (activeTab === 'products' && financialReport?.top_selling_products) {
        data = financialReport.top_selling_products.map(product => ({
          'Product': product.name,
          'Quantity': product.quantity,
          'Revenue': product.revenue,
          'Profit': product.profit
        }));
      }
      // Inventory Analysis
      else if (activeTab === 'inventory' && financialReport?.non_moving_products) {
        data = financialReport.non_moving_products.map(product => ({
          'Product': product.name,
          'SKU': product.sku,
          'Category': product.category_name || 'N/A',
          'Stock': product.quantity,
          'Cost': product.base_cost,
          'Price': product.selling_price,
          'Days Idle': product.days_without_sales
        }));
      }
      // Price Variance
      else if (activeTab === 'variance' && varianceReport?.product_variances) {
        data = varianceReport.product_variances.map(pv => ({
          'Product': pv.product_name,
          'SKU': pv.sku,
          'Standard Price': pv.standard_price,
          'Avg Override Price': pv.avg_override_price,
          'Times Overridden': pv.overridden_sales_count,
          'Total Sales': pv.total_sales_count,
          'Total Variance': pv.total_variance_amount,
          'Variance %': pv.variance_percentage.toFixed(2)
        }));
      }
      // Branch Performance
      else if (activeTab === 'branches' && branchPerformance.length > 0) {
        data = branchPerformance.map(branch => ({
          'Branch': branch.branch_name,
          'Total Sales': branch.total_sales,
          'Total Revenue': branch.total_revenue,
          'Total Profit': branch.total_profit,
          'Avg Sale Value': branch.total_sales > 0 ? branch.total_revenue / branch.total_sales : 0,
          'Profit Margin %': branch.total_revenue > 0 ? ((branch.total_profit / branch.total_revenue) * 100).toFixed(2) : 0
        }));
      }
      // Staff Performance
      else if (activeTab === 'staff' && staffReport) {
        data = staffReport.staff_metrics.map(staff => ({
          'Staff Member': staff.full_name,
          'Username': staff.username,
          'Revenue': staff.total_revenue,
          'Profit': staff.total_profit,
          'Transactions': staff.total_sales,
          'Units Sold': staff.total_units_sold,
          'Avg Sale': staff.avg_sale_value,
          'Profit Margin %': staff.total_revenue > 0 ? ((staff.total_profit / staff.total_revenue) * 100).toFixed(2) : 0
        }));
      }
      // Reconciliation
      else if (activeTab === 'reconciliation' && sales.length > 0) {
        data = sales.map(sale => ({
          Date: formatDate(sale.created_at),
          Customer: sale.customer_name || 'Walk-in',
          Staff: sale.user?.full_name || 'N/A',
          Amount: sale.total,
          'Payment Method': formatPaymentMethod(sale.payment_method),
          Status: sale.status.toUpperCase()
        }));
      }
      // Sales History
      else if (activeTab === 'sales' && salesHistory.length > 0) {
        data = salesHistory.map(sale => ({
          Date: formatDate(sale.created_at),
          Customer: sale.customer_name || 'Walk-in',
          Staff: sale.user?.full_name || 'N/A',
          Items: sale.sale_items.length,
          Total: sale.total,
          'Payment Method': formatPaymentMethod(sale.payment_method),
          Status: sale.status.toUpperCase()
        }));
      }
      if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        XLSX.writeFile(wb, `${filename}-${Date.now()}.xlsx`);
        console.log('Excel exported successfully');
      } else {
        alert('No data available to export for this tab. Please ensure data is loaded.');
      }
    } catch (error) {
      console.error('Excel export error:', error);
      alert('Failed to export Excel. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Sort staff by revenue
  const sortedByRevenue = staffReport ? [...staffReport.staff_metrics].sort((a, b) => b.total_revenue - a.total_revenue) : [];

  // Determine if current tab is loading
  const isCurrentTabLoading = () => {
    switch (activeTab) {
      case 'reconciliation':
        return salesLoading;
      case 'financial':
      case 'products':
      case 'inventory':
        return financialLoading;
      case 'variance':
        return varianceLoading;
      case 'staff':
        return staffLoading;
      case 'branches':
        return branchLoading;
      case 'sales':
        return salesHistoryLoading;
      default:
        return false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
              Reports & Analytics
            </h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">
              Comprehensive insights with advanced filtering and export options
            </p>
          </div>

          {/* Filters and Actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Branch Selector - Only for owners */}
            {permissions.isOwner && (
              <BranchSelector
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
              />
            )}

            {/* Export Buttons */}
            <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToPDF}
              disabled={exportingPDF || isCurrentTabLoading()}
            >
              {exportingPDF ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={exportingExcel || isCurrentTabLoading()}
            >
              {exportingExcel ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </>
              )}
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
              <Button
                key={option.value}
                variant={dateRange === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDateRangeChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <DatePicker
                selected={customStartDate}
                onChange={(date: Date | null) => setCustomStartDate(date)}
                selectsStart
                startDate={customStartDate || undefined}
                endDate={customEndDate || undefined}
                placeholderText="Start Date"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-gray-500">to</span>
              <DatePicker
                selected={customEndDate}
                onChange={(date: Date | null) => setCustomEndDate(date)}
                selectsEnd
                startDate={customStartDate || undefined}
                endDate={customEndDate || undefined}
                minDate={customStartDate || undefined}
                placeholderText="End Date"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
        </div>
      </div>

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

      {/* Tabs Navigation */}
      <Tabs
        tabs={reportsTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Financial Report Tab */}
      <TabPanel value="financial" activeTab={activeTab}>
        {financialLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading financial data...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quantity Sold Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">
                  {isStaff ? 'My Quantity Sold Trend' : 'Quantity Sold Trend'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialReport?.quantity_by_date || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="quantity"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Units Sold"
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">
                  {isStaff ? 'My Revenue Trend' : 'Revenue Trend'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialReport?.revenue_by_date || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#16a34a"
                      strokeWidth={2}
                      name="Revenue"
                      dot={{ fill: '#16a34a', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Profit Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">
                  {isStaff ? 'My Profit Trend' : 'Profit Trend'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialReport?.profit_by_date || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      name="Profit"
                      dot={{ fill: '#f59e0b', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </TabPanel>

      {/* Product Performance Tab */}
      <TabPanel value="products" activeTab={activeTab}>
        {financialLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading product data...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
              {/* Top Products by Quantity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    {isStaff ? 'My Top Products by Quantity' : 'Top Products by Quantity'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={financialReport?.top_selling_products?.slice().sort((a, b) => b.quantity - a.quantity) || []}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 11 }}
                        stroke="#9ca3af"
                      />
                      <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Bar
                        dataKey="quantity"
                        fill="#22c55e"
                        name="Units Sold"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Top Products by Revenue */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    {isStaff ? 'My Top Products by Revenue' : 'Top Products by Revenue'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={financialReport?.top_selling_products?.slice().sort((a, b) => b.revenue - a.revenue) || []}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 11 }}
                        stroke="#9ca3af"
                      />
                      <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#f97316"
                        name="Revenue"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Top Products by Profit */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">
                  {isStaff ? 'My Top Products by Profit' : 'Top Products by Profit'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={financialReport?.top_selling_products?.slice().sort((a, b) => b.profit - a.profit) || []}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                    />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Bar
                      dataKey="profit"
                      fill="#8b5cf6"
                      name="Profit"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </TabPanel>

      {/* Inventory Analysis Tab */}
      <TabPanel value="inventory" activeTab={activeTab}>
        {financialLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading inventory data...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Dead Stock Table */}
            {financialReport?.non_moving_products && financialReport.non_moving_products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    {isStaff ? "Products I Haven't Sold" : 'Dead Stock Products'}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    {isStaff
                      ? "Products you haven't sold during the selected period"
                      : 'Physical products with zero sales during the selected period'}
                  </p>
                </CardHeader>
                <CardContent>
                  {/* Desktop Table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Product</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">SKU</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Category</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Stock</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Cost</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Price</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Days Idle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financialReport.non_moving_products.map((product) => (
                          <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-900">{product.name}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{product.sku}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {product.category_name || 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              {product.quantity}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              {formatCurrency(product.base_cost)}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-900 text-right">
                              {formatCurrency(product.selling_price)}
                            </td>
                            <td className="py-3 px-4 text-sm text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                product.days_without_sales > 90
                                  ? 'bg-red-100 text-red-800'
                                  : product.days_without_sales > 30
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {product.days_without_sales}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="lg:hidden space-y-3">
                    {financialReport.non_moving_products.map((product) => (
                      <Card key={product.id} className="bg-gray-50">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900">{product.name}</h3>
                              <p className="text-sm text-gray-600">{product.sku}</p>
                              {product.category_name && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  {product.category_name}
                                </Badge>
                              )}
                            </div>
                            <Badge variant={
                              product.days_without_sales > 90 ? 'danger' :
                              product.days_without_sales > 30 ? 'warning' : 'default'
                            }>
                              {product.days_without_sales}d idle
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-gray-600">Stock</p>
                              <p className="font-semibold">{product.quantity}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Cost</p>
                              <p className="font-semibold">{formatCurrency(product.base_cost)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Price</p>
                              <p className="font-semibold">{formatCurrency(product.selling_price)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(!financialReport?.non_moving_products || financialReport.non_moving_products.length === 0) && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No dead stock found for this period</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </TabPanel>

      {/* Price Variance Tab */}
      <TabPanel value="variance" activeTab={activeTab}>
        {varianceLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading variance data...</p>
            </div>
          </div>
        ) : !varianceReport ? (
          <Card>
            <CardContent className="p-12 text-center">
              <TrendingDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Failed to load variance report</p>
            </CardContent>
          </Card>
        ) : varianceReport.total_sales === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <TrendingDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No sales data available for this period</p>
              <p className="text-sm text-gray-400 mt-2">Try selecting a different date range</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600">Total Sales</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {varianceReport.total_sales}
                      </p>
                    </div>
                    <div className="bg-blue-100 text-blue-600 rounded-lg p-3">
                      <ShoppingCart className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600">Overridden Sales</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {varianceReport.overridden_sales}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {varianceReport.override_rate.toFixed(1)}% of total
                      </p>
                    </div>
                    <div className="bg-orange-100 text-orange-600 rounded-lg p-3">
                      <TrendingDown className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600">Total Variance</p>
                      <p className={`text-2xl font-bold mt-2 ${
                        varianceReport.total_variance_amount >= 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {varianceReport.total_variance_amount >= 0 ? '-' : '+'}
                        {formatCurrency(Math.abs(varianceReport.total_variance_amount))}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {varianceReport.total_variance_amount >= 0 ? 'Revenue lost' : 'Revenue gained'}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${
                      varianceReport.total_variance_amount >= 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-green-100 text-green-600'
                    }`}>
                      <DollarSign className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600">Avg Variance</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        {formatCurrency(Math.abs(varianceReport.avg_variance_per_override))}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Per overridden sale
                      </p>
                    </div>
                    <div className="bg-purple-100 text-purple-600 rounded-lg p-3">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Product Variance Table */}
            {varianceReport.product_variances.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    Product Price Variance
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Products where actual sale price differed from standard price
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Product</th>
                          <th className="p-4 text-left">SKU</th>
                          <th className="p-4 text-right">Standard Price</th>
                          <th className="p-4 text-right">Avg Override</th>
                          <th className="p-4 text-center">Overridden</th>
                          <th className="p-4 text-right">Total Variance</th>
                          <th className="p-4 text-right">% Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {varianceReport.product_variances.map((pv) => (
                          <tr key={pv.product_id} className="border-t hover:bg-muted/50">
                            <td className="p-4 font-medium">{pv.product_name}</td>
                            <td className="p-4 text-gray-600">{pv.sku}</td>
                            <td className="p-4 text-right">{formatCurrency(pv.standard_price)}</td>
                            <td className="p-4 text-right">{formatCurrency(pv.avg_override_price)}</td>
                            <td className="p-4 text-center">
                              {pv.overridden_sales_count} / {pv.total_sales_count}
                            </td>
                            <td className={`p-4 text-right font-bold ${
                              pv.total_variance_amount >= 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {pv.total_variance_amount >= 0 ? '-' : '+'}
                              {formatCurrency(Math.abs(pv.total_variance_amount))}
                            </td>
                            <td className="p-4 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                Math.abs(pv.variance_percentage) > 20
                                  ? 'bg-red-100 text-red-800'
                                  : Math.abs(pv.variance_percentage) > 10
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {pv.variance_percentage >= 0 ? '-' : '+'}
                                {Math.abs(pv.variance_percentage).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Staff Variance Table */}
            {varianceReport.staff_variances.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    Staff Price Override Analysis
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Price override patterns by staff member
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Staff Member</th>
                          <th className="p-4 text-right">Total Sales</th>
                          <th className="p-4 text-right">Overridden</th>
                          <th className="p-4 text-right">Override Rate</th>
                          <th className="p-4 text-right">Total Variance</th>
                          <th className="p-4 text-right">Avg Discount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {varianceReport.staff_variances.map((sv) => (
                          <tr key={sv.staff_id} className="border-t hover:bg-muted/50">
                            <td className="p-4">
                              <div>
                                <p className="font-medium">{sv.full_name}</p>
                                <p className="text-xs text-gray-500">@{sv.username}</p>
                              </div>
                            </td>
                            <td className="p-4 text-right">{sv.total_sales}</td>
                            <td className="p-4 text-right">{sv.overridden_sales}</td>
                            <td className="p-4 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                sv.override_percentage > 50
                                  ? 'bg-red-100 text-red-800'
                                  : sv.override_percentage > 25
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {sv.override_percentage.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`p-4 text-right font-bold ${
                              sv.total_variance_amount >= 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {sv.total_variance_amount >= 0 ? '-' : '+'}
                              {formatCurrency(Math.abs(sv.total_variance_amount))}
                            </td>
                            <td className="p-4 text-right">
                              {formatCurrency(Math.abs(sv.avg_discount_percentage))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Branch Variance Table (Admin Only) */}
            {isAdmin && varianceReport.branch_variances.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">
                    Branch Price Variance
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Price override patterns by branch
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Branch</th>
                          <th className="p-4 text-right">Total Sales</th>
                          <th className="p-4 text-right">Overridden</th>
                          <th className="p-4 text-right">Override Rate</th>
                          <th className="p-4 text-right">Total Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {varianceReport.branch_variances.map((bv) => (
                          <tr key={bv.branch_id} className="border-t hover:bg-muted/50">
                            <td className="p-4 font-medium">{bv.branch_name}</td>
                            <td className="p-4 text-right">{bv.total_sales}</td>
                            <td className="p-4 text-right">{bv.overridden_sales}</td>
                            <td className="p-4 text-right">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                bv.override_percentage > 50
                                  ? 'bg-red-100 text-red-800'
                                  : bv.override_percentage > 25
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {bv.override_percentage.toFixed(1)}%
                              </span>
                            </td>
                            <td className={`p-4 text-right font-bold ${
                              bv.total_variance_amount >= 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {bv.total_variance_amount >= 0 ? '-' : '+'}
                              {formatCurrency(Math.abs(bv.total_variance_amount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Overrides Message */}
            {varianceReport.overridden_sales === 0 && (
              <Card className="border-2 border-dashed border-gray-300">
                <CardContent className="p-12 text-center">
                  <CheckSquare className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    All Sales Used Standard Pricing
                  </p>
                  <p className="text-gray-600">
                    Great! No custom price overrides were used in the selected period.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    All {varianceReport.total_sales} sales were completed at standard product prices.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </TabPanel>

      {/* Branch Performance Tab */}
      {isAdmin && (
        <TabPanel value="branches" activeTab={activeTab}>
          {branchLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading branch data...</p>
              </div>
            </div>
          ) : !branchPerformance || branchPerformance.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No branch data available</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Branch Performance Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Branch Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchPerformance.map(branch => ({
                        name: branch.branch_name.replace(' (Main)', ''),
                        Revenue: branch.total_revenue,
                        Profit: branch.total_profit,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Legend />
                        <Bar dataKey="Revenue" fill="#10b981" />
                        <Bar dataKey="Profit" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Branch Details Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Branch Performance Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Branch</th>
                          <th className="p-4 text-right">Total Sales</th>
                          <th className="p-4 text-right">Total Revenue</th>
                          <th className="p-4 text-right">Total Profit</th>
                          <th className="p-4 text-right">Avg Sale Value</th>
                          <th className="p-4 text-right">Profit Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchPerformance.map((branch) => {
                          const avgSaleValue = branch.total_sales > 0 ? branch.total_revenue / branch.total_sales : 0;
                          const profitMargin = branch.total_revenue > 0 ? (branch.total_profit / branch.total_revenue) * 100 : 0;

                          return (
                            <tr key={branch.branch_id} className="border-t hover:bg-muted/50">
                              <td className="p-4 font-medium">{branch.branch_name}</td>
                              <td className="p-4 text-right">{branch.total_sales}</td>
                              <td className="p-4 text-right font-bold">
                                {formatCurrency(branch.total_revenue)}
                              </td>
                              <td className="p-4 text-right font-bold text-green-600">
                                {formatCurrency(branch.total_profit)}
                              </td>
                              <td className="p-4 text-right">
                                {formatCurrency(avgSaleValue)}
                              </td>
                              <td className="p-4 text-right">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  profitMargin > 30
                                    ? 'bg-green-100 text-green-800'
                                    : profitMargin > 15
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {profitMargin.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {/* Staff Performance Tab */}
      {isAdmin && (
        <TabPanel value="staff" activeTab={activeTab}>
          {staffLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading staff performance report...</p>
              </div>
            </div>
          ) : !staffReport || staffReport.staff_metrics.length === 0 ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <Card className="p-6">
                <p className="text-gray-600">No staff performance data available.</p>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">Performance Summary Table</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Detailed metrics for all staff members</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Staff Member</th>
                          <th className="p-4 text-right">Revenue</th>
                          <th className="p-4 text-right">Profit</th>
                          <th className="p-4 text-center">Transactions</th>
                          <th className="p-4 text-center">Units Sold</th>
                          <th className="p-4 text-right">Avg Sale</th>
                          <th className="p-4 text-center">Profit %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedByRevenue.map((staff) => {
                          const profitMargin = staff.total_revenue > 0
                            ? (staff.total_profit / staff.total_revenue) * 100
                            : 0;

                          return (
                            <tr key={staff.staff_id} className="border-t hover:bg-muted/50">
                              <td className="p-4">
                                <div>
                                  <p className="font-medium text-gray-900">{staff.full_name}</p>
                                  <p className="text-xs text-gray-500">@{staff.username}</p>
                                </div>
                              </td>
                              <td className="p-4 text-right font-bold text-gray-900">
                                {formatCurrency(staff.total_revenue)}
                              </td>
                              <td className="p-4 text-right font-semibold text-green-600">
                                {formatCurrency(staff.total_profit)}
                              </td>
                              <td className="p-4 text-center">{staff.total_sales}</td>
                              <td className="p-4 text-center">{staff.total_units_sold}</td>
                              <td className="p-4 text-right">{formatCurrency(staff.avg_sale_value)}</td>
                              <td className="p-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  profitMargin >= 30
                                    ? 'bg-green-100 text-green-800'
                                    : profitMargin >= 20
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {profitMargin.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="p-4 text-gray-900">TOTAL</td>
                          <td className="p-4 text-right text-gray-900">
                            {formatCurrency(staffReport.staff_metrics.reduce((sum, s) => sum + s.total_revenue, 0))}
                          </td>
                          <td className="p-4 text-right text-green-600">
                            {formatCurrency(staffReport.staff_metrics.reduce((sum, s) => sum + s.total_profit, 0))}
                          </td>
                          <td className="p-4 text-center">
                            {staffReport.staff_metrics.reduce((sum, s) => sum + s.total_sales, 0)}
                          </td>
                          <td className="p-4 text-center">
                            {staffReport.staff_metrics.reduce((sum, s) => sum + s.total_units_sold, 0)}
                          </td>
                          <td className="p-4" colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {/* Reconciliation Tab */}
      {!isStaff && (
        <TabPanel value="reconciliation" activeTab={activeTab}>
          {salesLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading reconciliation data...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {paymentMethodStats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(paymentMethodStats).map(([method, data]) => (
                    <Card key={method}>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-600">{method}</p>
                            <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(data.total)}</p>
                            <p className="text-xs text-gray-500 mt-1">{data.count} transactions</p>
                          </div>
                          <div className="bg-primary-100 text-primary-600 rounded-lg p-3"><DollarSign className="w-6 h-6" /></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <Card>
                <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-medium">
                        <tr>
                          <th className="p-4 text-left">Date</th>
                          <th className="p-4 text-left">Customer</th>
                          <th className="p-4 text-left">Staff</th>
                          <th className="p-4 text-right">Amount</th>
                          <th className="p-4 text-center">Payment</th>
                          <th className="p-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map(sale => (
                          <tr key={sale.id} className="border-t hover:bg-muted/50">
                            <td className="p-4">{formatDate(sale.created_at)}</td>
                            <td className="p-4">{sale.customer_name || 'Walk-in'}</td>
                            <td className="p-4">{sale.user.full_name}</td>
                            <td className="p-4 text-right font-bold">{formatCurrency(sale.total)}</td>
                            <td className="p-4 text-center"><span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{formatPaymentMethod(sale.payment_method)}</span></td>
                            <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-xs ${sale.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{sale.status.toUpperCase()}</span></td>
                          </tr>
                        ))}
                        {sales.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-gray-500">No transactions found.</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabPanel>
      )}

      {/* Sales History Tab */}
      <TabPanel value="sales" activeTab={activeTab}>
        {salesHistoryLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading sales data...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {salesSummary && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Card className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                        <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{formatCurrency(salesSummary.total_revenue)}</p>
                        <div className="flex items-center gap-1 mt-2 text-sm text-green-600"><DollarSign className="w-4 h-4" /><span>{selectedOption.label}</span></div>
                      </div>
                      <div className="bg-green-100 text-green-600 rounded-lg p-3"><DollarSign className="w-6 h-6" /></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">Total Sales</p>
                        <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">{salesSummary.total_sales.toLocaleString()}</p>
                        <div className="flex items-center gap-1 mt-2 text-sm text-blue-600"><ShoppingCart className="w-4 h-4" /><span>{salesSummary.total_sales} {salesSummary.total_sales === 1 ? 'transaction' : 'transactions'}</span></div>
                      </div>
                      <div className="bg-blue-100 text-blue-600 rounded-lg p-3"><ShoppingCart className="w-6 h-6" /></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Desktop Sales Table */}
            <Card className="hidden lg:block">
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">Sales Transactions ({salesHistory.length})</CardTitle>
                <p className="text-sm text-gray-600 mt-1">Showing results for {selectedOption.label}</p>
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
                      {salesHistory.map((sale) => (
                        <React.Fragment key={sale.id}>
                          <tr className={`border-t hover:bg-muted/50 cursor-pointer transition-colors ${expandedSaleId === sale.id ? 'bg-muted/50' : ''}`} onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}>
                            <td className="p-4 text-center">{expandedSaleId === sale.id ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}</td>
                            <td className="p-4">{formatDate(sale.created_at)}</td>
                            <td className="p-4 font-medium">{sale.customer_name || 'Walk-in Customer'}</td>
                            <td className="p-4">{sale.branch ? (<div className="flex flex-col"><span className="text-sm font-medium">{sale.branch.name}</span><span className="text-xs text-muted-foreground">{sale.branch.subdomain}</span></div>) : (<span className="text-sm text-gray-500 italic">Main Location</span>)}</td>
                            <td className="p-4"><div className="flex items-center gap-2"><span className="text-sm font-medium">{sale.user.full_name}</span><span className="text-xs text-muted-foreground">@{sale.user.username}</span></div></td>
                            <td className="p-4 text-center"><div className="text-xs text-muted-foreground">{sale.sale_items.length} items</div></td>
                            <td className="p-4 text-right font-bold">{formatCurrency(sale.total)}</td>
                            <td className="p-4 text-center"><span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">{sale.payment_method}</span></td>
                            <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-xs ${sale.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{sale.status.toUpperCase()}</span></td>
                          </tr>
                          {expandedSaleId === sale.id && (
                            <tr className="bg-muted/30 border-t border-b">
                              <td colSpan={9} className="p-0">
                                <div className="p-4 md:p-6 space-y-4">
                                  <div className="flex items-center gap-2 mb-4"><Package className="h-5 w-5 text-gray-500" /><h3 className="font-semibold text-gray-900">Transaction Details</h3></div>
                                  <div className="bg-white rounded-lg border overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                        <tr><th className="p-3 text-left">Item</th><th className="p-3 text-center">Quantity</th><th className="p-3 text-right">Unit Price</th><th className="p-3 text-right">Subtotal</th></tr>
                                      </thead>
                                      <tbody className="divide-y">
                                        {sale.sale_items.map((item) => (
                                          <tr key={item.id} className="hover:bg-gray-50/50">
                                            <td className="p-3"><div className="flex items-center gap-3"><ProductImage imageUrl={item.product.image_url} productName={item.product.name} size="thumb" className="w-10 h-10 object-cover rounded-md border" /><div><p className="font-medium text-gray-900">{item.product.name}</p><p className="text-xs text-gray-500">{item.product.sku}</p></div></div></td>
                                            <td className="p-3 text-center"><span className="font-medium">{item.quantity}</span><span className="text-xs text-gray-500 ml-1">{item.product.unit}</span></td>
                                            <td className="p-3 text-right text-gray-600">{formatCurrency(item.price)}</td>
                                            <td className="p-3 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot className="bg-gray-50 border-t font-medium">
                                        <tr><td colSpan={3} className="p-3 text-right text-gray-600">Subtotal</td><td className="p-3 text-right">{formatCurrency(sale.subtotal)}</td></tr>
                                        <tr><td colSpan={3} className="p-3 text-right text-gray-600">Tax</td><td className="p-3 text-right">{formatCurrency(sale.tax)}</td></tr>
                                        <tr className="border-t border-gray-200"><td colSpan={3} className="p-3 text-right font-bold text-gray-900">Total</td><td className="p-3 text-right font-bold text-primary-600">{formatCurrency(sale.total)}</td></tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                  {sale.notes && (<div className="bg-yellow-50 p-4 rounded-md border border-yellow-100 text-sm"><span className="font-semibold text-yellow-800">Notes: </span><span className="text-yellow-700">{sale.notes}</span></div>)}
                                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                    <div className="flex justify-between items-center mb-3">
                                      <h4 className="font-semibold text-gray-900 flex items-center gap-2"><Mail className="h-4 w-4" />Customer & Receipt Management</h4>
                                      {editingSaleId === sale.id ? (<div className="flex gap-2"><Button size="sm" onClick={() => handleUpdateCustomer(sale.id)}><Save className="h-3 w-3 mr-1" /> Save</Button><Button size="sm" variant="outline" onClick={() => setEditingSaleId(null)}><X className="h-3 w-3" /></Button></div>) : (<Button size="sm" variant="outline" onClick={() => { setEditingSaleId(sale.id); setCustomerName(sale.customer_name || ''); setCustomerEmail(sale.customer_email || ''); setCustomerPhone(sale.customer_phone || ''); }}><Edit className="h-3 w-3 mr-1" /> Edit Info</Button>)}
                                    </div>
                                    {editingSaleId === sale.id ? (<div className="space-y-2"><Input placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /><Input type="email" placeholder="Email Address" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /><Input type="tel" placeholder="Phone (e.g., +254712345678)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>) : (<div className="space-y-1 text-sm mb-3"><p><strong>Name:</strong> {sale.customer_name || <span className="text-gray-500 italic">Not provided</span>}</p><p><strong>Email:</strong> {sale.customer_email || <span className="text-gray-500 italic">Not provided</span>}</p><p><strong>Phone:</strong> {sale.customer_phone || <span className="text-gray-500 italic">Not provided</span>}</p></div>)}
                                    <div className="flex gap-2 mt-3">
                                      <Button size="sm" disabled={!sale.customer_email || sendingEmail === sale.id} onClick={() => handleSendEmail(sale.id)} className="flex items-center gap-1">{sale.email_sent && <CheckCircle className="h-3 w-3 text-green-600" />}<Mail className="h-3 w-3" />{sendingEmail === sale.id ? 'Sending...' : 'Send Email'}</Button>
                                      <Button size="sm" variant="outline" disabled={!sale.customer_phone} onClick={() => handleSendWhatsApp(sale)} className="flex items-center gap-1">{sale.whatsapp_sent && <CheckCircle className="h-3 w-3 text-green-600" />}<MessageCircle className="h-3 w-3" />WhatsApp</Button>
                                    </div>
                                    {(sale.email_sent || sale.whatsapp_sent) && (<div className="mt-2 flex gap-2">{sale.email_sent && <Badge variant="success" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />Email Sent</Badge>}{sale.whatsapp_sent && <Badge variant="success" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />WhatsApp Sent</Badge>}</div>)}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {salesHistory.length === 0 && (<tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No sales records found for this period.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile Sales Cards */}
            <div className="lg:hidden space-y-4">
              <div className="flex items-center justify-between px-1"><h2 className="text-lg font-semibold text-gray-900">Sales Transactions ({salesHistory.length})</h2></div>
              {salesHistory.map((sale) => (
                <Card key={sale.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1"><h3 className="font-semibold text-gray-900">{sale.customer_name || 'Walk-in Customer'}</h3><Badge variant={sale.status === 'completed' ? 'success' : 'warning'}>{sale.status.toUpperCase()}</Badge></div>
                        <p className="text-sm text-gray-600">{formatDate(sale.created_at)}</p>
                      </div>
                      <div className="text-right"><p className="text-lg font-bold text-primary-600">{formatCurrency(sale.total)}</p><Badge variant="secondary" className="text-xs mt-1">{sale.payment_method}</Badge></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3 pb-3 border-b">
                      <div><p className="text-gray-600">Branch</p><p className="font-medium text-gray-900">{sale.branch ? sale.branch.name : 'Main Location'}</p></div>
                      <div><p className="text-gray-600">Staff</p><p className="font-medium text-gray-900">{sale.user.full_name}</p></div>
                      <div><p className="text-gray-600">Items</p><p className="font-medium text-gray-900">{sale.sale_items.length} items</p></div>
                      <div><p className="text-gray-600">Subtotal</p><p className="font-medium text-gray-900">{formatCurrency(sale.subtotal)}</p></div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)} className="w-full">{expandedSaleId === sale.id ? (<><ChevronUp className="h-4 w-4 mr-2" />Hide Details</>) : (<><ChevronDown className="h-4 w-4 mr-2" />View Details</>)}</Button>
                    {expandedSaleId === sale.id && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Package className="h-4 w-4" />Items</h4>
                          <div className="space-y-3">
                            {sale.sale_items.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                                <ProductImage imageUrl={item.product.image_url} productName={item.product.name} size="thumb" className="w-12 h-12 object-cover rounded-md border flex-shrink-0" />
                                <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 truncate">{item.product.name}</p><p className="text-xs text-gray-500">{item.product.sku}</p><p className="text-sm text-gray-600 mt-1">{item.quantity} {item.product.unit} × {formatCurrency(item.price)}</p></div>
                                <div className="text-right"><p className="font-medium text-gray-900">{formatCurrency(item.subtotal)}</p></div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                          <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-medium">{formatCurrency(sale.subtotal)}</span></div>
                          <div className="flex justify-between text-sm"><span className="text-gray-600">Tax</span><span className="font-medium">{formatCurrency(sale.tax)}</span></div>
                          <div className="flex justify-between text-base font-bold border-t pt-2"><span>Total</span><span className="text-primary-600">{formatCurrency(sale.total)}</span></div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Mail className="h-4 w-4" />Customer Info</h4>
                            {editingSaleId === sale.id ? (<div className="flex gap-2"><Button size="sm" onClick={() => handleUpdateCustomer(sale.id)}><Save className="h-3 w-3 mr-1" /> Save</Button><Button size="sm" variant="outline" onClick={() => setEditingSaleId(null)}><X className="h-3 w-3" /></Button></div>) : (<Button size="sm" variant="outline" onClick={() => { setEditingSaleId(sale.id); setCustomerName(sale.customer_name || ''); setCustomerEmail(sale.customer_email || ''); setCustomerPhone(sale.customer_phone || ''); }}><Edit className="h-3 w-3 mr-1" /> Edit</Button>)}
                          </div>
                          {editingSaleId === sale.id ? (<div className="space-y-2"><Input placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /><Input type="email" placeholder="Email Address" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /><Input type="tel" placeholder="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>) : (<div className="space-y-1 text-sm mb-3"><p><strong>Name:</strong> {sale.customer_name || <span className="text-gray-500 italic">Not provided</span>}</p><p><strong>Email:</strong> {sale.customer_email || <span className="text-gray-500 italic">Not provided</span>}</p><p><strong>Phone:</strong> {sale.customer_phone || <span className="text-gray-500 italic">Not provided</span>}</p></div>)}
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" disabled={!sale.customer_email || sendingEmail === sale.id} onClick={() => handleSendEmail(sale.id)} className="flex-1">{sale.email_sent && <CheckCircle className="h-3 w-3 mr-1 text-green-600" />}<Mail className="h-3 w-3 mr-1" />{sendingEmail === sale.id ? 'Sending...' : 'Email'}</Button>
                            <Button size="sm" variant="outline" disabled={!sale.customer_phone} onClick={() => handleSendWhatsApp(sale)} className="flex-1">{sale.whatsapp_sent && <CheckCircle className="h-3 w-3 mr-1 text-green-600" />}<MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {salesHistory.length === 0 && (<Card><CardContent className="p-12 text-center text-gray-500"><ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-2" /><p>No sales records found for this period.</p></CardContent></Card>)}
            </div>
          </div>
        )}
      </TabPanel>

    </div>
  );
}
