import { useState, useEffect } from 'react';
import {
  Plus,
  Building2,
  Users,
  Package,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Rocket
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, Branch, OrganizationUser } from '../lib/api';
import { Card, CardContent } from '../components/ui/Card';
import CreateBranchModal from '../components/CreateBranchModal';
import ConvertToOrganizationModal from '../components/ConvertToOrganizationModal';
import DeleteBranchModal from '../components/DeleteBranchModal';

export default function OrganizationSettings() {
  const { token, organization, tenant } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const [branchesData, usersData] = await Promise.all([
        api.getBranches(token),
        api.getOrganizationUsers(token)
      ]);

      setBranches(branchesData);
      setOrgUsers(usersData);
    } catch (err: any) {
      console.error('Failed to load organization data:', err);
      setError(err.message || 'Failed to load organization data');
    } finally {
      setIsLoading(false);
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
      await loadData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      // Error will be handled by the modal
      throw err;
    }
  };

  const handleRemoveOrgUser = async (userId: number, userName: string) => {
    if (!token) return;

    if (!confirm(`Are you sure you want to remove "${userName}" from the organization?`)) {
      return;
    }

    try {
      await api.removeOrganizationUser(token, userId);
      setSuccessMessage(`User "${userName}" removed successfully`);
      loadData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to remove user');
    }
  };

  const handleBranchCreated = () => {
    setShowCreateBranchModal(false);
    setSuccessMessage('Branch created successfully!');
    loadData();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleSetupSuccess = () => {
    setShowSetupModal(false);
    setSuccessMessage('Organization setup complete! Refreshing...');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="space-y-6">
        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <span>{successMessage}</span>
          </div>
        )}

        <Card>
          <CardContent className="py-12">
            <div className="max-w-2xl mx-auto text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Rocket className="h-8 w-8 text-white" />
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Set Up Your Organization
              </h3>

              <p className="text-gray-600 mb-6 text-lg">
                Unlock powerful multi-branch management features to scale your business across multiple locations.
              </p>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 mb-8">
                <h4 className="font-semibold text-gray-900 mb-4">What you'll get:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Multiple Branches</p>
                      <p className="text-sm text-gray-600">Create and manage locations in different areas</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Shared Catalog</p>
                      <p className="text-sm text-gray-600">Define products once, use everywhere</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Per-Branch Inventory</p>
                      <p className="text-sm text-gray-600">Track stock separately for each location</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">Unified Dashboard</p>
                      <p className="text-sm text-gray-600">View analytics across all branches</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Pricing Information</p>
                    <p>Your first branch is included. Additional branches require a subscription upgrade. You can add branches as your business grows.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowSetupModal(true)}
                className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-base transition-colors shadow-lg shadow-blue-600/30"
              >
                <Rocket className="h-5 w-5" />
                Set Up Organization Now
              </button>

              <p className="text-sm text-gray-500 mt-4">
                Takes less than 2 minutes to set up
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Setup Modal */}
        {showSetupModal && (
          <ConvertToOrganizationModal
            onClose={() => setShowSetupModal(false)}
            onSuccess={handleSetupSuccess}
          />
        )}
      </div>
    );
  }

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

      {/* Organization Info */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {organization.name}
              </h2>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Owner: {organization.owner_email}</p>
                <p>Plan: <span className="capitalize">{organization.subscription_plan}</span></p>
                <p>Branches: {branches.length} / {organization.max_branches}</p>
                <p>Currency: {organization.currency} | Tax Rate: {(organization.tax_rate * 100).toFixed(1)}%</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branch Management Section */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Branches</h3>
            </div>
            <button
              onClick={() => setShowCreateBranchModal(true)}
              disabled={branches.length >= organization.max_branches}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </button>
          </div>

          {branches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>No branches yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-gray-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">{branch.name}</h4>
                      <p className="text-sm text-gray-600">
                        {branch.subdomain}.statbricks.com
                        {branch.id === tenant?.id && (
                          <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                            Current
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-xs px-2 py-1 rounded ${
                        branch.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </div>
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
              ))}
            </div>
          )}

          {branches.length >= organization.max_branches && (
            <p className="mt-4 text-sm text-amber-600 bg-amber-50 p-3 rounded">
              You've reached the maximum number of branches ({organization.max_branches}) for your {organization.subscription_plan} plan.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Product Catalog Section */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Product Catalog</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Manage the shared product catalog that all branches use. Products are defined at the organization level, and each branch tracks its own stock quantities.
          </p>
          <a
            href="/organization/products"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Package className="h-4 w-4" />
            Manage Organization Products
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>

      {/* Organization Users Section */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Organization Users</h3>
            </div>
          </div>

          {orgUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>No organization users</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orgUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div>
                    <h4 className="font-medium text-gray-900">{user.full_name}</h4>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded capitalize">
                      {user.role.replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => handleRemoveOrgUser(user.id, user.full_name)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
