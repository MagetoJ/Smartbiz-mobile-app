import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AlertCircle, Store, Eye, EyeOff } from 'lucide-react';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const { login, selectTenant } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);

      if (result.needsTenantSelection) {
        // User has multiple tenants - show selector
        setTenants(result.tenants);
        setShowTenantSelector(true);
      } else {
        // User logged in successfully
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleTenantSelect = async (tenantId: number) => {
    setLoading(true);
    setError('');

    try {
      await selectTenant(tenantId);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to select business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3 flex flex-col items-center text-center pb-6">
          <img 
            src="/android-chrome-192x192.png" 
            alt="mBiz Logo" 
            className="w-16 h-16 md:w-20 md:h-20 rounded-2xl mb-2 shadow-lg object-contain"
          />
          <div className="space-y-2">
            <CardTitle className="text-3xl md:text-4xl tracking-wide">
              <span className="font-light bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-sm">
                m
              </span>
              <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-700 bg-clip-text text-transparent drop-shadow-md">
                Biz
              </span>
            </CardTitle>
            <p className="text-sm md:text-base text-gray-600 font-medium">
              Smart Business Management Made Simple
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-500 pt-1">
              <span className="flex items-center gap-1">
                <span className="text-primary-600">✓</span> Inventory
              </span>
              <span className="flex items-center gap-1">
                <span className="text-primary-600">✓</span> Sales
              </span>
              <span className="flex items-center gap-1">
                <span className="text-primary-600">✓</span> Expenses
              </span>
              <span className="flex items-center gap-1">
                <span className="text-primary-600">✓</span> Analytics & More
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!showTenantSelector ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <Input
                  id="username"
                  type="email"
                  placeholder="Enter your email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={loading}
                size="lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>

              {/* Sign Up Link */}
              <div className="text-center text-sm text-gray-600">
                Don't have a business account?{' '}
                <Link
                  to="/register"
                  className="text-primary-600 hover:text-primary-700 font-medium underline"
                >
                  Sign up for free
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 mb-1">Select Your Business</p>
                <p className="text-xs text-gray-500">Choose which business you want to access</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                {tenants.map((tenant) => (
                  <button
                    key={tenant.tenant_id}
                    onClick={() => handleTenantSelect(tenant.tenant_id)}
                    disabled={loading}
                    className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      {tenant.tenant_logo_url ? (
                        <img
                          src={`https://pub-074a09a663eb4769b3da85cd2a134fe6.r2.dev/${tenant.tenant_logo_url}`}
                          alt={tenant.tenant_name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-primary-100 rounded flex items-center justify-center">
                          <Store className="w-6 h-6 text-primary-600" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{tenant.tenant_name}</p>
                        <p className="text-xs text-gray-500">Role: {tenant.role}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setShowTenantSelector(false);
                  setTenants([]);
                  setUsername('');
                  setPassword('');
                }}
                className="w-full"
              >
                Back to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-sm text-gray-600">
          © 2026 StatBricks.
        </p>
      </div>
    </div>
  );
}
