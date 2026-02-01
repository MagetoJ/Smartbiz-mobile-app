import { useState, useEffect } from 'react';
import {
  Plus,
  Building2,
  Trash2,
  AlertCircle,
  CheckCircle,
  MapPin,
  CreditCard,
  XCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, Branch } from '../lib/api';
import { Card, CardContent } from '../components/ui/Card';
import CreateBranchModal from '../components/CreateBranchModal';
import DeleteBranchModal from '../components/DeleteBranchModal';
import { useNavigate } from 'react-router-dom';

interface BranchSubscriptionStatus {
  tenant_id: number;
  is_paid: boolean;
  subscription_end_date: string | null;
}

export default function BranchesSettings() {
  const { token, tenant } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<{ id: number; name: string } | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<Map<number, BranchSubscriptionStatus>>(new Map());

  useEffect(() => {
    loadBranches();
    loadSubscriptionStatus();
  }, []);

  const loadBranches = async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all branches (simplified - no organization needed)
      const branchesData = await api.getBranches(token);
      setBranches(branchesData);
    } catch (err: any) {
      console.error('Failed to load branches:', err);
      setError(err.message || 'Failed to load branches');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSubscriptionStatus = async () => {
    if (!token) return;

    try {
      const statusData = await api.getSubscriptionStatus(token);

      // Convert branch_subscriptions array to Map for quick lookup
      const statusMap = new Map<number, BranchSubscriptionStatus>();

      if (statusData.branch_subscriptions) {
        statusData.branch_subscriptions.forEach((branch: any) => {
          statusMap.set(branch.tenant_id, {
            tenant_id: branch.tenant_id,
            is_paid: branch.is_paid,
            subscription_end_date: branch.subscription_end_date
          });
        });
      }

      setSubscriptionStatus(statusMap);
    } catch (err: any) {
      console.error('Failed to load subscription status:', err);
      // Don't show error to user - subscription status is supplementary info
    }
  };

  const handleDeleteClick = (branch: Branch) => {
    setBranchToDelete({ id: branch.id, name: branch.name });
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (branchId: number) => {
    if (!token || !branchToDelete) return;

    try {
      await api.deleteBranch(token, branchId);
      setDeleteModalOpen(false);
      setBranchToDelete(null);
      setSuccessMessage(`Branch "${branchToDelete.name}" deleted successfully`);
      await loadBranches();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      // Error will be handled by the modal
      throw err;
    }
  };

  const handleBranchCreated = async (branch: Branch) => {
    setShowCreateBranchModal(false);

    // Add branch to list immediately (no page reload!)
    setBranches(prev => [...prev, branch]);

    // Show detailed success message
    setSuccessMessage(
      `Branch "${branch.name}" created successfully! Subdomain: ${branch.subdomain}`
    );

    // Clear success message after 5 seconds
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Calculate max branches (free plan = 3, can be upgraded)
  const maxBranches = tenant?.max_branches || 50; // Default to 50 if not set
  const currentBranchCount = branches.length + 1; // +1 for main location
  const canAddBranch = currentBranchCount < maxBranches;

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Branches</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your business locations. {currentBranchCount} of {maxBranches} branches used.
          </p>
        </div>
        <button
          onClick={() => setShowCreateBranchModal(true)}
          disabled={!canAddBranch}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Branch
        </button>
      </div>

      {/* Branches List */}
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {/* Current Tenant (Always First) */}
            <div className="flex items-center justify-between p-4 border-2 border-primary-200 bg-primary-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-gray-900">{tenant?.name}</h4>
                    <span className="text-xs px-2 py-0.5 bg-primary-600 text-white rounded font-medium">
                      Current
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {tenant?.subdomain}.statbricks.com
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs text-primary-700 bg-primary-100 px-2 py-1 rounded">
                  <MapPin className="h-3 w-3" />
                  Main Location
                </div>
                {tenant && subscriptionStatus.has(tenant.id) && (
                  <>
                    {subscriptionStatus.get(tenant.id)?.is_paid ? (
                      <div className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                        <CheckCircle className="h-3 w-3" />
                        Paid
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        <XCircle className="h-3 w-3" />
                        Unpaid
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Additional Branches */}
            {branches.map((branch) => {
              const branchSub = subscriptionStatus.get(branch.id);
              const isPaid = branchSub?.is_paid || false;

              return (
                <div
                  key={branch.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{branch.name}</h4>
                      <p className="text-sm text-gray-600">
                        {branch.subdomain}.statbricks.com
                      </p>
                      {!isPaid && (
                        <button
                          onClick={() => navigate('/settings?tab=subscription')}
                          className="text-xs text-primary-600 hover:text-primary-700 underline mt-1 inline-flex items-center gap-1"
                        >
                          <CreditCard className="h-3 w-3" />
                          Add to Subscription
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className={`text-xs px-2 py-1 rounded ${
                        branch.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </div>
                    {branchSub && (
                      <>
                        {isPaid ? (
                          <div className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                            <CheckCircle className="h-3 w-3" />
                            Paid
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                            <XCircle className="h-3 w-3" />
                            Unpaid
                          </div>
                        )}
                      </>
                    )}
                    {branch.id !== tenant?.id && (
                      <button
                        onClick={() => handleDeleteClick(branch)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete branch"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State for Additional Branches */}
            {branches.length === 0 && (
              <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                <Building2 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-600 mb-1">No additional branches yet</p>
                <p className="text-sm text-gray-500">
                  Click "Add Branch" to create additional locations
                </p>
              </div>
            )}
          </div>

          {/* Pricing Info */}
          {!canAddBranch && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 inline mr-2" />
              You've reached the maximum number of branches ({maxBranches}) for your plan.
              <button className="ml-1 underline font-medium hover:text-amber-900">
                Upgrade to add more
              </button>
            </div>
          )}

          {branches.length > 0 && (
            <>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <CheckCircle className="h-4 w-4 inline mr-2" />
                All branches share the same product catalog. Stock quantities are tracked separately per branch.
              </div>
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Each branch requires an active subscription. Unpaid branches have read-only access.
                <button
                  onClick={() => navigate('/settings?tab=subscription')}
                  className="ml-1 underline font-medium hover:text-amber-900"
                >
                  Manage Subscriptions
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Info Card for First-Time Users */}
      {branches.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Expand to Multiple Locations
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Add branches to manage multiple business locations from one dashboard.
                  Each branch can track its own inventory while sharing the same product catalog.
                </p>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <span>Shared product catalog across all locations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <span>Separate inventory tracking per branch</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                    <span>Unified reporting and analytics</span>
                  </li>
                </ul>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <strong>Pricing:</strong> Main location: KES 2,000/month. Additional branches: KES 1,600/month (20% off).
                  <button
                    onClick={() => navigate('/settings?tab=subscription')}
                    className="ml-1 underline font-medium hover:text-amber-900"
                  >
                    View Plans
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Branch Modal */}
      {showCreateBranchModal && (
        <CreateBranchModal
          onClose={() => setShowCreateBranchModal(false)}
          onSuccess={handleBranchCreated}
        />
      )}

      {/* Delete Branch Modal */}
      {deleteModalOpen && branchToDelete && token && (
        <DeleteBranchModal
          isOpen={deleteModalOpen}
          branchName={branchToDelete.name}
          branchId={branchToDelete.id}
          token={token}
          onClose={() => {
            setDeleteModalOpen(false);
            setBranchToDelete(null);
          }}
          onDelete={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
