import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Tenant, TenantUpdate } from '../lib/api';
import { Building2, Upload, Trash2, Save, AlertCircle, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { BusinessLogo } from '@/components/BusinessLogo';

// Country code to currency and tax rate mapping
const COUNTRY_SETTINGS: Record<string, { currency: string; taxRate: number; countryName: string }> = {
  '1': { currency: 'USD', taxRate: 0, countryName: 'USA/Canada' },
  '44': { currency: 'GBP', taxRate: 20, countryName: 'UK' },
  '254': { currency: 'KES', taxRate: 16, countryName: 'Kenya' },
  '234': { currency: 'NGN', taxRate: 7.5, countryName: 'Nigeria' },
  '27': { currency: 'ZAR', taxRate: 15, countryName: 'South Africa' },
  '256': { currency: 'UGX', taxRate: 18, countryName: 'Uganda' },
  '255': { currency: 'TZS', taxRate: 18, countryName: 'Tanzania' },
  '91': { currency: 'INR', taxRate: 18, countryName: 'India' },
  '86': { currency: 'CNY', taxRate: 13, countryName: 'China' },
  '81': { currency: 'JPY', taxRate: 10, countryName: 'Japan' },
  '33': { currency: 'EUR', taxRate: 20, countryName: 'France' },
  '49': { currency: 'EUR', taxRate: 19, countryName: 'Germany' },
  '61': { currency: 'AUD', taxRate: 10, countryName: 'Australia' },
};

// Extract country code from phone number
const extractCountryCode = (phone: string): string | null => {
  const cleaned = phone.replace(/\D/g, '');
  
  // Try matching country codes from longest to shortest
  const sortedCodes = Object.keys(COUNTRY_SETTINGS).sort((a, b) => b.length - a.length);
  
  for (const code of sortedCodes) {
    if (cleaned.startsWith(code)) {
      return code;
    }
  }
  
  return null;
};

export default function BusinessProfile() {
  const { token, user, logout, updateTenantLogo } = useAuth();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteBusinessConfirm, setShowDeleteBusinessConfirm] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  // Form state
  const [formData, setFormData] = useState<TenantUpdate>({
    name: '',
    owner_email: '',
    phone: '',
    address: '',
    business_type: '',
    currency: 'USD',
    tax_rate: 0,
  });
  
  // Track if currency/tax were auto-detected
  const [autoDetected, setAutoDetected] = useState<{ country: string; countryName: string } | null>(null);

  // Load tenant data
  useEffect(() => {
    loadTenant();
  }, []);

  const loadTenant = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const data = await api.getTenant(token);
      setTenant(data);
      setFormData({
        name: data.name,
        owner_email: data.owner_email,
        phone: data.phone || '',
        address: data.address || '',
        business_type: data.business_type || '',
        currency: data.currency,
        tax_rate: data.tax_rate,
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Handle phone number changes - auto-detect currency and tax rate
    if (name === 'phone') {
      const countryCode = extractCountryCode(value);
      
      if (countryCode && COUNTRY_SETTINGS[countryCode]) {
        const settings = COUNTRY_SETTINGS[countryCode];
        setFormData(prev => ({
          ...prev,
          phone: value,
          currency: settings.currency,
          tax_rate: settings.taxRate,
        }));
        setAutoDetected({ country: countryCode, countryName: settings.countryName });
      } else {
        setFormData(prev => ({
          ...prev,
          phone: value,
        }));
        // Clear auto-detection if phone is invalid/removed
        if (!value) {
          setAutoDetected(null);
        }
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'tax_rate' ? parseFloat(value) || 0 : value
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setSaving(true);
      setMessage(null);

      const updatedTenant = await api.updateTenant(token, formData);
      setTenant(updatedTenant);
      setMessage({ type: 'success', text: 'Business profile updated successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Invalid file type. Please upload PNG, JPG, GIF, or WEBP.' });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File too large. Maximum size is 5MB.' });
      return;
    }

    try {
      setUploading(true);
      setMessage(null);

      const updatedTenant = await api.uploadTenantLogo(token, file);
      setTenant(updatedTenant);
      
      // Update logo in AuthContext so navigation bar refreshes
      if (updatedTenant.logo_url) {
        updateTenantLogo(updatedTenant.logo_url);
      }
      
      setMessage({ type: 'success', text: 'Logo uploaded successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!token) return;

    try {
      setUploading(true);
      setMessage(null);

      const updatedTenant = await api.deleteTenantLogo(token);
      setTenant(updatedTenant);
      
      // Clear logo in AuthContext so navigation bar refreshes
      updateTenantLogo('');
      
      setShowDeleteConfirm(false);
      setMessage({ type: 'success', text: 'Logo deleted successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleBusinessDelete = async () => {
    if (!token || !tenant) return;

    // Verify confirmation text
    if (deleteConfirmationText !== tenant.name) {
      setMessage({ type: 'error', text: 'Business name does not match. Deletion cancelled.' });
      return;
    }

    try {
      setDeleting(true);
      setMessage(null);

      await api.deleteTenant(token);

      // Logout and redirect to login
      logout();
      navigate('/login');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
      setDeleting(false);
    }
  };

  const getInitials = () => {
    if (!tenant?.name) return 'BL';
    return tenant.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Failed to load business profile</p>
      </div>
    );
  }

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Business Profile</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your business information and branding
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Logo Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Business Logo
        </h3>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6">
          {/* Logo Preview */}
          <div className="flex-shrink-0">
            {tenant?.logo_url ? (
              <BusinessLogo
                logoUrl={tenant.logo_url}
                businessName={tenant.name}
                size="original"
                className="h-32 w-32 rounded-lg object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="h-32 w-32 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center border-2 border-gray-200">
                <span className="text-4xl font-bold text-white">
                  {getInitials()}
                </span>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div className="flex-1 w-full md:w-auto">
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              {/* Upload Button */}
              <label className={`
                inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                transition-colors cursor-pointer
                ${isAdmin
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}>
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                  onChange={handleLogoUpload}
                  disabled={!isAdmin || uploading}
                  className="hidden"
                />
              </label>

              {/* Delete Button */}
              {tenant.logo_url && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={!isAdmin || uploading}
                  className={`
                    inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
                    transition-colors
                    ${isAdmin
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }
                  `}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>

            {!isAdmin && (
              <p className="mt-2 text-xs text-amber-600 text-center md:text-left">
                Only administrators can upload or delete the business logo
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Business Information Form */}
      <form onSubmit={handleSave} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Business Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Name */}
          <div className="md:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={!isAdmin}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Owner Email */}
          <div className="md:col-span-2">
            <label htmlFor="owner_email" className="block text-sm font-medium text-gray-700 mb-1">
              Owner Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="owner_email"
              name="owner_email"
              value={formData.owner_email}
              onChange={handleInputChange}
              disabled={!isAdmin}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Phone */}
          <div className="md:col-span-2">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number (with country code)
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={!isAdmin}
              placeholder="e.g., +254712345678"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Include country code (e.g., +254 for Kenya) to auto-detect currency and tax rate
            </p>
          </div>

          {/* Auto-detection indicator */}
          {autoDetected && (
            <div className="md:col-span-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    Auto-detected from {autoDetected.countryName}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Currency and tax rate have been automatically set. You can edit them if needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Currency */}
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
              Currency <span className="text-red-500">*</span>
              {autoDetected && (
                <span className="ml-2 text-xs text-blue-600 font-normal">
                  (Auto-detected)
                </span>
              )}
            </label>
            <select
              id="currency"
              name="currency"
              value={formData.currency}
              onChange={handleInputChange}
              disabled={!isAdmin}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            >
              <optgroup label="African Currencies">
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="NGN">NGN - Nigerian Naira</option>
                <option value="ZAR">ZAR - South African Rand</option>
                <option value="UGX">UGX - Ugandan Shilling</option>
                <option value="TZS">TZS - Tanzanian Shilling</option>
              </optgroup>
              <optgroup label="Major Currencies">
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </optgroup>
              <optgroup label="Other Currencies">
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="INR">INR - Indian Rupee</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CNY">CNY - Chinese Yuan</option>
              </optgroup>
            </select>
          </div>

          {/* Tax Rate */}
          <div>
            <label htmlFor="tax_rate" className="block text-sm font-medium text-gray-700 mb-1">
              Tax Rate (%) <span className="text-red-500">*</span>
              {autoDetected && (
                <span className="ml-2 text-xs text-blue-600 font-normal">
                  (Auto-detected)
                </span>
              )}
            </label>
            <input
              type="number"
              id="tax_rate"
              name="tax_rate"
              value={formData.tax_rate}
              onChange={handleInputChange}
              disabled={!isAdmin}
              min="0"
              max="100"
              step="0.01"
              required
              placeholder="e.g., 16 for Kenya VAT"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter VAT/sales tax rate for your country
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {isAdmin ? (
              <>Fields marked with <span className="text-red-500">*</span> are required</>
            ) : (
              <span className="text-amber-600">Only administrators can edit business profile</span>
            )}
          </p>

          <button
            type="submit"
            disabled={!isAdmin || saving}
            className={`
              inline-flex items-center gap-2 px-6 py-2 rounded-lg font-medium text-sm
              transition-colors
              ${isAdmin
                ? 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-400'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="bg-red-50 rounded-lg shadow-sm border-2 border-red-200 p-6 mt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                Danger Zone
              </h3>
              <p className="text-sm text-red-800 mb-4">
                Permanently delete this business and all associated data. This action cannot be undone.
                All products, sales, users, and settings will be permanently removed. User accounts that only belong to this business will also be deleted.
              </p>
              <button
                onClick={() => setShowDeleteBusinessConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete Business
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Logo Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete Logo
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete your business logo? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoDelete}
                disabled={uploading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:bg-red-400"
              >
                {uploading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Business Confirmation Modal */}
      {showDeleteBusinessConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete Business
                </h3>
                <p className="text-gray-600 text-sm">
                  This action is <strong>permanent and irreversible</strong>. All data will be deleted:
                </p>
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>All products and inventory</li>
                  <li>All sales records</li>
                  <li>All team members (removed from business)</li>
                  <li>All settings and configurations</li>
                  <li><strong>User accounts that only belong to this business</strong></li>
                </ul>
                <p className="mt-3 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                  <strong>Note:</strong> If you only belong to this business, your account will be permanently deleted.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="confirmDelete" className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="font-mono font-bold text-red-600">{tenant?.name}</span> to confirm deletion:
              </label>
              <input
                type="text"
                id="confirmDelete"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Enter business name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteBusinessConfirm(false);
                  setDeleteConfirmationText('');
                }}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBusinessDelete}
                disabled={deleting || deleteConfirmationText !== tenant?.name}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:bg-red-400 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Business Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
