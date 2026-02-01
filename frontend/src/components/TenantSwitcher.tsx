import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, UserTenantMembership } from '@/lib/api';
import { ChevronDown, Building2, Check } from 'lucide-react';

export function TenantSwitcher() {
  const { tenant, token, switchTenant } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [tenants, setTenants] = useState<UserTenantMembership[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token && isOpen && tenants.length === 0) {
      loadTenants();
    }
  }, [isOpen, token]);

  const loadTenants = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const data = await api.getMyTenants(token);
      setTenants(data);
    } catch (error) {
      console.error('Failed to load tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (tenantId: number) => {
    if (tenantId === tenant?.id) {
      setIsOpen(false);
      return;
    }

    try {
      await switchTenant(tenantId);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch tenant:', error);
    }
  };

  // Only show if user has access to multiple tenants
  if (tenants.length <= 1 && !loading) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm"
      >
        <Building2 className="w-4 h-4" />
        <span className="hidden md:inline max-w-32 truncate">{tenant?.name}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-4 py-2 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase">Switch Business</p>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading businesses...</p>
                </div>
              ) : tenants.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500">No other businesses available</p>
                </div>
              ) : (
                tenants.map((t) => (
                  <button
                    key={t.tenant_id}
                    onClick={() => handleSwitch(t.tenant_id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                      t.tenant_id === tenant?.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    {t.tenant_logo_url ? (
                      <img
                        src={`https://pub-074a09a663eb4769b3da85cd2a134fe6.r2.dev/${t.tenant_logo_url}`}
                        alt={t.tenant_name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-gray-500" />
                      </div>
                    )}

                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-900">{t.tenant_name}</p>
                      <p className="text-xs text-gray-500">Role: {t.role}</p>
                    </div>

                    {t.tenant_id === tenant?.id && (
                      <Check className="w-5 h-5 text-primary-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
