import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, Branch } from '../lib/api';

interface CreateBranchModalProps {
  onClose: () => void;
  onSuccess: (branch: Branch) => void;
}

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

export default function CreateBranchModal({ onClose, onSuccess }: CreateBranchModalProps) {
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    admin_user_id: ''
  });
  const [users, setUsers] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load users on mount
  useEffect(() => {
    const loadUsers = async () => {
      if (!token) return;

      try {
        const usersData = await api.getTenantUsers(token);
        setUsers(usersData);
      } catch (err) {
        console.error('Failed to load users:', err);
        setError('Failed to load users');
      } finally {
        setIsLoadingUsers(false);
      }
    };

    loadUsers();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Subdomain will be auto-generated from name on backend
      const newBranch = await api.createBranch(token, {
        name: formData.name,
        admin_user_id: formData.admin_user_id ? parseInt(formData.admin_user_id) : undefined
      });

      // Pass branch details to parent
      onSuccess(newBranch);
    } catch (err: any) {
      console.error('Failed to create branch:', err);
      setError(err.message || 'Failed to create branch');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create New Branch</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Branch Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Branch Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Downtown Branch, Airport Location"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Subdomain will be auto-generated from this name
            </p>
          </div>

          {/* Branch Admin */}
          <div>
            <label htmlFor="admin_user_id" className="block text-sm font-medium text-gray-700 mb-1">
              Branch Admin (Optional)
            </label>
            {isLoadingUsers ? (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                Loading users...
              </div>
            ) : (
              <select
                id="admin_user_id"
                name="admin_user_id"
                value={formData.admin_user_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Select a user (optional)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email}) - {user.role}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500">
              If not selected, you will be assigned as the branch admin
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <p className="text-sm text-blue-800 font-medium mb-2">
              What happens when you create a branch:
            </p>
            <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
              <li>New location created with unique subdomain</li>
              <li>Shares your product catalog automatically</li>
              <li>Independent inventory tracking per branch</li>
              <li>Admin can manage this location's operations</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || isLoadingUsers}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
