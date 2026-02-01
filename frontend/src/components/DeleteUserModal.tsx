import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

interface DeleteUserModalProps {
  isOpen: boolean;
  userName: string;
  userEmail: string;
  userId: number;
  token: string;
  onClose: () => void;
  onDelete: (userId: number) => Promise<void>;
}

interface UserDeletionStatus {
  can_delete: boolean;
  can_deactivate: boolean;
  has_data: boolean;
  data_summary: {
    sales: number;
    stock_movements: number;
  };
}

// Helper function to extract error message from various error types
function extractErrorMessage(err: unknown): string {
  // Log error for debugging
  console.error('Error caught in DeleteUserModal:', err);
  console.error('Error type:', typeof err);
  console.error('Error constructor:', err?.constructor?.name);

  // Handle string errors
  if (typeof err === 'string') {
    return err;
  }

  // Handle Error instances
  if (err instanceof Error) {
    return err.message;
  }

  // Handle object-like errors
  if (typeof err === 'object' && err !== null) {
    const error = err as any;

    // Try various common error properties
    if (error.message && typeof error.message === 'string') {
      return error.message;
    }

    // Handle FastAPI validation errors (detail is an array)
    if (error.detail) {
      // If detail is an array of validation errors
      if (Array.isArray(error.detail)) {
        const messages = error.detail.map((item: any) => item.msg || JSON.stringify(item)).join(', ');
        return `Validation error: ${messages}`;
      }
      // If detail is a string
      if (typeof error.detail === 'string') {
        return error.detail;
      }
    }

    if (error.error && typeof error.error === 'string') {
      return error.error;
    }

    // Try to stringify if all else fails
    try {
      const stringified = JSON.stringify(error);
      if (stringified && stringified !== '{}') {
        return `Error details: ${stringified}`;
      }
    } catch (stringifyError) {
      console.error('Failed to stringify error:', stringifyError);
    }
  }

  return 'An unexpected error occurred. Please try again.';
}

export default function DeleteUserModal({
  isOpen,
  userName,
  userEmail,
  userId,
  token,
  onClose,
  onDelete
}: DeleteUserModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionStatus, setDeletionStatus] = useState<UserDeletionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user can be deleted when modal opens
  useEffect(() => {
    if (isOpen && token) {
      setIsLoading(true);
      api.checkUserCanDelete(token, userId)
        .then((status: UserDeletionStatus) => {
          setDeletionStatus(status);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Failed to check user deletion status:', err);
          setError(extractErrorMessage(err));
          setIsLoading(false);
        });
    } else {
      // Reset state when modal closes
      setConfirmText('');
      setError(null);
      setDeletionStatus(null);
      setIsLoading(true);
    }
  }, [isOpen, userId, token]);

  if (!isOpen) return null;

  const actionText = deletionStatus?.can_delete ? 'Remove' : 'Deactivate';
  const actionVerb = deletionStatus?.can_delete ? 'removal' : 'deactivation';

  const handleDelete = async () => {
    if (confirmText !== userName) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(userId);
      // Reset state after successful deletion
      setConfirmText('');
      // onClose will be called by parent after successful deletion
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmText('');
      setError(null);
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const isDeleteEnabled = confirmText === userName && !isDeleting && !isLoading;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {isLoading ? 'Loading...' : `${actionText} User`}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* User Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-semibold text-lg">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{userName}</p>
                <p className="text-sm text-gray-600 truncate">{userEmail}</p>
              </div>
            </div>
          </div>

          {/* Warning Message */}
          {!isLoading && deletionStatus && (
            <div className={`border rounded-lg p-4 ${
              deletionStatus.can_delete
                ? 'bg-red-50 border-red-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              {deletionStatus.can_delete ? (
                <>
                  <p className="text-red-900 font-medium mb-2">
                    ⚠️ This user has no data and will be permanently removed from the organization.
                  </p>
                  <p className="text-red-800 text-sm">
                    They will lose access immediately and need to be re-invited to rejoin.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-yellow-900 font-medium mb-2">
                    ⚠️ This user has data and cannot be permanently removed.
                  </p>
                  <p className="text-yellow-800 text-sm mb-2">
                    The user will be <strong>deactivated</strong> to preserve historical data:
                  </p>
                  <ul className="text-yellow-800 text-sm space-y-1 ml-5 list-disc">
                    <li>{deletionStatus.data_summary.sales} sales records will be preserved</li>
                    <li>{deletionStatus.data_summary.stock_movements} stock movements will be preserved</li>
                    <li>User will be unable to login</li>
                    <li>User will no longer appear in active lists</li>
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Confirmation Input */}
          {!isLoading && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To confirm {actionVerb}, type the user's full name:{' '}
                <span className="font-bold text-gray-900">{userName}</span>
              </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={userName}
              disabled={isDeleting}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 disabled:opacity-50 disabled:bg-gray-100 ${
                confirmText && confirmText === userName
                  ? 'border-green-500 focus:ring-green-500'
                  : 'border-gray-300 focus:ring-primary-500'
              }`}
              autoFocus
            />
              {confirmText && confirmText !== userName && (
                <p className="text-sm text-red-600 mt-1">
                  Name does not match
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t rounded-b-lg">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!isDeleteEnabled}
            className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
              isDeleteEnabled
                ? deletionStatus?.can_delete
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            {isDeleting
              ? `${actionText}ing...`
              : isLoading
              ? 'Loading...'
              : `${actionText} User`}
          </button>
        </div>
      </div>
    </div>
  );
}
