import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/Toast';
import RevokeSubscriptionModal from '@/components/RevokeSubscriptionModal';
import {
  Shield, LogOut, Users, Building2, DollarSign, TrendingUp,
  Search, Eye, Ban, CheckCircle, XCircle, UserPlus,
  Activity, Trash2, Key, AlertCircle, Menu, X, AlertTriangle,
  ChevronDown, ChevronRight, Package, Ruler, Edit2, Plus, Clock
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface PlatformMetrics {
  total_tenants: number;
  active_tenants: number;
  inactive_tenants: number;
  total_users: number;
  total_products: number;
  total_sales_amount: number;
  total_sales_count: number;
  tenants_by_plan: { [key: string]: number };
  new_tenants_this_month: number;
  new_tenants_this_week: number;
}

interface BranchDetail {
  tenant_id: number;
  name: string;
  subdomain: string;
  is_main: boolean;
  is_paid: boolean;
  is_cancelled: boolean;
  cancelled_at: string | null;
  subscription_end_date: string | null;
  is_active: boolean;
}

interface SubscriptionMetrics {
  total_branches: number;
  paid_branches: number;
  cancelled_branches: number;
  active_branches: number;
}

interface TenantStats {
  id: number;
  name: string;
  subdomain: string;
  owner_email: string;
  subscription_plan: string;
  billing_cycle?: string | null;
  subscription_status?: string | null;
  is_active: boolean;
  created_at: string;
  subscription_expires_at: string | null;
  next_billing_date?: string | null;
  user_count: number;
  product_count: number;
  total_sales: number;
  branch_count: number;
  parent_tenant_id: number | null;
  branch_details?: BranchDetail[];
  subscription_metrics?: SubscriptionMetrics;
}

interface Admin {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  env_based: boolean;
  created_at: string;
}

interface ActivityLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  admin_full_name: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

interface GlobalCategory {
  id: number;
  name: string;
  display_order: number;
  icon?: string;
  color?: string;
  is_active: boolean;
  target_margin?: number | null;
  minimum_margin?: number | null;
  created_at: string;
  updated_at: string;
  product_count: number;
  effective_target_margin: number;
  effective_minimum_margin: number;
}

interface GlobalUnit {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count: number;
}

interface TenantLoginInfo {
  tenant_id: number;
  tenant_name: string;
  tenant_subdomain: string;
  user_id: number;
  username: string;
  full_name: string;
  role: string;
  last_login_at: string;
}

interface UnsubscribedTenantInfo {
  id: number;
  name: string;
  subdomain: string;
  owner_email: string;
  subscription_status: string | null;
  trial_ends_at: string | null;
  next_billing_date: string | null;
  days_past_expiry: number;
  is_past_grace_period: boolean;
  is_manually_blocked: boolean;
  manually_blocked_at: string | null;
  manual_block_reason: string | null;
  user_count: number;
  product_count: number;
  total_sales: number;
}

interface TodayLoginsResponse {
  total_logins: number;
  unique_tenants: number;
  unique_users: number;
  logins: TenantLoginInfo[];
}

export default function SuperAdminPanel() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Overview state
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // const [filterPlan, setFilterPlan] = useState<string>('all'); // TODO: Implement plan filtering
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Admin management state
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [newAdminForm, setNewAdminForm] = useState({
    username: '',
    email: '',
    password: '',
    full_name: ''
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({ new_password: '' });
  
  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsFilter, setLogsFilter] = useState<string>('all');

  // Today's logins state
  const [todayLogins, setTodayLogins] = useState<TodayLoginsResponse | null>(null);

  // Unsubscribed tenants state
  const [unsubscribedTenants, setUnsubscribedTenants] = useState<UnsubscribedTenantInfo[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedTenantForBlock, setSelectedTenantForBlock] = useState<UnsubscribedTenantInfo | null>(null);
  const [blockReason, setBlockReason] = useState('');

  // Categories state
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<GlobalCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    display_order: 0,
    icon: '',
    color: '',
    is_active: true,
    target_margin: null as number | null,
    minimum_margin: null as number | null
  });

  // Units state
  const [units, setUnits] = useState<GlobalUnit[]>([]);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<GlobalUnit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: '',
    display_order: 0,
    is_active: true
  });

  // Subscription management state - TODO: Implement subscription extension UI
  // const [showExtendModal, setShowExtendModal] = useState(false);
  // const [selectedTenant, setSelectedTenant] = useState<TenantStats | null>(null);
  // const [extendDays, setExtendDays] = useState(30);

  // Revoke subscription modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedTenantForRevoke, setSelectedTenantForRevoke] = useState<TenantStats | null>(null);

  // Expandable row state for branch details
  const [expandedTenantId, setExpandedTenantId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = localStorage.getItem('super_admin_token');

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    if (activeSection === 'overview') {
      fetchOverviewData();
    } else if (activeSection === 'admins') {
      fetchAdmins();
    } else if (activeSection === 'logs') {
      fetchActivityLogs();
    } else if (activeSection === 'categories') {
      fetchCategories();
    } else if (activeSection === 'units') {
      fetchUnits();
    } else if (activeSection === 'unsubscribed') {
      fetchUnsubscribedTenants();
    }
  }, [token, activeSection]);

  // Refetch logs when filter changes
  useEffect(() => {
    if (activeSection === 'logs' && token) {
      fetchActivityLogs();
    }
  }, [logsFilter]);

  useEffect(() => {
    // Apply tenant filters
    let filtered = [...tenants];
    if (searchQuery) {
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subdomain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.owner_email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    // TODO: Add filterPlan functionality
    // if (filterPlan !== 'all') {
    //   filtered = filtered.filter(t => t.subscription_plan === filterPlan);
    // }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => 
        filterStatus === 'active' ? t.is_active : !t.is_active
      );
    }
    setFilteredTenants(filtered);
  }, [searchQuery, filterStatus, tenants]);

  const fetchOverviewData = async () => {
    setLoading(true);
    setError('');
    try {
      const [metricsRes, tenantsRes, loginsRes] = await Promise.all([
        fetch(`${API_URL}/api/platform/metrics`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/platform/tenants?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/platform/logins-today`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!metricsRes.ok || !tenantsRes.ok) throw new Error('Failed to fetch data');

      setMetrics(await metricsRes.json());
      const tenantsData = await tenantsRes.json();
      setTenants(tenantsData);
      setFilteredTenants(tenantsData);

      // Today's logins (optional - don't fail if this errors)
      if (loginsRes.ok) {
        setTodayLogins(await loginsRes.json());
      }
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes('401') || err.message.includes('403')) {
        localStorage.removeItem('super_admin_token');
        navigate('/admin/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/platform/admins`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch admins');
      setAdmins(await response.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    setLoading(true);
    try {
      const url = logsFilter === 'all'
        ? `${API_URL}/api/platform/activity-logs?limit=100`
        : `${API_URL}/api/platform/activity-logs?action=${logsFilter}&limit=100`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch logs');
      setActivityLogs(await response.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/platform/categories?active_only=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to fetch categories (${response.status})`);
      }
      setCategories(await response.json());
    } catch (err: any) {
      console.error('Fetch categories error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/platform/units?active_only=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to fetch units (${response.status})`);
      }
      setUnits(await response.json());
    } catch (err: any) {
      console.error('Fetch units error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnsubscribedTenants = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/unsubscribed`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to fetch unsubscribed tenants (${response.status})`);
      }
      setUnsubscribedTenants(await response.json());
    } catch (err: any) {
      console.error('Fetch unsubscribed tenants error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBlockTenant = async () => {
    if (!selectedTenantForBlock) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/${selectedTenantForBlock.id}/block`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: blockReason || null })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to block tenant');
      }

      toast.success(`Tenant "${selectedTenantForBlock.name}" has been blocked`);
      setShowBlockModal(false);
      setSelectedTenantForBlock(null);
      setBlockReason('');
      fetchUnsubscribedTenants();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleUnblockTenant = async (tenant: UnsubscribedTenantInfo) => {
    if (!confirm(`Unblock "${tenant.name}"? They will still need an active subscription to make transactions.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/${tenant.id}/unblock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to unblock tenant');
      }

      toast.success(`Tenant "${tenant.name}" has been unblocked`);
      fetchUnsubscribedTenants();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/platform/admins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newAdminForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create admin');
      }

      toast.success('Admin created successfully!');
      setShowAddAdminModal(false);
      setNewAdminForm({ username: '', email: '', password: '', full_name: '' });
      fetchAdmins();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleToggleAdminStatus = async (admin: Admin) => {
    if (!confirm(`${admin.is_active ? 'Disable' : 'Enable'} ${admin.full_name}?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/admins/${admin.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !admin.is_active })
      });

      if (!response.ok) throw new Error('Failed to update admin');
      toast.success(`Admin ${admin.is_active ? 'disabled' : 'enabled'} successfully`);
      fetchAdmins();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteAdmin = async (admin: Admin) => {
    if (!confirm(`Are you sure you want to delete ${admin.full_name}? This action cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/admins/${admin.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete admin');
      }

      toast.success('Admin deleted successfully');
      fetchAdmins();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/admins/${selectedAdmin.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(resetPasswordForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset password');
      }

      toast.success('Password reset successfully!');
      setShowResetPasswordModal(false);
      setResetPasswordForm({ new_password: '' });
      setSelectedAdmin(null);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  // Category CRUD handlers
  const handleOpenCategoryModal = (category?: GlobalCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        display_order: category.display_order,
        icon: category.icon || '',
        color: category.color || '',
        is_active: category.is_active,
        target_margin: category.target_margin ?? null,
        minimum_margin: category.minimum_margin ?? null
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        display_order: 0,
        icon: '',
        color: '',
        is_active: true,
        target_margin: null,
        minimum_margin: null
      });
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCategory
        ? `${API_URL}/api/platform/categories/${editingCategory.id}`
        : `${API_URL}/api/platform/categories`;
      const method = editingCategory ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: categoryForm.name,
          display_order: categoryForm.display_order,
          icon: categoryForm.icon || null,
          color: categoryForm.color || null,
          is_active: categoryForm.is_active,
          target_margin: categoryForm.target_margin,
          minimum_margin: categoryForm.minimum_margin
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save category');
      }

      toast.success(editingCategory ? 'Category updated!' : 'Category created!');
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteCategory = async (category: GlobalCategory) => {
    if (!confirm(`Delete category "${category.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/categories/${category.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete category');
      }

      toast.success('Category deleted!');
      fetchCategories();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  // Unit CRUD handlers
  const handleOpenUnitModal = (unit?: GlobalUnit) => {
    if (unit) {
      setEditingUnit(unit);
      setUnitForm({
        name: unit.name,
        display_order: unit.display_order,
        is_active: unit.is_active
      });
    } else {
      setEditingUnit(null);
      setUnitForm({
        name: '',
        display_order: 0,
        is_active: true
      });
    }
    setShowUnitModal(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingUnit
        ? `${API_URL}/api/platform/units/${editingUnit.id}`
        : `${API_URL}/api/platform/units`;
      const method = editingUnit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(unitForm)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save unit');
      }

      toast.success(editingUnit ? 'Unit updated!' : 'Unit created!');
      setShowUnitModal(false);
      fetchUnits();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDeleteUnit = async (unit: GlobalUnit) => {
    if (!confirm(`Delete unit "${unit.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/units/${unit.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete unit');
      }

      toast.success('Unit deleted!');
      fetchUnits();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAction = (action: string) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const handleLogout = () => {
    localStorage.removeItem('super_admin_token');
    navigate('/admin/login');
  };

  const handleToggleTenantStatus = async (tenantId: number, currentStatus: boolean) => {
    if (!confirm(`${currentStatus ? 'Suspend' : 'Activate'} this tenant?`)) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (!response.ok) throw new Error('Failed to update tenant');
      toast.success(`Tenant ${currentStatus ? 'suspended' : 'activated'} successfully`);
      fetchOverviewData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleImpersonate = async (tenantId: number) => {
    if (!confirm('You will be logged in as this tenant\'s admin. Continue?')) return;

    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to impersonate');
      const data = await response.json();

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('tenant', JSON.stringify(data.tenant));
      window.open('/dashboard', '_blank');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  // TODO: Implement subscription extension UI
  // const handleExtendSubscription = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (!selectedTenant) return;
  //   ... implementation
  // };

  // TODO: Implement subscription status toggle UI
  // const handleToggleSubscriptionStatus = async (tenant: TenantStats) => {
  //   ... implementation
  // };

  const handleRevokeSubscription = async (tenantId: number) => {
    try {
      const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}/revoke-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to revoke subscription');
      }

      const data = await response.json();
      toast.success(data.message);
      fetchOverviewData();
    } catch (err: any) {
      console.error('Revoke error:', err);
      throw err; // Re-throw to be caught by modal
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview & Tenants', icon: Building2 },
    { id: 'unsubscribed', label: 'Unsubscribed', icon: AlertTriangle },
    { id: 'categories', label: 'Categories', icon: Package },
    { id: 'units', label: 'Units', icon: Ruler },
    { id: 'admins', label: 'Admin Management', icon: Users },
    { id: 'logs', label: 'Activity Logs', icon: Activity }
  ];

  if (loading && activeSection === 'overview' && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading platform data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-red-600 text-white shadow-lg sticky top-0 z-50">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-red-700 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Shield className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Platform Admin</h1>
              <p className="text-sm text-red-100 hidden sm:block">System-wide management</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="text-white hover:bg-red-700"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-64 bg-white border-r border-gray-200 shadow-lg lg:shadow-none
          transform transition-transform duration-300 ease-in-out lg:transform-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
          mt-[72px] lg:mt-0
        `}>
          {/* Close button for mobile */}
          <div className="lg:hidden flex justify-end p-4">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${isActive
                      ? 'bg-red-50 text-red-600 font-medium shadow-sm'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer info */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />
              <span className="font-medium">Super Admin</span>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          {/* Overview Section */}
          {activeSection === 'overview' && (
            <div>
              {/* Metrics Grid */}
              {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Building2 className="w-8 h-8 text-blue-600" />
                      <span className="text-2xl font-bold">{metrics.total_tenants}</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">Total Tenants</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {metrics.active_tenants} active, {metrics.inactive_tenants} inactive
                    </p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Users className="w-8 h-8 text-green-600" />
                      <span className="text-2xl font-bold">{metrics.total_users}</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">Total Users</h3>
                    <p className="text-xs text-gray-500 mt-1">Across all tenants</p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <DollarSign className="w-8 h-8 text-emerald-600" />
                      <span className="text-2xl font-bold">{metrics.total_sales_count}</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">Total Sales</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatCurrency(metrics.total_sales_amount)}
                    </p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <TrendingUp className="w-8 h-8 text-purple-600" />
                      <span className="text-2xl font-bold">{metrics.new_tenants_this_month}</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">New This Month</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {metrics.new_tenants_this_week} this week
                    </p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <Clock className="w-8 h-8 text-indigo-600" />
                      <span className="text-2xl font-bold">{todayLogins?.total_logins ?? 0}</span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-600">Logins Today</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {todayLogins?.unique_tenants ?? 0} tenants, {todayLogins?.unique_users ?? 0} users
                    </p>
                  </Card>
                </div>
              )}

              {/* Tenants Table */}
              <Card className="p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <h2 className="text-lg font-bold">All Tenants ({filteredTenants.length})</h2>
                  
                  <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Search tenants..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10"></th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing Cycle</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscription</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTenants.map((tenant) => (
                        <>
                        <tr key={tenant.id} className="hover:bg-gray-50">
                          <td className="px-2 py-4">
                            {tenant.branch_details && tenant.branch_details.length > 0 && (
                              <button
                                onClick={() => setExpandedTenantId(expandedTenantId === tenant.id ? null : tenant.id)}
                                className="text-gray-600 hover:text-red-600 transition-colors p-1"
                                title={expandedTenantId === tenant.id ? 'Collapse' : 'Expand to view branches'}
                              >
                                {expandedTenantId === tenant.id ? (
                                  <ChevronDown className="w-5 h-5" />
                                ) : (
                                  <ChevronRight className="w-5 h-5" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{tenant.name}</p>
                              <p className="text-sm text-gray-500">{tenant.subdomain}</p>
                              <p className="text-xs text-gray-400">{tenant.owner_email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {tenant.billing_cycle ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 capitalize">
                                {tenant.billing_cycle === 'quarterly' && '📅 Quarterly'}
                                {tenant.billing_cycle === 'semi_annual' && '📅 Semi-Annual'}
                                {tenant.billing_cycle === 'annual' && '📅 Annual'}
                                {!['quarterly', 'semi_annual', 'annual'].includes(tenant.billing_cycle) && tenant.billing_cycle}
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                Not Set
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              {/* Subscription Status Badge */}
                              {tenant.subscription_status === 'trial' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 inline-block mb-1">
                                  Trial
                                </span>
                              )}
                              {tenant.subscription_status === 'active' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 inline-block mb-1">
                                  Active
                                </span>
                              )}
                              {tenant.subscription_status === 'cancelled' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 inline-block mb-1">
                                  Cancelled
                                </span>
                              )}
                              {tenant.subscription_status === 'expired' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 inline-block mb-1">
                                  Expired
                                </span>
                              )}
                              {!tenant.subscription_status && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 inline-block mb-1">
                                  Unknown
                                </span>
                              )}
                              
                              {/* End Date */}
                              {tenant.next_billing_date && (
                                <p className="text-xs text-gray-600">
                                  Ends: {new Date(tenant.next_billing_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {tenant.is_active ? (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm">Active</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-600">
                                <XCircle className="w-4 h-4" />
                                <span className="text-sm">Suspended</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-600">
                              <p>{tenant.user_count} users</p>
                              <p>{tenant.product_count} products</p>
                              <p className="font-medium">{formatCurrency(tenant.total_sales)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleImpersonate(tenant.id)}
                                title="Impersonate tenant admin"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleTenantStatus(tenant.id, tenant.is_active)}
                                title={tenant.is_active ? 'Suspend tenant' : 'Activate tenant'}
                                className={tenant.is_active ? 'text-red-600' : 'text-green-600'}
                              >
                                {tenant.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              </Button>
                              {(tenant.subscription_status === 'active' || tenant.subscription_status === 'trial') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedTenantForRevoke(tenant);
                                    setShowRevokeModal(true);
                                  }}
                                  title="Revoke subscription completely"
                                  className="text-red-700 hover:text-red-900 hover:bg-red-50"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Branch details expanded row */}
                        {expandedTenantId === tenant.id && tenant.branch_details && (
                          <tr key={`${tenant.id}-details`}>
                            <td colSpan={7} className="bg-gray-50 p-4 border-t border-gray-200">
                              <div className="ml-8">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-gray-800">
                                    Branch Subscriptions ({tenant.branch_details.length})
                                  </h4>
                                  {tenant.subscription_metrics && tenant.subscription_metrics.cancelled_branches > 0 && (
                                    <div className="flex items-center gap-2 text-orange-600 text-sm">
                                      <AlertCircle className="h-4 w-4" />
                                      <span>{tenant.subscription_metrics.cancelled_branches} cancelled</span>
                                    </div>
                                  )}
                                </div>

                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-gray-100 border-b border-gray-200">
                                      <tr>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Branch Name</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Subdomain</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Type</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Expires</th>
                                        <th className="text-left py-2 px-3 font-medium text-gray-700">Cancelled</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {tenant.branch_details.map(branch => (
                                        <tr key={branch.tenant_id} className="hover:bg-gray-50">
                                          <td className="py-2 px-3 font-medium text-gray-900">{branch.name}</td>
                                          <td className="py-2 px-3 text-gray-600">{branch.subdomain}</td>
                                          <td className="py-2 px-3">
                                            {branch.is_main ? (
                                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                                Main
                                              </span>
                                            ) : (
                                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                                Branch
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3">
                                            {branch.is_active ? (
                                              branch.is_paid ? (
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                                  Active & Paid
                                                </span>
                                              ) : (
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                                  Active (Unpaid)
                                                </span>
                                              )
                                            ) : (
                                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                                Inactive
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-gray-600">
                                            {branch.subscription_end_date
                                              ? new Date(branch.subscription_end_date).toLocaleDateString()
                                              : '—'
                                            }
                                          </td>
                                          <td className="py-2 px-3">
                                            {branch.is_cancelled ? (
                                              <div className="text-orange-600 flex items-center gap-1">
                                                <AlertCircle className="h-4 w-4" />
                                                <span>
                                                  {branch.cancelled_at
                                                    ? `${new Date(branch.cancelled_at).toLocaleDateString()}`
                                                    : 'Yes'
                                                  }
                                                </span>
                                              </div>
                                            ) : (
                                              <span className="text-gray-400">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </>
                      ))}
                    </tbody>
                  </table>

                  {filteredTenants.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No tenants found</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Unsubscribed Tenants Section */}
          {activeSection === 'unsubscribed' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <AlertTriangle className="w-8 h-8 text-orange-600" />
                    <span className="text-2xl font-bold">{unsubscribedTenants.length}</span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-600">Total Unsubscribed</h3>
                  <p className="text-xs text-gray-500 mt-1">Expired or cancelled subscriptions</p>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <XCircle className="w-8 h-8 text-red-600" />
                    <span className="text-2xl font-bold">
                      {unsubscribedTenants.filter(t => t.is_past_grace_period).length}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-600">Past Grace Period</h3>
                  <p className="text-xs text-gray-500 mt-1">More than 30 days overdue</p>
                </Card>

                <Card className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <Ban className="w-8 h-8 text-red-800" />
                    <span className="text-2xl font-bold">
                      {unsubscribedTenants.filter(t => t.is_manually_blocked).length}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-600">Currently Blocked</h3>
                  <p className="text-xs text-gray-500 mt-1">Transactions disabled</p>
                </Card>
              </div>

              {/* Unsubscribed Tenants Table */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-bold">Unsubscribed Businesses ({unsubscribedTenants.length})</h2>
                    <p className="text-sm text-gray-500">Businesses with expired or cancelled subscriptions</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocked</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {unsubscribedTenants.map((tenant) => (
                        <tr
                          key={tenant.id}
                          className={`hover:bg-gray-50 ${tenant.is_past_grace_period ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{tenant.name}</p>
                              <p className="text-sm text-gray-500">{tenant.subdomain}</p>
                              <p className="text-xs text-gray-400">{tenant.owner_email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              {tenant.subscription_status === 'expired' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                  Expired
                                </span>
                              )}
                              {tenant.subscription_status === 'cancelled' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                                  Cancelled
                                </span>
                              )}
                              {tenant.subscription_status === 'trial' && (
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                  Trial Expired
                                </span>
                              )}
                              {tenant.is_past_grace_period && (
                                <span className="block mt-1 px-2 py-1 text-xs font-medium rounded-full bg-red-200 text-red-900">
                                  Past Grace Period
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-lg font-bold ${
                              tenant.days_past_expiry > 30
                                ? 'text-red-600'
                                : tenant.days_past_expiry > 14
                                  ? 'text-orange-600'
                                  : 'text-yellow-600'
                            }`}>
                              {tenant.days_past_expiry} days
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-600">
                              <p>{tenant.user_count} users</p>
                              <p>{tenant.product_count} products</p>
                              <p className="font-medium">{formatCurrency(tenant.total_sales)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {tenant.is_manually_blocked ? (
                              <div>
                                <span className="flex items-center gap-1 text-red-700">
                                  <Ban className="w-4 h-4" />
                                  <span className="text-sm font-medium">Blocked</span>
                                </span>
                                {tenant.manually_blocked_at && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {formatDate(tenant.manually_blocked_at).split(',')[0]}
                                  </p>
                                )}
                                {tenant.manual_block_reason && (
                                  <p className="text-xs text-gray-600 mt-1 max-w-xs truncate" title={tenant.manual_block_reason}>
                                    {tenant.manual_block_reason}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">Not blocked</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              {tenant.is_manually_blocked ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUnblockTenant(tenant)}
                                  title="Unblock tenant"
                                  className="text-green-600 hover:text-green-800 hover:bg-green-50"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Unblock
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedTenantForBlock(tenant);
                                    setShowBlockModal(true);
                                  }}
                                  title="Block tenant transactions"
                                  className={`${
                                    tenant.is_past_grace_period
                                      ? 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                      : 'text-orange-600 hover:text-orange-800 hover:bg-orange-50'
                                  }`}
                                >
                                  <Ban className="w-4 h-4 mr-1" />
                                  Block
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleImpersonate(tenant.id)}
                                title="Impersonate tenant admin"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {unsubscribedTenants.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-300" />
                      <p className="font-medium">All businesses have active subscriptions!</p>
                      <p className="text-sm text-gray-400 mt-1">No unsubscribed tenants found</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Admin Management Section */}
          {activeSection === 'admins' && (
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold">Platform Administrators ({admins.length})</h2>
                <Button onClick={() => setShowAddAdminModal(true)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Admin
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{admin.full_name}</p>
                            <p className="text-sm text-gray-500">{admin.username}</p>
                            <p className="text-xs text-gray-400">{admin.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {admin.is_active ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {admin.env_based ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 flex items-center gap-1 w-fit">
                              <Shield className="w-3 h-3" />
                              Env-Based
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              UI-Created
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {formatDate(admin.created_at).split(',')[0]}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            {!admin.env_based && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleToggleAdminStatus(admin)}
                                  title={admin.is_active ? 'Disable admin' : 'Enable admin'}
                                >
                                  {admin.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedAdmin(admin);
                                    setShowResetPasswordModal(true);
                                  }}
                                  title="Reset password"
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteAdmin(admin)}
                                  className="text-red-600"
                                  title="Delete admin"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {admin.env_based && (
                              <span className="text-xs text-gray-500 italic flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Managed via .env
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Activity Logs Section */}
          {activeSection === 'logs' && (
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold">Activity Logs ({activityLogs.length})</h2>
                <select
                  value={logsFilter}
                  onChange={(e) => setLogsFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="all">All Actions</option>
                  <option value="create_admin">Create Admin</option>
                  <option value="update_admin">Update Admin</option>
                  <option value="delete_admin">Delete Admin</option>
                  <option value="reset_admin_password">Reset Password</option>
                  <option value="suspend_tenant">Suspend Tenant</option>
                  <option value="activate_tenant">Activate Tenant</option>
                  <option value="block_tenant">Block Tenant</option>
                  <option value="unblock_tenant">Unblock Tenant</option>
                  <option value="revoke_subscription">Revoke Subscription</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{log.admin_full_name}</p>
                            <p className="text-sm text-gray-500">{log.admin_username}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {log.target_type && (
                            <div>
                              <p className="font-medium">{log.target_type}</p>
                              <p className="text-xs text-gray-500">ID: {log.target_id}</p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {log.details && (
                            <pre className="text-xs text-gray-600 max-w-xs overflow-auto">
                              {JSON.stringify(JSON.parse(log.details), null, 2)}
                            </pre>
                          )}
                          {log.ip_address && (
                            <p className="text-xs text-gray-500 mt-1">IP: {log.ip_address}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {formatDate(log.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {activityLogs.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No activity logs found</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Categories Management Section */}
          {activeSection === 'categories' && (
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-bold">Global Categories ({categories.length})</h2>
                  <p className="text-sm text-gray-500">Manage categories available to all tenants</p>
                </div>
                <Button onClick={() => handleOpenCategoryModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Display Order</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Margins</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categories.map((category) => (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {category.color && (
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: category.color + '20' }}
                              >
                                <Package className="w-4 h-4" style={{ color: category.color }} />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{category.name}</p>
                              {category.icon && <p className="text-xs text-gray-500">Icon: {category.icon}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{category.display_order}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          <div>
                            <p>Target: {category.effective_target_margin}%</p>
                            <p>Min: {category.effective_minimum_margin}%</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {category.is_active ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{category.product_count}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenCategoryModal(category)}
                              title="Edit category"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteCategory(category)}
                              className="text-red-600"
                              title="Delete category"
                              disabled={category.product_count > 0}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {categories.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No categories found</p>
                    <Button onClick={() => handleOpenCategoryModal()} className="mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Category
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Units Management Section */}
          {activeSection === 'units' && (
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-bold">Global Units ({units.length})</h2>
                  <p className="text-sm text-gray-500">Manage measurement units available to all tenants</p>
                </div>
                <Button onClick={() => handleOpenUnitModal()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Unit
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Display Order</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {units.map((unit) => (
                      <tr key={unit.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                              <Ruler className="w-4 h-4 text-blue-600" />
                            </div>
                            <p className="font-medium text-gray-900">{unit.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{unit.display_order}</td>
                        <td className="px-4 py-4">
                          {unit.is_active ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{unit.product_count}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenUnitModal(unit)}
                              title="Edit unit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteUnit(unit)}
                              className="text-red-600"
                              title="Delete unit"
                              disabled={unit.product_count > 0}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {units.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Ruler className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No units found</p>
                    <Button onClick={() => handleOpenUnitModal()} className="mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Unit
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </main>
      </div>

      {/* Add Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Add New Super Admin</h3>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <Input
                  value={newAdminForm.username}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input
                  type="email"
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <Input
                  value={newAdminForm.full_name}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <Input
                  type="password"
                  value={newAdminForm.password}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">Create Admin</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddAdminModal(false);
                    setNewAdminForm({ username: '', email: '', password: '', full_name: '' });
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Reset Password for {selectedAdmin.full_name}</h3>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <Input
                  type="password"
                  value={resetPasswordForm.new_password}
                  onChange={(e) => setResetPasswordForm({ new_password: e.target.value })}
                  required
                  minLength={8}
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">Reset Password</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPasswordForm({ new_password: '' });
                    setSelectedAdmin(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Revoke Subscription Modal */}
      {showRevokeModal && selectedTenantForRevoke && (
        <RevokeSubscriptionModal
          tenant={selectedTenantForRevoke}
          onConfirm={handleRevokeSubscription}
          onClose={() => {
            setShowRevokeModal(false);
            setSelectedTenantForRevoke(null);
          }}
        />
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h3>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <Input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                  placeholder="e.g., Food & Beverages"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <Input
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <Input
                    value={categoryForm.icon}
                    onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                    placeholder="e.g., coffee"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <Input
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    placeholder="e.g., #10B981"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Margin (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={categoryForm.target_margin ?? ''}
                    onChange={(e) => setCategoryForm({
                      ...categoryForm,
                      target_margin: e.target.value ? parseFloat(e.target.value) : null
                    })}
                    placeholder="Default: 25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Margin (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={categoryForm.minimum_margin ?? ''}
                    onChange={(e) => setCategoryForm({
                      ...categoryForm,
                      minimum_margin: e.target.value ? parseFloat(e.target.value) : null
                    })}
                    placeholder="Default: 15"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="category_is_active"
                  checked={categoryForm.is_active}
                  onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="category_is_active" className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {editingUnit ? 'Edit Unit' : 'Add New Unit'}
            </h3>
            <form onSubmit={handleSaveUnit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <Input
                  value={unitForm.name}
                  onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                  required
                  placeholder="e.g., pcs, kg, liters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <Input
                  type="number"
                  value={unitForm.display_order}
                  onChange={(e) => setUnitForm({ ...unitForm, display_order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="unit_is_active"
                  checked={unitForm.is_active}
                  onChange={(e) => setUnitForm({ ...unitForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="unit_is_active" className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  {editingUnit ? 'Update Unit' : 'Create Unit'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowUnitModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Block Tenant Modal */}
      {showBlockModal && selectedTenantForBlock && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold">Block Tenant</h3>
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">{selectedTenantForBlock.name}</p>
              <p className="text-sm text-gray-600">{selectedTenantForBlock.subdomain}</p>
              <p className="text-sm text-gray-500">{selectedTenantForBlock.owner_email}</p>
              <div className="mt-2 text-sm">
                <span className="text-red-600 font-medium">
                  {selectedTenantForBlock.days_past_expiry} days overdue
                </span>
              </div>
            </div>

            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">This action will:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Block all new sales and transactions</li>
                    <li>Prevent stock movements</li>
                    <li>Allow read-only access to existing data</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g., Subscription expired, no payment received after multiple reminders"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleBlockTenant}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <Ban className="w-4 h-4 mr-2" />
                Block Tenant
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowBlockModal(false);
                  setSelectedTenantForBlock(null);
                  setBlockReason('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
