/**
 * usePermissions Hook
 *
 * Provides permission checking utilities based on the current user's role.
 * Use this hook to conditionally render UI elements or restrict access to features.
 */

import { useAuth } from '@/contexts/AuthContext';
import { Permission, hasPermission, isOwner, isBranchScoped, type RoleType } from '@/lib/permissions';

export function usePermissions() {
  const { user } = useAuth();

  const roleType = user?.role_type as RoleType | undefined;

  return {
    /**
     * Check if the current user has a specific permission
     */
    hasPermission: (permission: Permission) => hasPermission(roleType, permission),

    /**
     * Convenience flags for common permissions
     */
    canViewDashboard: hasPermission(roleType, Permission.VIEW_DASHBOARD),
    canViewReports: hasPermission(roleType, Permission.VIEW_REPORTS),
    canManagePOS: hasPermission(roleType, Permission.MANAGE_POS),
    canViewSalesHistory: hasPermission(roleType, Permission.VIEW_SALES_HISTORY),
    canManageInventory: hasPermission(roleType, Permission.MANAGE_INVENTORY),
    canManageUsers: hasPermission(roleType, Permission.MANAGE_USERS),
    canManageSettings: hasPermission(roleType, Permission.MANAGE_SETTINGS),
    canManageBranches: hasPermission(roleType, Permission.MANAGE_BRANCHES),

    /**
     * Role type information
     */
    roleType: roleType,
    isOwner: isOwner(roleType),
    isBranchAdmin: roleType === 'branch_admin',
    isStaff: roleType === 'staff',
    isBranchScoped: isBranchScoped(roleType),
  };
}
