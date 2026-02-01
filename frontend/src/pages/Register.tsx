import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Building2, Mail, User, Lock, Globe, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function Register() {
  const navigate = useNavigate();
  const { register, user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Slugify helper function
  const slugify = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-')  // Replace spaces/underscores with hyphens
      .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
  };

  // Auto-generate subdomain from business name
  const handleBusinessNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setBusinessName(name);

    // Only auto-generate if subdomain hasn't been manually edited
    if (!subdomain || slugify(businessName) === subdomain) {
      const generated = slugify(name);
      setSubdomain(generated);
    }
  };

  // Check subdomain availability with debounce
  useEffect(() => {
    if (!subdomain || subdomain.length < 3) {
      setIsAvailable(null);
      return;
    }

    // Validate subdomain format (alphanumeric and hyphens only)
    const subdomainRegex = /^[a-z0-9-]+$/;
    if (!subdomainRegex.test(subdomain)) {
      setIsAvailable(false);
      setValidationErrors(prev => ({
        ...prev,
        subdomain: 'Only lowercase letters, numbers, and hyphens allowed'
      }));
      return;
    } else {
      setValidationErrors(prev => {
        const { subdomain, ...rest } = prev;
        return rest;
      });
    }

    // Debounce: wait 500ms after user stops typing
    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const result = await api.checkSubdomainAvailability(subdomain);
        setIsAvailable(result.available);
      } catch (err) {
        console.error('Subdomain check failed:', err);
        setIsAvailable(null);
      } finally {
        setIsChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [subdomain]);

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!businessName.trim()) {
      errors.businessName = 'Business name is required';
    }

    if (!subdomain || subdomain.length < 3) {
      errors.subdomain = 'Subdomain must be at least 3 characters';
    } else if (isAvailable === false) {
      errors.subdomain = 'This subdomain is already taken';
    }

    if (!ownerEmail.trim()) {
      errors.ownerEmail = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      errors.ownerEmail = 'Invalid email format';
    }

    if (!adminFullName.trim()) {
      errors.adminFullName = 'Full name is required';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await register({
        name: businessName.trim(),
        subdomain: subdomain.toLowerCase(),
        slug: subdomain.toLowerCase(),
        owner_email: ownerEmail.trim(),
        admin_username: ownerEmail.trim(), // Use email as username
        admin_password: password,
        admin_full_name: adminFullName.trim(),
      });

      if (result.success) {
        // Auto-login successful, navigate to dashboard
        navigate('/dashboard');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create Your Business Account</CardTitle>
          <CardDescription className="text-center">
            Start managing your inventory and sales in minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business Name */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="businessName">Business Name *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="businessName"
                  type="text"
                  placeholder="Acme Store"
                  value={businessName}
                  onChange={handleBusinessNameChange}
                  className={`pl-10 ${validationErrors.businessName ? 'border-red-500' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {validationErrors.businessName && (
                <p className="text-red-500 text-xs">{validationErrors.businessName}</p>
              )}
            </div>

            {/* Subdomain */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="subdomain">Business Subdomain *</label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="subdomain"
                  type="text"
                  placeholder="acme-store"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                  className={`pl-10 pr-10 ${
                    validationErrors.subdomain
                      ? 'border-red-500'
                      : isAvailable === true
                      ? 'border-green-500'
                      : ''
                  }`}
                  disabled={isSubmitting}
                />
                {isChecking && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 text-gray-400 animate-spin" />
                )}
                {!isChecking && isAvailable === true && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                )}
                {!isChecking && isAvailable === false && (
                  <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
                )}
              </div>
              {subdomain && (
                <p className="text-xs text-gray-500">
                  Your business will be accessible at: <span className="font-medium">{subdomain}.statbricks.com</span>
                </p>
              )}
              {validationErrors.subdomain && (
                <p className="text-red-500 text-xs">{validationErrors.subdomain}</p>
              )}
            </div>

            {/* Owner Email */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="ownerEmail">Owner Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="ownerEmail"
                  type="email"
                  placeholder="owner@acme.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className={`pl-10 ${validationErrors.ownerEmail ? 'border-red-500' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {validationErrors.ownerEmail && (
                <p className="text-red-500 text-xs">{validationErrors.ownerEmail}</p>
              )}
            </div>

            {/* Admin Full Name */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="adminFullName">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="adminFullName"
                  type="text"
                  placeholder="John Doe"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  className={`pl-10 ${validationErrors.adminFullName ? 'border-red-500' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {validationErrors.adminFullName && (
                <p className="text-red-500 text-xs">{validationErrors.adminFullName}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="password">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`pl-10 ${validationErrors.password ? 'border-red-500' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {validationErrors.password && (
                <p className="text-red-500 text-xs">{validationErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="confirmPassword">Confirm Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`pl-10 ${validationErrors.confirmPassword ? 'border-red-500' : ''}`}
                  disabled={isSubmitting}
                />
              </div>
              {validationErrors.confirmPassword && (
                <p className="text-red-500 text-xs">{validationErrors.confirmPassword}</p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || isChecking || isAvailable === false}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>

            {/* Sign In Link */}
            <div className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
