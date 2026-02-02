import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, DashboardStats, FinancialReport } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowUp, AlertTriangle, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { BranchSelector } from '@/components/BranchSelector';

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
const STORAGE_KEY = 'dashboard-date-range';

export function Dashboard() {
  const { token, user } = useAuth();
  const permissions = usePermissions();
  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';

  const [stats, setStats] = useState<DashboardStats | null>(() => {
    const cached = localStorage.getItem('cached-dashboard-stats');
    return cached ? JSON.parse(cached) : null;
  });
  const [report, setReport] = useState<FinancialReport | null>(() => {
    const cached = localStorage.getItem('cached-dashboard-report');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(!stats);
  const [isOffline, setIsOffline] = useState(false);

  // Branch filtering state
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(() => {
    // Branch admins: locked to their branch
    if (permissions.isBranchAdmin && user?.branch_id) {
      return user.branch_id;
    }
    // Owners: default to "All Locations" (null)
    return null;
  });

  // Date range state with localStorage persistence
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as DateRange) || DEFAULT_DATE_RANGE;
  });

  // Derived state for selected option
  const selectedOption = DATE_RANGE_OPTIONS.find(
    opt => opt.value === selectedDateRange
  ) || DATE_RANGE_OPTIONS[1];

  // Lock branch admins to their branch
  useEffect(() => {
    if (permissions.isBranchAdmin && user?.branch_id) {
      setSelectedBranchId(user.branch_id);
    }
  }, [permissions.isBranchAdmin, user?.branch_id]);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setLoading(true);
      setIsOffline(false);
      try {
        const [statsData, reportData] = await Promise.all([
          api.getDashboardStats(token, selectedBranchId),
          api.getFinancialReport(token, selectedOption.days, selectedBranchId),
        ]);
        setStats(statsData);
        setReport(reportData);
        // Cache data for offline use
        localStorage.setItem('cached-dashboard-stats', JSON.stringify(statsData));
        localStorage.setItem('cached-dashboard-report', JSON.stringify(reportData));
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setIsOffline(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, selectedDateRange, selectedBranchId]);

  const handleDateRangeChange = (range: DateRange) => {
    setSelectedDateRange(range);
    localStorage.setItem(STORAGE_KEY, range);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Filters and Branch Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 flex items-center gap-2">
            {isStaff ? 'My Performance' : 'Dashboard'}
            {isOffline && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Offline Mode (Cached Data)
              </span>
            )}
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Welcome back! Here's your business overview.
          </p>
        </div>

        {/* Filters: Branch Selector + Date Range */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Branch Selector - Only for owners */}
          {permissions.isOwner && (
            <BranchSelector
              selectedBranchId={selectedBranchId}
              onBranchChange={setSelectedBranchId}
            />
          )}

          {/* Date Range Filter */}
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Total Revenue Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(report?.total_revenue || 0)}
              </p>
              <div className="flex items-center gap-1 mt-2 text-sm text-green-600">
                <ArrowUp className="w-4 h-4" />
                <span>{selectedOption.label}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses Card */}
        <Card className="overflow-hidden border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">Total Expenses</p>
              <p className="text-2xl md:text-3xl font-bold text-red-900 mt-2">
                {formatCurrency(report?.total_expenses || 0)}
              </p>
              <div className="flex items-center gap-1 mt-2 text-sm text-red-600">
                <Link to="/expenses" className="hover:underline">
                  View Details →
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net Profit Card */}
        <Card className="overflow-hidden border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-700">Net Profit</p>
              <p className="text-2xl md:text-3xl font-bold text-blue-900 mt-2">
                {formatCurrency((report?.total_profit || 0) - (report?.total_expenses || 0))}
              </p>
              <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
                <span>
                  Gross: {formatCurrency(report?.total_profit || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Sales Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Total Sales</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                {report?.revenue_by_date?.reduce((sum, day) => sum + day.orders, 0) || 0}
              </p>
              <div className="flex items-center gap-1 mt-2 text-sm text-gray-600">
                <span>{selectedOption.label}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Health Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Inventory Health</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-2">
                {stats?.total_products || 0}
              </p>
              <div className={`flex items-center gap-1 mt-2 text-sm ${
                stats?.low_stock_items ? 'text-red-600 font-semibold' : 'text-gray-600'
              }`}>
                {stats?.low_stock_items ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : null}
                <span>{stats?.low_stock_items || 0} Low Stock</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary Card - Shows Gross Profit breakdown */}
      {isAdmin && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-green-900">Gross Profit (Revenue - COGS)</h3>
                <p className="text-xs text-green-700 mt-1">
                  Revenue minus Cost of Goods Sold
                  {report?.total_revenue && report.total_revenue > 0
                    ? ` • ${((report.total_profit / report.total_revenue) * 100).toFixed(1)}% margin`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-900">{formatCurrency(report?.total_profit || 0)}</p>
                {stats?.total_stock_value !== null && (
                  <p className="text-xs text-green-700 mt-1">Stock Value: {formatCurrency(stats?.total_stock_value || 0)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Trend Chart - Hidden for "Today" view */}
      {selectedDateRange !== 'today' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              {isStaff ? `My Revenue Trend (${selectedOption.label})` : `Revenue Trend (${selectedOption.label})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={report?.revenue_by_date || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
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
      )}

      {/* View Detailed Reports Link */}
      <Card className="bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="bg-primary-100 text-primary-600 rounded-lg p-3">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Need More Insights?</h3>
              </div>
            </div>
            <Link to="/reports">
              <Button variant="default" size="sm" className="flex-shrink-0">
                View Detailed Reports →
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
