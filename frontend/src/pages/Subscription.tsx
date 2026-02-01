import { useState, useEffect } from 'react';
import { AlertCircle, Building2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

// New interfaces for per-branch subscription
interface BranchSubscriptionStatus {
  tenant_id: number;
  name: string;
  subdomain: string;
  is_main: boolean;
  is_paid: boolean;
  subscription_end_date: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
}

// Unified branch interface with status and pricing
interface MergedBranchInfo {
  tenant_id: number;
  name: string;
  subdomain: string;
  is_main: boolean;
  is_paid: boolean;
  subscription_end_date: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  price: number;
}

interface SubscriptionStatusSummary {
  total_branches: number;
  paid_branches: number;
  unpaid_branches: number;
}

interface SubscriptionStatus {
  is_active: boolean;
  subscription_status: string;
  subscription_end_date: string | null;
  billing_cycle: string | null;
  branch_subscriptions: BranchSubscriptionStatus[];
  summary: SubscriptionStatusSummary;
  trial_ends_at: string | null;
  last_payment_date: string | null;
}

interface AvailableBranchInfo {
  tenant_id: number;
  name: string;
  subdomain: string;
  is_paid: boolean;
  is_active: boolean;
  subscription_end_date: string | null;
}

interface AvailableBranchesMainLocation {
  tenant_id: number;
  name: string;
  subdomain: string;
  is_paid: boolean;
  required: boolean;
  subscription_end_date: string | null;
}

interface AvailableBranchesData {
  main_location: AvailableBranchesMainLocation;
  branches: AvailableBranchInfo[];
  pricing: {
    main_price_kes: number;
    branch_price_kes: number;
  };
}

interface Transaction {
  id: number;
  amount: number;
  currency: string;
  billing_cycle: string;
  status: string;
  payment_date: string | null;
  subscription_start_date: string;
  subscription_end_date: string;
  reference: string;
}

const PLAN_CONFIGS = {
  monthly: { name: 'Monthly', price: 2000, monthlyPrice: 2000, savings: 0, period: 'month', duration: '30 days' },
  quarterly: { name: '3-Month', price: 5400, monthlyPrice: 1800, savings: 600, period: '3 months', duration: '90 days' },
  semi_annual: { name: '6-Month', price: 9720, monthlyPrice: 1620, savings: 2280, period: '6 months', duration: '180 days' },
  annual: { name: 'Annual', price: 18360, monthlyPrice: 1530, savings: 5640, period: 'year', duration: '365 days' },
};

export default function Subscription() {
  const toast = useToast();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [availableBranches, setAvailableBranches] = useState<AvailableBranchesData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [branchToCancelId, setBranchToCancelId] = useState<number | null>(null);
  const [branchToReactivateId, setBranchToReactivateId] = useState<number | null>(null);
  const [upgradePreview, setUpgradePreview] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // Unified branch selection state (replaces selectedBranchIds and selectedUnpaidBranchIds)
  const [selectedBranches, setSelectedBranches] = useState<number[]>([]);

  // Merged branches with status and pricing
  const [mergedBranches, setMergedBranches] = useState<MergedBranchInfo[]>([]);

  useEffect(() => {
    loadData();
    // Check for payment verification in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('verify') === 'true') {
      const reference = params.get('reference');
      if (reference) {
        verifyPayment(reference);
      }
    }

    // Refresh data when page becomes visible (prevents stale data when user returns)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page visible - refreshing subscription status');
        loadData();
      }
    };

    // Refresh when window regains focus
    const handleFocus = () => {
      console.log('Window focused - refreshing subscription status');
      loadData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      // Load subscription status with per-branch details
      const statusRes = await api.getSubscriptionStatus(token);
      setStatus(statusRes);

      // Load available branches for selection
      const branchesRes = await api.getAvailableBranches(token);
      setAvailableBranches(branchesRes);

      // Merge branch subscription status with available branches for unified view
      if (statusRes.branch_subscriptions && branchesRes) {
        const merged: MergedBranchInfo[] = statusRes.branch_subscriptions.map((branch: BranchSubscriptionStatus) => ({
          tenant_id: branch.tenant_id,
          name: branch.name,
          subdomain: branch.subdomain,
          is_main: branch.is_main,
          is_paid: branch.is_paid,
          subscription_end_date: branch.subscription_end_date,
          is_cancelled: branch.is_cancelled,
          cancelled_at: branch.cancelled_at,
          price: branch.is_main
            ? branchesRes.pricing.main_price_kes
            : branchesRes.pricing.branch_price_kes
        }));
        setMergedBranches(merged);

        // Initialize selection with only main location
        // Paid branches cannot be added again (checkboxes disabled)
        // User manually selects unpaid branches to add/include
        const mainBranch = merged.find(b => b.is_main);
        setSelectedBranches(mainBranch ? [mainBranch.tenant_id] : []);
      }

      // Load transaction history
      const historyRes = await api.getSubscriptionHistory(token);
      setTransactions(historyRes);
    } catch (error) {
      console.error('Failed to load subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchToggle = (branchId: number, isMain: boolean) => {
    if (isMain) return; // Main location cannot be unchecked

    setSelectedBranches(prev =>
      prev.includes(branchId)
        ? prev.filter(id => id !== branchId)
        : [...prev, branchId]
    );
  };

  const calculateTotal = (planKey: keyof typeof PLAN_CONFIGS) => {
    if (!availableBranches || mergedBranches.length === 0) return 0;

    const plan = PLAN_CONFIGS[planKey];
    const mainPrice = plan.price;
    const branchPrice = mainPrice * 0.8; // 20% discount

    // Find which selected branches are UNPAID (these need to be charged)
    const unpaidSelectedBranches = selectedBranches.filter(id => {
      const branch = mergedBranches.find((b: MergedBranchInfo) => b.tenant_id === id);
      return branch && !branch.is_paid;
    });

    // Check if main branch is in unpaid selections
    const mainBranch = mergedBranches.find((b: MergedBranchInfo) => b.is_main);
    const mainInUnpaidSelections = mainBranch && unpaidSelectedBranches.includes(mainBranch.tenant_id);

    // Calculate total: only charge for unpaid branches
    let total = 0;

    // Add main location price only if it's unpaid and selected
    if (mainInUnpaidSelections) {
      total += mainPrice;
    }

    // Add other unpaid branches (excluding main)
    const otherUnpaidBranches = unpaidSelectedBranches.filter(id => id !== mainBranch?.tenant_id);
    total += otherUnpaidBranches.length * branchPrice;

    return total;
  };

  const handleSubscribe = async (billingCycle: string) => {
    if (selectedBranches.length === 0) {
      toast.warning('Please select at least the main location');
      return;
    }

    try {
      setProcessingPayment(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.initializeSubscription(token, billingCycle, selectedBranches);

      if (response.status && response.authorization_url) {
        // Redirect to Paystack checkout
        window.location.href = response.authorization_url;
      } else {
        toast.error('Failed to initialize payment. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment initialization error:', error);
      toast.error(error?.message || 'Failed to start payment process');
    } finally {
      setProcessingPayment(false);
    }
  };

  const verifyPayment = async (reference: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await api.verifySubscription(token, reference);
      // Reload data to show updated status
      loadData();
      toast.success('Payment successful! Your subscription is now active.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error: any) {
      console.error('Payment verification error:', error);
      toast.error(error?.message || 'Payment verification failed');
    }
  };

  const handleAddBranch = async (branchId: number) => {
    if (!confirm('This will charge a pro-rated amount for the remaining days in your current billing cycle. Continue?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.addBranchToSubscription(token, branchId);

      if (response.authorization_url) {
        // Redirect to Paystack for pro-rata payment
        window.location.href = response.authorization_url;
      }
    } catch (error: any) {
      console.error('Add branch error:', error);
      toast.error(error?.message || 'Failed to add branch to subscription');
    }
  };

  const handleBulkAddBranches = async () => {
    // Calculate selected unpaid branches from unified state
    const selectedUnpaidBranches = selectedBranches.filter(id => {
      const branch = mergedBranches.find((b: MergedBranchInfo) => b.tenant_id === id);
      return branch && !branch.is_paid;
    });

    if (selectedUnpaidBranches.length === 0) {
      toast.warning('Please select at least one unpaid branch to add.');
      return;
    }

    const confirmMessage = `This will add ${selectedUnpaidBranches.length} branch(es) to your subscription with pro-rated charges for the remaining days in your billing cycle. Continue?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // For now, add branches one by one
      // TODO: Create a bulk add endpoint for better UX
      for (const branchId of selectedUnpaidBranches) {
        const response = await api.addBranchToSubscription(token, branchId);
        if (response.authorization_url) {
          // Redirect to Paystack for first payment
          // Note: This will only process the first branch in the current implementation
          window.location.href = response.authorization_url;
          return;
        }
      }
    } catch (error: any) {
      console.error('Bulk add branches error:', error);
      toast.error(error?.message || 'Failed to add branches to subscription');
    }
  };

  const selectAllBranches = () => {
    if (mergedBranches.length === 0) return;
    // Select main + all unpaid branches (cannot select paid branches as they're already in subscription)
    const selectableIds = mergedBranches
      .filter(b => b.is_main || !b.is_paid)
      .map(b => b.tenant_id);
    setSelectedBranches(selectableIds);
  };

  const deselectAllNonMainBranches = () => {
    if (mergedBranches.length === 0) return;
    // Keep only main location selected
    const mainBranch = mergedBranches.find(b => b.is_main);
    setSelectedBranches(mainBranch ? [mainBranch.tenant_id] : []);
  };

  const handleReactivateSubscription = async () => {
    try {
      setReactivating(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.reactivateSubscription(token);

      if (response.status) {
        toast.success(response.message);
        setShowReactivateModal(false);
        // Reload data to show active status
        loadData();
      }
    } catch (error: any) {
      console.error('Reactivate subscription error:', error);
      toast.error(error?.message || 'Failed to reactivate subscription');
    } finally {
      setReactivating(false);
    }
  };

  const handleCancelBranch = async (branchTenantId: number) => {
    try {
      setCancelling(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.cancelBranchSubscription(branchTenantId, token);

      if (response.status) {
        toast.success(response.message);

        if (response.is_main_location) {
          toast.warning('Main location cancelled. Other branches can still operate independently.');
        }

        await loadData(); // Refresh status
      }
    } catch (error: any) {
      console.error('Cancel branch error:', error);
      toast.error(error?.message || 'Failed to cancel branch subscription');
    } finally {
      setCancelling(false);
      setBranchToCancelId(null);
    }
  };

  const handleReactivateBranch = async (branchTenantId: number) => {
    try {
      setReactivating(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.reactivateBranchSubscription(branchTenantId, token);

      if (response.status) {
        toast.success(response.message);
        await loadData(); // Refresh status
      }
    } catch (error: any) {
      console.error('Reactivate branch error:', error);
      toast.error(error?.message || 'Failed to reactivate branch subscription');
    } finally {
      setReactivating(false);
      setBranchToReactivateId(null);
    }
  };

  const handleUpgradePreview = async (newBillingCycle: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const preview = await api.previewUpgrade(token, newBillingCycle);
      setUpgradePreview(preview);
      setShowUpgradeModal(true);
    } catch (error: any) {
      console.error('Upgrade preview error:', error);
      toast.error(error?.message || 'Failed to load upgrade preview');
    }
  };

  const handleUpgrade = async () => {
    if (!upgradePreview) return;

    try {
      setUpgrading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.upgradeSubscription(token, upgradePreview.new_plan);

      if (response.status) {
        if (response.authorization_url) {
          // Redirect to Paystack for payment
          window.location.href = response.authorization_url;
        } else {
          // Upgrade completed with credit
          toast.success(response.message || 'Upgrade completed successfully!');
          setShowUpgradeModal(false);
          setUpgradePreview(null);
          loadData();
        }
      }
    } catch (error: any) {
      console.error('Upgrade error:', error);
      toast.error(error?.message || 'Failed to upgrade subscription');
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (!status) return null;

    if (status.subscription_status === 'trial') {
      const daysLeft = status.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(status.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;
      return <Badge variant="warning">Free Trial ({daysLeft} days left)</Badge>;
    } else if (status.subscription_status === 'active') {
      return <Badge variant="success">Active</Badge>;
    } else if (status.subscription_status === 'cancelled') {
      return <Badge variant="secondary">Cancelled</Badge>;
    } else if (status.subscription_status === 'expired') {
      return <Badge variant="danger">Expired</Badge>;
    }
    return <Badge variant="secondary">{status.subscription_status}</Badge>;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Per-Branch Subscription Status - Enhanced with Status Info */}
      {status && status.branch_subscriptions.length > 0 && (
        <Card className="p-6">
          {/* Enhanced Header with Summary Info */}
          <div className="border-b border-gray-200 pb-4 mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-6 w-6" />
                Branch Subscriptions
              </h2>

              {/* Action Buttons - Only show when status is loaded */}
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-10 w-44 rounded"></div>
              ) : (
                <>
                  {/* Reactivate button - show ONLY if subscription is cancelled */}
                  {status?.subscription_status === 'cancelled' ? (
                    <Button
                      variant="outline"
                      className="text-green-600 border-green-600 hover:bg-green-50 self-start lg:self-auto"
                      onClick={() => setShowReactivateModal(true)}
                    >
                      Reactivate Subscription
                    </Button>
                  ) : null}
                </>
              )}
            </div>

            {/* Status Summary Row */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {/* Overall Status Badge */}
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Status:</span>
                {getStatusBadge()}
              </div>

              {/* Branch Summary */}
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Branches:</span>
                <span className="font-medium">
                  {status.summary.paid_branches} of {status.summary.total_branches} paid
                </span>
              </div>

              {/* Next Billing Date (if active) */}
              {status.subscription_status === 'active' && status.subscription_end_date && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Renews:</span>
                  <span className="font-medium">
                    {new Date(status.subscription_end_date).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Trial Info (if trial) */}
              {status.subscription_status === 'trial' && status.trial_ends_at && (
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">
                    Trial ends: {new Date(status.trial_ends_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Cancelled Info (if cancelled) */}
              {status.subscription_status === 'cancelled' && status.subscription_end_date && (
                <div className="flex items-center gap-2 text-orange-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">
                    Access until: {new Date(status.subscription_end_date).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Expired Info (if expired) */}
              {status.subscription_status === 'expired' && (
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Access expired - Renew below</span>
                </div>
              )}
            </div>

            {/* Selection Actions Row */}
            <div className="flex flex-wrap gap-2 mt-3 items-center">
              <button
                onClick={selectAllBranches}
                className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
              >
                Select All Unpaid
              </button>
              <button
                onClick={deselectAllNonMainBranches}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Deselect All
              </button>
              {(() => {
                const selectedUnpaidCount = selectedBranches.filter(id => {
                  const branch = mergedBranches.find((b: MergedBranchInfo) => b.tenant_id === id);
                  return branch && !branch.is_paid && !branch.is_main;
                }).length;
                return selectedUnpaidCount > 0 && (
                  <Button size="sm" onClick={handleBulkAddBranches} className="flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    Add {selectedUnpaidCount} to Subscription
                  </Button>
                );
              })()}
              <div className="ml-auto text-sm text-gray-600">
                Selected: {selectedBranches.length} branch{selectedBranches.length !== 1 ? 'es' : ''}
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={mergedBranches.filter(b => !b.is_main && !b.is_paid).length > 0 &&
                               mergedBranches.filter(b => !b.is_main && !b.is_paid).every(b => selectedBranches.includes(b.tenant_id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAllBranches();
                        } else {
                          deselectAllNonMainBranches();
                        }
                      }}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mergedBranches.map((branch) => (
                  <tr key={branch.tenant_id} className={branch.is_main ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedBranches.includes(branch.tenant_id)}
                        disabled={branch.is_main || branch.is_paid}
                        onChange={() => handleBranchToggle(branch.tenant_id, branch.is_main)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{branch.name}</span>
                            {branch.is_main && (
                              <Badge variant="info" className="text-xs">Main</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {branch.is_main ? 'Required - Always included' :
                             branch.is_paid ? 'Active subscription' :
                             'Not in subscription'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {branch.is_paid ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <CheckCircle className="h-3 w-3" />
                            Paid
                          </Badge>
                          {branch.is_cancelled && (
                            <Badge variant="warning" className="text-xs">
                              Cancelled
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" />
                          Unpaid
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {branch.subscription_end_date
                        ? new Date(branch.subscription_end_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {branch.is_paid ? (
                        <div className="flex gap-2">
                          {branch.is_cancelled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setBranchToReactivateId(branch.tenant_id)}
                              className="text-green-600 border-green-300 hover:bg-green-50"
                            >
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setBranchToCancelId(branch.tenant_id)}
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-1"
                          onClick={() => handleAddBranch(branch.tenant_id)}
                        >
                          <Plus className="h-3 w-3" />
                          Add Now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {mergedBranches.map((branch) => (
              <Card key={branch.tenant_id} className={`p-4 ${branch.is_main ? 'bg-blue-50 border-blue-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedBranches.includes(branch.tenant_id)}
                    disabled={branch.is_main || branch.is_paid}
                    onChange={() => handleBranchToggle(branch.tenant_id, branch.is_main)}
                    className="mt-1 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{branch.name}</span>
                        {branch.is_main && (
                          <Badge variant="info" className="text-xs">Main</Badge>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {branch.is_paid ? (
                          <>
                            <Badge variant="success" className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Paid
                            </Badge>
                            {branch.is_cancelled && (
                              <Badge variant="warning" className="text-xs">
                                Cancelled
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Unpaid
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {branch.is_main ? 'Required - Always included' :
                       branch.is_paid ? 'Active subscription' :
                       'Not in subscription'}
                    </p>
                    {branch.subscription_end_date && (
                      <p className="text-xs text-gray-600 mt-2">
                        Expires: {new Date(branch.subscription_end_date).toLocaleDateString()}
                      </p>
                    )}
                    <div className="mt-2">
                      {branch.is_paid ? (
                        branch.is_cancelled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => setBranchToReactivateId(branch.tenant_id)}
                          >
                            Reactivate Branch
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => setBranchToCancelId(branch.tenant_id)}
                          >
                            Cancel Branch
                          </Button>
                        )
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full flex items-center justify-center gap-1"
                          onClick={() => handleAddBranch(branch.tenant_id)}
                        >
                          <Plus className="h-3 w-3" />
                          Add to Subscription
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Pricing Plans */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose Your Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(Object.keys(PLAN_CONFIGS) as Array<keyof typeof PLAN_CONFIGS>).map((planKey) => {
            const plan = PLAN_CONFIGS[planKey];
            const total = calculateTotal(planKey);
            const isBestValue = planKey === 'semi_annual';

            // Check if user is currently on this or a longer plan
            const cycleOrder: Record<string, number> = { monthly: 1, quarterly: 2, semi_annual: 3, annual: 4 };
            const currentCycle = status?.billing_cycle || '';
            const isCurrentPlan = currentCycle === planKey;
            const isLongerPlan = cycleOrder[planKey] > (cycleOrder[currentCycle] || 0);
            const isShorterPlan = cycleOrder[planKey] < (cycleOrder[currentCycle] || 0);
            const hasActiveSubscription = status?.subscription_status === 'active' && status?.billing_cycle;

            return (
              <Card
                key={planKey}
                className={`p-6 relative hover:shadow-lg transition-shadow ${
                  isBestValue ? 'border-2 border-primary-600' : ''
                } ${isCurrentPlan ? 'bg-green-50 border-green-300' : ''}`}
              >
                {plan.savings > 0 && (
                  <div className="absolute top-0 right-0 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    SAVE KES {plan.savings.toLocaleString()}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    {/* Show monthly equivalent price prominently */}
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-gray-900">
                        KES {plan.monthlyPrice.toLocaleString()}
                      </span>
                      <span className="text-gray-600">/mo</span>
                    </div>
                    {/* Show total price for multi-month plans */}
                    {planKey !== 'monthly' && (
                      <p className="text-sm text-gray-500 mt-1">
                        (KES {plan.price.toLocaleString()} total)
                      </p>
                    )}
                    {plan.savings > 0 && (
                      <p className="text-sm text-green-600 font-medium mt-1">
                        Save KES {plan.savings.toLocaleString()} vs monthly
                      </p>
                    )}
                    {planKey === 'monthly' && (
                      <p className="text-sm text-gray-500 mt-1">
                        Flexible - Cancel anytime
                      </p>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 space-y-1 border-t pt-3">
                    {(() => {
                      const mainBranch = mergedBranches.find((b: MergedBranchInfo) => b.is_main);
                      const mainIsPaid = mainBranch?.is_paid;
                      const unpaidSelected = selectedBranches.filter(id => {
                        const branch = mergedBranches.find((b: MergedBranchInfo) => b.tenant_id === id);
                        return branch && !branch.is_paid;
                      });
                      const mainInUnpaid = mainBranch && unpaidSelected.includes(mainBranch.tenant_id);
                      const otherUnpaidCount = unpaidSelected.filter(id => id !== mainBranch?.tenant_id).length;

                      // Show current plan indicator
                      if (isCurrentPlan && hasActiveSubscription) {
                        return (
                          <div className="flex items-center justify-center gap-2 text-green-700 py-2">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">Current Plan</span>
                          </div>
                        );
                      }

                      // Show upgrade option for longer plans when user has active subscription
                      if (hasActiveSubscription && isLongerPlan) {
                        return (
                          <div className="text-center py-2">
                            <p className="text-sm text-gray-600 mb-2">
                              Upgrade from {PLAN_CONFIGS[currentCycle as keyof typeof PLAN_CONFIGS]?.name || currentCycle}
                            </p>
                            <p className="text-xs text-green-600">
                              Pro-rata credit applied
                            </p>
                          </div>
                        );
                      }

                      // Show shorter plan indicator
                      if (hasActiveSubscription && isShorterPlan) {
                        return (
                          <div className="text-center py-2 text-gray-500">
                            <p className="text-sm">
                              Already on {PLAN_CONFIGS[currentCycle as keyof typeof PLAN_CONFIGS]?.name || currentCycle}
                            </p>
                          </div>
                        );
                      }

                      // Normal pricing breakdown for new subscriptions
                      return (
                        <>
                          {mainIsPaid ? (
                            <div className="flex justify-between text-green-600">
                              <span>Main location:</span>
                              <span className="font-medium">Already Paid</span>
                            </div>
                          ) : mainInUnpaid ? (
                            <div className="flex justify-between">
                              <span>Main location:</span>
                              <span className="font-medium">KES {plan.price.toLocaleString()}</span>
                            </div>
                          ) : null}

                          {otherUnpaidCount > 0 && (
                            <div className="flex justify-between">
                              <span>{otherUnpaidCount} branch(es):</span>
                              <span className="font-medium">
                                KES {(plan.price * 0.8 * otherUnpaidCount).toLocaleString()}
                              </span>
                            </div>
                          )}

                          {unpaidSelected.length === 0 && !hasActiveSubscription && (
                            <div className="flex justify-between text-gray-500 italic">
                              <span>All branches already paid</span>
                            </div>
                          )}

                          {total > 0 && (
                            <div className="flex justify-between font-medium border-t pt-2 mt-2">
                              <span>Total:</span>
                              <span>KES {total.toLocaleString()}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Action Button */}
                  {(() => {
                    const cycleOrder: Record<string, number> = { monthly: 1, quarterly: 2, semi_annual: 3, annual: 4 };
                    const currentCycle = status?.billing_cycle || '';
                    const isCurrentPlan = currentCycle === planKey;
                    const isLongerPlan = cycleOrder[planKey] > (cycleOrder[currentCycle] || 0);
                    const isShorterPlan = cycleOrder[planKey] < (cycleOrder[currentCycle] || 0);
                    const hasActiveSubscription = status?.subscription_status === 'active' && status?.billing_cycle;

                    if (isCurrentPlan && hasActiveSubscription) {
                      return (
                        <Button className="w-full" disabled variant="outline">
                          Current Plan
                        </Button>
                      );
                    }

                    if (hasActiveSubscription && isLongerPlan) {
                      return (
                        <Button
                          className="w-full"
                          onClick={() => handleUpgradePreview(planKey)}
                          disabled={processingPayment}
                        >
                          {processingPayment ? 'Processing...' : 'Upgrade Now'}
                        </Button>
                      );
                    }

                    if (hasActiveSubscription && isShorterPlan) {
                      return (
                        <Button className="w-full" disabled variant="outline">
                          Lower Tier
                        </Button>
                      );
                    }

                    // New subscription
                    return (
                      <Button
                        className="w-full"
                        onClick={() => handleSubscribe(planKey)}
                        disabled={processingPayment || selectedBranches.length === 0}
                      >
                        {processingPayment ? 'Processing...' : `Select ${plan.name}`}
                      </Button>
                    );
                  })()}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment History */}
      {transactions.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {tx.payment_date ? new Date(tx.payment_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {tx.currency} {tx.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {tx.billing_cycle.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={tx.status === 'success' ? 'success' : 'secondary'}>
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                      {tx.reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Reactivate Confirmation Modal */}
      {showReactivateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reactivate Subscription?</h3>
            <p className="text-sm text-gray-600 mb-6">
              {status?.trial_ends_at && new Date(status.trial_ends_at) > new Date()
                ? 'Your trial will be reactivated and your access will remain uninterrupted until the trial period ends.'
                : 'Your subscription will be reactivated and you will continue to be charged at the end of your current billing period. Your access will remain uninterrupted.'
              }
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowReactivateModal(false)}
                disabled={reactivating}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleReactivateSubscription}
                disabled={reactivating}
              >
                {reactivating ? 'Reactivating...' : 'Yes, Reactivate'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Cancel Branch Modal */}
      {branchToCancelId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Branch Subscription?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This branch's subscription will be cancelled, but access will remain active until the end of the current billing period.
              The branch will not be included in future renewals.
            </p>
            {(() => {
              const branch = status?.branch_subscriptions.find(b => b.tenant_id === branchToCancelId);
              if (branch?.is_main) {
                return (
                  <div className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-600 rounded">
                    <p className="text-sm text-amber-800">
                      <strong>Warning:</strong> You are cancelling the main location. Other branches will continue to operate independently.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setBranchToCancelId(null)} disabled={cancelling}>
                Keep Active
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => branchToCancelId && handleCancelBranch(branchToCancelId)}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reactivate Branch Modal */}
      {branchToReactivateId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reactivate Branch Subscription?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This branch will be reactivated and included in future renewals.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setBranchToReactivateId(null)} disabled={reactivating}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => branchToReactivateId && handleReactivateBranch(branchToReactivateId)}
                disabled={reactivating}
              >
                {reactivating ? 'Reactivating...' : 'Yes, Reactivate'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Upgrade Subscription Modal */}
      {showUpgradeModal && upgradePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Upgrade Your Subscription</h3>

            {!upgradePreview.can_upgrade ? (
              <>
                <p className="text-sm text-gray-600 mb-6">
                  {upgradePreview.message}
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setShowUpgradeModal(false); setUpgradePreview(null); }}>
                  Close
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Current Plan:</span>
                      <span className="font-medium">{PLAN_CONFIGS[upgradePreview.current_plan as keyof typeof PLAN_CONFIGS]?.name || upgradePreview.current_plan || 'None'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">New Plan:</span>
                      <span className="font-medium text-primary-600">{upgradePreview.new_plan_name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Days Remaining:</span>
                      <span className="font-medium">{upgradePreview.days_remaining} days</span>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">New Plan Cost:</span>
                      <span className="font-medium">KES {upgradePreview.new_plan_cost_kes?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Pro-rata Credit:</span>
                      <span className="font-medium">- KES {upgradePreview.remaining_credit_kes?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Amount to Pay:</span>
                      <span className="text-primary-600">KES {upgradePreview.amount_to_pay_kes?.toLocaleString()}</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    * Your remaining credit from the current plan will be applied to the new plan.
                    {upgradePreview.branches_included > 1 && ` Includes ${upgradePreview.branches_included} locations.`}
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowUpgradeModal(false); setUpgradePreview(null); }}
                    disabled={upgrading}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleUpgrade}
                    disabled={upgrading}
                  >
                    {upgrading ? 'Processing...' : upgradePreview.amount_to_pay_kes > 0 ? 'Pay & Upgrade' : 'Upgrade Now'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
