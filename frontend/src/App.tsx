import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProductProvider } from './contexts/ProductContext';
import { ToastProvider } from './components/Toast';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import Settings from './pages/Settings';
import Users from './pages/Users';
import { POS } from './pages/POS';
import { Reports } from './pages/Reports';
import { SalesHistory } from './pages/SalesHistory';
import { Expenses } from './pages/Expenses';
import Customers from './pages/Customers';
import OrganizationProducts from './pages/OrganizationProducts';
import SuperAdminLogin from './pages/SuperAdminLogin';
import SuperAdminPanel from './pages/SuperAdminPanel';
import { InstallPWA } from './components/InstallPWA';
import { OnlineStatus } from './components/OnlineStatus';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // Redirect staff to reports
  if (user.role !== 'admin') {
    return <Navigate to="/reports" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* Platform Super Admin Routes - NO NAVIGATION LINKS */}
      <Route path="/admin/login" element={<SuperAdminLogin />} />
      <Route path="/admin" element={<SuperAdminPanel />} />
      
      {/* Tenant Routes */}
      <Route
        path="/dashboard"
        element={
          <AdminRoute>
            <Dashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <PrivateRoute>
            <Inventory />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        }
      />
      <Route
        path="/users"
        element={
          <AdminRoute>
            <Users />
          </AdminRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <PrivateRoute>
            <POS />
          </PrivateRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <PrivateRoute>
            <Customers />
          </PrivateRoute>
        }
      />
      <Route
        path="/sales"
        element={<Navigate to="/reports" replace />}
      />
      <Route
        path="/sales-history"
        element={
          <PrivateRoute>
            <SalesHistory />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <Reports />
          </PrivateRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <AdminRoute>
            <Expenses />
          </AdminRoute>
        }
      />
      <Route
        path="/organization/products"
        element={
          <AdminRoute>
            <OrganizationProducts />
          </AdminRoute>
        }
      />
      <Route
        path="/"
        element={
          user?.role === 'admin' ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/reports" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProductProvider>
          <ToastProvider>
            <OnlineStatus />
            <InstallPWA />
            <AppRoutes />
          </ToastProvider>
        </ProductProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
