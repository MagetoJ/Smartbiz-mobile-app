import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { MobileNav } from '@/components/MobileNav';
import { BusinessLogo } from '@/components/BusinessLogo';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { RoleBadge } from '@/components/RoleBadge';
import { LayoutDashboard, ShoppingCart, Package, LogOut, Store, Settings, FileText, MapPin, ChevronLeft, ChevronRight, UserCircle, MinusCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/lib/permissions';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Sidebar collapse state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const permissions = usePermissions();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: [Permission.VIEW_DASHBOARD] },
    { path: '/pos', label: 'Point of Sale', icon: ShoppingCart, permissions: [Permission.MANAGE_POS] },
    { path: '/customers', label: 'Customers', icon: UserCircle, permissions: [Permission.MANAGE_POS] },
    { path: '/inventory', label: 'Inventory', icon: Package, permissions: [Permission.MANAGE_INVENTORY] },
    { path: '/expenses', label: 'Expenses', icon: MinusCircle, permissions: [Permission.VIEW_REPORTS] },
    { path: '/reports', label: 'Reports', icon: FileText, permissions: [Permission.VIEW_REPORTS] },
    { path: '/settings', label: 'Settings', icon: Settings, permissions: [Permission.MANAGE_SETTINGS, Permission.VIEW_PRINTER_SETTINGS] },
  ].filter(item => item.permissions.some(p => permissions.hasPermission(p)));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-primary-600 text-white shadow-md no-print sticky top-0 z-40 safe-top">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 min-w-0 flex-1">
            {tenant?.logo_url ? (
              <BusinessLogo
                logoUrl={tenant.logo_url}
                businessName={tenant?.name || 'StatBricks'}
                size="display"
                className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg object-cover border-2 border-white/20 flex-shrink-0"
              />
            ) : (
              <Store className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg lg:text-xl font-bold truncate">{tenant?.name || 'StatBricks'}</h1>
              {user?.branch_name && (
                <div className="text-[10px] sm:text-xs text-primary-100 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                  <span className="truncate">{user.branch_name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4 flex-shrink-0">
            <div className="hidden md:flex md:flex-col md:items-end gap-1.5 max-w-[200px]">
              <div className="text-sm font-medium truncate">Welcome, {user?.full_name}</div>
              {user?.role_type && <RoleBadge roleType={user.role_type} size="sm" />}
            </div>
            <TenantSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white hover:bg-primary-700 hover:text-white touch-active h-9 sm:h-10"
            >
              <LogOut className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside 
          className={`hidden lg:flex lg:flex-col bg-white border-r border-gray-200 no-print transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
          }`}
        >
          {/* Sidebar Toggle Button */}
          <div className="flex items-center justify-end p-4 border-b border-gray-200">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="text-gray-600 hover:bg-gray-100"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </Button>
          </div>

          <nav className="p-4 space-y-2">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link key={`${item.path}-${item.label}-${index}`} to={item.path}>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    className={`w-full ${
                      isSidebarCollapsed ? 'justify-center px-2' : 'justify-start'
                    } ${
                      isActive 
                        ? 'bg-primary-600 text-white hover:bg-primary-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={`w-5 h-5 ${isSidebarCollapsed ? '' : 'mr-3'}`} />
                    {!isSidebarCollapsed && <span>{item.label}</span>}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto max-w-7xl p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
}
