import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  api,
  UserTenantMembership,
  TenantCreate,
  Tenant,
  Organization
} from '@/lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  role_type: 'parent_org_admin' | 'branch_admin' | 'staff';
  branch_id?: number | null;
  branch_name?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  tenant: Tenant | null;
  organization: Organization | null;
  availableTenants: UserTenantMembership[];
  isBranchTenant: boolean;
  isOrgAdmin: boolean;
  login: (username: string, password: string, subdomain?: string) => Promise<any>;
  register: (data: TenantCreate) => Promise<{ success: boolean; error?: string }>;
  selectTenant: (tenantId: number) => Promise<void>;
  switchTenant: (tenantId: number) => Promise<void>;
  logout: () => void;
  refreshOrganization: () => Promise<void>;
  updateTenantLogo: (logoUrl: string) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [tenant, setTenant] = useState<Tenant | null>(() => {
    const stored = localStorage.getItem('tenant');
    return stored ? JSON.parse(stored) : null;
  });
  const [organization, setOrganization] = useState<Organization | null>(() => {
    const stored = localStorage.getItem('organization');
    return stored ? JSON.parse(stored) : null;
  });
  const [availableTenants, setAvailableTenants] = useState<UserTenantMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Computed properties
  const isBranchTenant = tenant?.parent_tenant_id != null;
  const isOrgAdmin = user?.role === 'admin' && isBranchTenant; // Admin in a branch tenant can potentially be org admin

  useEffect(() => {
    if (token) {
      api.getMe(token)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('tenant');
          localStorage.removeItem('organization');
          setToken(null);
          setTenant(null);
          setOrganization(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const refreshOrganization = async () => {
    if (!token || !tenant?.organization_id) {
      setOrganization(null);
      localStorage.removeItem('organization');
      return;
    }

    try {
      const orgData = await api.getOrganization(token);
      setOrganization(orgData);
      localStorage.setItem('organization', JSON.stringify(orgData));
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      setOrganization(null);
      localStorage.removeItem('organization');
    }
  };

  const login = async (username: string, password: string, subdomain?: string) => {
    const data = await api.login(username, password, subdomain);

    // Case 1: User selected tenant or has only one tenant - returns Token
    if (data.access_token) {
      setToken(data.access_token);
      localStorage.setItem('token', data.access_token);

      // Store tenant info
      if (data.tenant) {
        setTenant(data.tenant);
        localStorage.setItem('tenant', JSON.stringify(data.tenant));

        // Fetch organization if tenant is part of an organization
        if (data.tenant.organization_id) {
          try {
            const orgData = await api.getOrganization(data.access_token);
            setOrganization(orgData);
            localStorage.setItem('organization', JSON.stringify(orgData));
          } catch (error) {
            console.error('Failed to fetch organization:', error);
          }
        } else {
          // Independent tenant - clear any stale organization data
          setOrganization(null);
          localStorage.removeItem('organization');
        }
      }

      const userData = await api.getMe(data.access_token);
      setUser(userData);

      // Auto-switch to assigned branch if user has branch_id and is not admin
      if (data.user?.branch_id && data.user.role !== 'admin') {
        console.log(`User assigned to branch ${data.user.branch_id}, auto-switching...`);
        try {
          const switchResponse = await api.switchTenant(data.access_token, data.user.branch_id);

          // Update with branch context
          setToken(switchResponse.access_token);
          localStorage.setItem('token', switchResponse.access_token);

          setTenant(switchResponse.tenant);
          localStorage.setItem('tenant', JSON.stringify(switchResponse.tenant));

          // Update user data with branch context
          const branchUserData = await api.getMe(switchResponse.access_token);
          setUser(branchUserData);

          console.log(`Switched to branch: ${switchResponse.tenant.name}`);
        } catch (error) {
          console.error('Failed to auto-switch to assigned branch:', error);
          // Continue with parent access - user can manually switch later
        }
      }

      return { success: true };
    }

    // Case 2: User needs to select tenant - returns LoginWithTenantsResponse
    if (data.tenants) {
      setAvailableTenants(data.tenants);
      setUser(data.user);

      // Store credentials temporarily for tenant selection
      localStorage.setItem('pending_login', JSON.stringify({ username, password }));

      return {
        needsTenantSelection: true,
        tenants: data.tenants,
        user: data.user
      };
    }

    throw new Error('Unexpected login response');
  };

  const register = async (data: TenantCreate): Promise<{ success: boolean; error?: string }> => {
    try {
      // Step 1: Register the tenant and admin user
      await api.registerTenant(data);

      // Step 2: Auto-login with the newly created credentials
      // Use subdomain to ensure proper tenant context
      const loginResult = await login(
        data.admin_username,
        data.admin_password,
        data.subdomain
      );

      if (loginResult.success) {
        return { success: true };
      } else {
        throw new Error('Registration succeeded but auto-login failed');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message || 'Registration failed. Please try again.'
      };
    }
  };

  const selectTenant = async (tenantId: number) => {
    const tenantData = availableTenants.find(t => t.tenant_id === tenantId);
    if (!tenantData) {
      throw new Error('Tenant not found');
    }

    // Re-login with selected tenant using stored credentials
    const pendingLogin = JSON.parse(localStorage.getItem('pending_login') || '{}');
    await login(pendingLogin.username, pendingLogin.password, tenantData.tenant_subdomain);

    // Clean up
    localStorage.removeItem('pending_login');
    setAvailableTenants([]);
  };

  const switchTenant = async (tenantId: number) => {
    if (!token) {
      throw new Error('Not authenticated');
    }

    const data = await api.switchTenant(token, tenantId);

    setToken(data.access_token);
    localStorage.setItem('token', data.access_token);

    // Update tenant info
    if (data.tenant) {
      setTenant(data.tenant);
      localStorage.setItem('tenant', JSON.stringify(data.tenant));

      // Fetch organization if new tenant is part of an organization
      if (data.tenant.organization_id) {
        try {
          const orgData = await api.getOrganization(data.access_token);
          setOrganization(orgData);
          localStorage.setItem('organization', JSON.stringify(orgData));
        } catch (error) {
          console.error('Failed to fetch organization:', error);
        }
      } else {
        setOrganization(null);
        localStorage.removeItem('organization');
      }
    }

    // Update user with new role
    if (data.user) {
      setUser(data.user);
    }

    // Reload the page to refresh all data for new tenant
    window.location.reload();
  };

  const updateTenantLogo = (logoUrl: string) => {
    if (!tenant) return;
    
    const updatedTenant = { ...tenant, logo_url: logoUrl };
    setTenant(updatedTenant);
    localStorage.setItem('tenant', JSON.stringify(updatedTenant));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
    setOrganization(null);
    setAvailableTenants([]);
    localStorage.removeItem('token');
    localStorage.removeItem('tenant');
    localStorage.removeItem('organization');
    localStorage.removeItem('pending_user');
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      tenant,
      organization,
      availableTenants,
      isBranchTenant,
      isOrgAdmin,
      login,
      register,
      selectTenant,
      switchTenant,
      logout,
      refreshOrganization,
      updateTenantLogo,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
