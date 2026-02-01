import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, ConvertToOrganizationRequest } from '../lib/api';
import { Building2, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface ConvertToOrganizationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConvertToOrganizationModal({ onClose, onSuccess }: ConvertToOrganizationModalProps) {
  const { token, tenant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConvertToOrganizationRequest>({
    organization_name: tenant?.name || '',
    currency: tenant?.currency || 'USD',
    tax_rate: tenant?.tax_rate || 0,
    timezone: 'Africa/Nairobi',
    subscription_plan: 'free',
    max_branches: 3,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      await api.convertToOrganization(token, formData);
      onSuccess();
    } catch (err: any) {
      console.error('Conversion error:', err);
      setError(err.message || 'Failed to convert to organization');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'tax_rate' || name === 'max_branches' ? parseFloat(value) || 0 : value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Convert to Organization</h2>
              <p className="text-sm text-gray-600">Unlock multi-branch management features</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Benefits Section */}
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-2">What you'll get:</h3>
          <ul className="space-y-1 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span><strong>Multi-branch management</strong> - Create and manage multiple locations</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span><strong>Shared product catalog</strong> - Define products once, track stock per branch</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span><strong>Unified dashboard</strong> - View analytics across all branches</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span><strong>Centralized control</strong> - Manage all locations without switching tenants</span>
            </li>
          </ul>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Conversion Failed</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-5">
            {/* Organization Name */}
            <div>
              <label htmlFor="organization_name" className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="organization_name"
                name="organization_name"
                value={formData.organization_name}
                onChange={handleInputChange}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                placeholder="e.g., ACME Corporation"
              />
              <p className="mt-1 text-xs text-gray-500">
                Your current business will become the first branch of this organization
              </p>
            </div>

            {/* Currency */}
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                Currency <span className="text-red-500">*</span>
              </label>
              <select
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="INR">INR - Indian Rupee</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CNY">CNY - Chinese Yuan</option>
                <option value="KES">KES - Kenyan Shilling</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                All branches will use this currency (from your current settings)
              </p>
            </div>

            {/* Tax Rate */}
            <div>
              <label htmlFor="tax_rate" className="block text-sm font-medium text-gray-700 mb-1">
                Tax Rate (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="tax_rate"
                name="tax_rate"
                value={formData.tax_rate}
                onChange={handleInputChange}
                required
                min="0"
                max="100"
                step="0.01"
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default tax rate for all branches (can be adjusted per branch)
              </p>
            </div>

            {/* Timezone */}
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                Timezone <span className="text-red-500">*</span>
              </label>
              <select
                id="timezone"
                name="timezone"
                value={formData.timezone}
                onChange={handleInputChange}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
              </select>
            </div>

            {/* Subscription Plan */}
            <div>
              <label htmlFor="subscription_plan" className="block text-sm font-medium text-gray-700 mb-1">
                Subscription Plan <span className="text-red-500">*</span>
              </label>
              <select
                id="subscription_plan"
                name="subscription_plan"
                value={formData.subscription_plan}
                onChange={handleInputChange}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="free">Free (Up to 3 branches)</option>
                <option value="starter">Starter (Up to 10 branches)</option>
                <option value="professional">Professional (Up to 50 branches)</option>
                <option value="enterprise">Enterprise (Unlimited branches)</option>
              </select>
            </div>

            {/* Max Branches */}
            <div>
              <label htmlFor="max_branches" className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Branches <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="max_branches"
                name="max_branches"
                value={formData.max_branches}
                onChange={handleInputChange}
                required
                min="1"
                max="999"
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                Number of branches allowed (based on subscription plan)
              </p>
            </div>
          </div>

          {/* Important Note */}
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Important:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Your existing products will become part of the shared organization catalog</li>
                  <li>Your current stock quantities will be preserved as branch-specific inventory</li>
                  <li>Your categories will be converted to organization-level categories</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors disabled:bg-blue-400 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Converting...' : 'Convert to Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
