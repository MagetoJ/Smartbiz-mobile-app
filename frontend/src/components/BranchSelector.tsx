import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { MapPin, Eye } from 'lucide-react';

interface Branch {
  id: number;
  name: string;
  subdomain: string;
  address?: string;
}

interface BranchSelectorProps {
  selectedBranchId: number | null;  // NULL means "All Locations"
  onBranchChange: (branchId: number | null) => void;
}

export function BranchSelector({ selectedBranchId, onBranchChange }: BranchSelectorProps) {
  const { tenant, user, token } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBranches();
  }, [token]);

  const fetchBranches = async () => {
    if (!token) return;

    try {
      setLoading(true);
      // Fetch branches for the current organization
      const data = await api.getBranches(token);
      setBranches(data);
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Determine if current view is read-only
  // Parent org admins never have read-only restrictions
  const isParentOrgAdmin = user?.role_type === 'parent_org_admin';
  const isReadOnly = !isParentOrgAdmin && user?.branch_id && user.branch_id !== selectedBranchId;

  // Get selected branch
  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  // Don't show branch selector if no branches exist
  if (!loading && branches.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {/* Branch Selector Dropdown */}
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-gray-500" />
        <label htmlFor="branch-select" className="text-sm font-medium text-gray-700">
          Viewing:
        </label>
        <select
          id="branch-select"
          value={selectedBranchId === null ? 'all' : selectedBranchId}
          onChange={(e) => {
            const value = e.target.value;
            onBranchChange(value === 'all' ? null : Number(value));
          }}
          disabled={loading}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {/* All Locations Option - Only for owners */}
          {isParentOrgAdmin && (
            <option value="all">
              All Locations ({branches.length + 1} {branches.length === 0 ? 'location' : 'locations'})
            </option>
          )}

          {/* Main Location */}
          <option value={tenant?.id}>
            {tenant?.name || 'Main Location'}
          </option>

          {/* Branch Locations */}
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>

      {/* Read-Only Indicator */}
      {isReadOnly && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md">
          <Eye className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-medium text-amber-700">
            Read-Only
          </span>
        </div>
      )}

      {/* Branch Info Tooltip */}
      {selectedBranch?.address && (
        <div className="hidden lg:block text-xs text-gray-500">
          {selectedBranch.address}
        </div>
      )}
    </div>
  );
}
