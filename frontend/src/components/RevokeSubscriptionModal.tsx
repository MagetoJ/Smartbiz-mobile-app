import { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { AlertTriangle, X, CheckCircle } from 'lucide-react';

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

interface TenantStats {
  id: number;
  name: string;
  subdomain: string;
  subscription_status?: string | null;
  branch_count: number;
  branch_details?: BranchDetail[];
}

interface RevokeSubscriptionModalProps {
  tenant: TenantStats;
  onConfirm: (tenantId: number) => Promise<void>;
  onClose: () => void;
}

export default function RevokeSubscriptionModal({ tenant, onConfirm, onClose }: RevokeSubscriptionModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');

  const isConfirmValid = confirmText === tenant.name;

  const handleRevoke = async () => {
    if (!isConfirmValid) return;

    try {
      setRevoking(true);
      setError('');
      await onConfirm(tenant.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke subscription');
      setRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Revoke Subscription</h3>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={revoking}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tenant Info */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Tenant:</span>
              <span className="font-medium text-gray-900">{tenant.name}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Subdomain:</span>
              <span className="font-medium text-gray-900">{tenant.subdomain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Branches:</span>
              <span className="font-medium text-gray-900">{tenant.branch_count}</span>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-600 rounded">
          <h4 className="font-semibold text-red-900 mb-2">This will immediately:</h4>
          <ul className="text-sm text-red-800 space-y-1">
            <li>• Deactivate ALL {tenant.branch_count} branch subscription(s)</li>
            <li>• Set subscription status to "expired"</li>
            <li>• Clear all billing information</li>
            <li>• Block access until they resubscribe</li>
          </ul>
        </div>

        {/* Affected Branches */}
        {tenant.branch_details && tenant.branch_details.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Branches to be deactivated:
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {tenant.branch_details
                .filter(b => b.is_active)
                .map(b => (
                  <div key={b.tenant_id} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-900 font-medium">{b.name}</span>
                    <span className="text-gray-500">({b.subdomain})</span>
                    {b.is_cancelled && (
                      <span className="text-orange-600 text-xs ml-auto">(Already cancelled)</span>
                    )}
                  </div>
                ))
              }
              {tenant.branch_details.filter(b => b.is_active).length === 0 && (
                <p className="text-sm text-gray-500 italic">No active branches to deactivate</p>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-red-800 flex-1">{error}</p>
              <button
                onClick={() => setError('')}
                className="text-red-600 hover:text-red-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type <span className="font-bold text-gray-900">"{tenant.name}"</span> to confirm:
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Enter tenant name"
            disabled={revoking}
            className="w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={revoking}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRevoke}
            disabled={!isConfirmValid || revoking}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
          >
            {revoking ? 'Revoking...' : 'Revoke Subscription'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
