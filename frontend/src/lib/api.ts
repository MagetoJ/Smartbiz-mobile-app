// Get API URL from runtime config or environment variable
const getApiBaseUrl = (): string => {
  // Check for React Native
  // @ts-ignore
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return import.meta.env.VITE_API_URL || 'https://api.statbricks.com';
  }

  // Check for Electron
  // @ts-ignore
  if (typeof window !== 'undefined' && (window.process?.type || window.__ELECTRON_ID__)) {
    return 'http://localhost:8000';
  }

  // Check runtime config (injected by docker-entrypoint.sh)
  if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__?.API_URL) {
    return (window as any).__RUNTIME_CONFIG__.API_URL;
  }
  
  // Fallback to build-time environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Development default
  return 'http://localhost:8000';
};

const API_BASE_URL = getApiBaseUrl();

interface FetchOptions extends RequestInit {
  token?: string;
}

// Category interfaces
export interface Category {
  id: number;
  name: string;
  display_order: number;
  icon?: string;
  color?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
  target_margin?: number | null;
  minimum_margin?: number | null;
  effective_target_margin: number;
  effective_minimum_margin: number;
}

export interface CategoryCreate {
  name: string;
  display_order?: number;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

export interface CategoryUpdate {
  name?: string;
  display_order?: number;
  icon?: string;
  color?: string;
  is_active?: boolean;
  target_margin?: number | null;
  minimum_margin?: number | null;
}

// Unit interfaces
export interface Unit {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

export interface UnitCreate {
  name: string;
  display_order?: number;
  is_active?: boolean;
}

export interface UnitUpdate {
  name?: string;
  display_order?: number;
  is_active?: boolean;
}

// User interfaces
export interface TenantUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  role: 'admin' | 'staff';
  tenant_is_active: boolean;
  joined_at: string;
  branch_id?: number;  // Assigned branch for staff
  branch_name?: string;  // Name of assigned branch
}

export interface UserAdd {
  email: string;
  full_name: string;
  password: string;
  role?: 'admin' | 'staff';
  branch_id?: number;  // Assign to specific branch (optional, defaults to main)
}

export interface UserInvite {
  email: string;
  full_name: string;
  role?: 'admin' | 'staff';
  branch_id?: number;  // Assign to specific branch (optional, defaults to main)
}

export interface UserTenantUpdate {
  role?: 'admin' | 'staff';
  is_active?: boolean;
  branch_id?: number;
  full_name?: string;
  email?: string;
}

// Staff Member interface for dashboard filtering
export interface StaffMember {
  id: number;
  full_name: string;
  username: string;
  role: string;  // "admin" or "staff"
}

// AI Classification interfaces
export interface AIClassifyRequest {
  name: string;
}

export interface AIClassifyResponse {
  category_id: number;
  category_name: string;
  unit: string;
  is_service: boolean;
  description: string;
  ai_confidence: 'high' | 'medium' | 'low';
}

// Tenant interfaces
export interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  slug: string;
  owner_email: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  subscription_plan: string;
  max_users: number;
  max_products: number;
  max_branches?: number;
  is_active: boolean;
  currency: string;
  tax_rate: number;
  business_type?: string;
  timezone: string;
  created_at: string;
  organization_id?: number;
  parent_tenant_id?: number | null;
  branch_type?: string;
}

export interface TenantUpdate {
  name?: string;
  phone?: string;
  address?: string;
  business_type?: string;
  currency?: string;
  tax_rate?: number;
  timezone?: string;
  owner_email?: string;
}

export interface TenantCreate {
  name: string;
  subdomain: string;
  slug: string;
  owner_email: string;
  admin_username: string;
  admin_password: string;
  admin_full_name: string;
  phone?: string;
  address?: string;
  business_type?: string;
}

export interface SubdomainCheckResponse {
  available: boolean;
  subdomain: string;
}

// Product interfaces
export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  description: string;
  base_cost: number | null;  // Nullable - can be set later via "Receive Stock"
  selling_price: number | null;  // Nullable - can be set later via "Receive Stock"
  quantity: number;
  category_id: number;
  unit: string;
  image_url: string;
  reorder_level: number;
  is_available: boolean;
  is_service: boolean;
  created_at: string;
  category_rel?: Category;
}

export interface ProductCreate {
  name: string;
  sku?: string;  // Optional - will be autogenerated by backend
  barcode?: string;
  description?: string;
  base_cost?: number;  // Optional - can be set later
  selling_price?: number;  // Optional - can be set later
  category_id?: number;
  unit: string;
  image_url?: string;
  is_available?: boolean;
  is_service?: boolean;
  initial_quantity?: number;  // Optional - initial stock quantity
  // reorder_level removed - auto-calculated by backend
}

export interface ProductUpdate {
  name?: string;
  barcode?: string;
  description?: string;
  base_cost?: number;
  selling_price?: number;
  category_id?: number;
  unit?: string;
  image_url?: string;
  is_available?: boolean;
  // is_service removed - immutable after creation
  // reorder_level removed - auto-calculated by backend
}

// Price History interfaces
export interface PriceHistory {
  id: number;
  product_id: number;
  user_id: number | null;
  base_cost: number;
  selling_price: number;
  source: 'receipt' | 'adjustment' | 'manual_update' | 'migration';
  reference: string | null;
  notes: string | null;
  created_at: string;
  margin_percentage: number | null;
  user_full_name: string | null;
}

export interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  price: number;
  subtotal: number;
  product: Product;
}

export interface SaleUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Sale {
  id: number;
  user_id: number;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  whatsapp_sent?: boolean;
  email_sent?: boolean;
  status: 'pending' | 'completed' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  notes: string;
  created_at: string;
  updated_at: string;
  sale_items: SaleItem[];
  user: SaleUser;
  branch?: {
    id: number;
    name: string;
    subdomain: string;
  } | null;
}

export type ReceiptDeliveryMethod = 'print' | 'whatsapp' | 'email';

export interface SaleItemCreate {
  product_id: number;
  quantity: number;
  custom_price?: number;  // Optional price override
}

export interface SaleCreate {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_method?: ReceiptDeliveryMethod;
  payment_method?: string;
  notes?: string;
  items: SaleItemCreate[];
  customer_id?: number;  // Required when payment_method is "Credit"
  due_date?: string;  // ISO date string, required when payment_method is "Credit"
}

// Customer Credit Module interfaces
export interface Customer {
  id: number;
  tenant_id: number;
  name: string;
  email?: string;
  phone?: string;
  credit_limit?: number;
  current_balance: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreate {
  name: string;
  email?: string;
  phone?: string;
  credit_limit?: number;
  notes?: string;
}

export interface CustomerUpdate {
  name?: string;
  email?: string;
  phone?: string;
  credit_limit?: number;
  notes?: string;
}

export interface CreditTransactionResponse {
  id: number;
  customer_id: number;
  sale_id: number;
  original_amount: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  status: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  created_at: string;
}

export interface PaymentCreate {
  credit_transaction_id: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
}

export interface PaymentResponse {
  id: number;
  customer_id: number;
  credit_transaction_id: number;
  amount: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
  created_at: string;
}

export interface ReminderLogResponse {
  id: number;
  credit_transaction_id: number;
  reminder_stage: number;
  sent_at: string;
  success: boolean;
  error_message?: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  user_id: number;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previous_stock: number;
  new_stock: number;
  base_cost?: number | null;
  selling_price?: number | null;
  supplier?: string | null;
  reference?: string | null;
  notes: string;
  created_at: string;
  product: Product;
  user: any;
}

export interface StockMovementCreate {
  product_id: number;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  base_cost?: number;
  selling_price?: number;
  target_branch_id?: number;
  supplier?: string;
  reference?: string;
  notes?: string;
}

export interface NonMovingProduct {
  id: number;
  name: string;
  sku: string;
  category_name?: string;
  base_cost: number;
  selling_price: number;
  quantity: number;
  days_without_sales: number;
}

// Dashboard interfaces
export interface DashboardStats {
  total_revenue: number;
  total_sales: number;
  total_products: number;
  low_stock_items: number;
  total_stock_value: number | null;  // Optional - hidden from staff users
  today_revenue: number;
  today_sales: number;
}

export interface RevenueByDate {
  date: string;
  revenue: number;
  orders: number;
}

export interface QuantityByDate {
  date: string;
  quantity: number;
}

export interface ProfitByDate {
  date: string;
  profit: number;
}

export interface TopSellingProduct {
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface FinancialReport {
  total_revenue: number;
  total_profit: number;
  total_expenses: number;
  revenue_by_date: RevenueByDate[];
  quantity_by_date: QuantityByDate[];
  profit_by_date: ProfitByDate[];
  top_selling_products: TopSellingProduct[];
  low_stock_products: Product[];
  non_moving_products_count: number;
  non_moving_products: NonMovingProduct[];
}

// Staff Performance Report interfaces
export interface StaffPerformanceMetrics {
  staff_id: number;
  full_name: string;
  username: string;
  role: string;
  total_revenue: number;
  total_sales: number;
  total_units_sold: number;
  total_profit: number;
  avg_sale_value: number;
  revenue_trend: RevenueByDate[];
}

export interface StaffPerformanceReport {
  staff_metrics: StaffPerformanceMetrics[];
  date_range_days: number;
  generated_at: string;
}

export interface BranchPerformanceMetrics {
  branch_id: number;
  branch_name: string;
  total_sales: number;
  total_revenue: number;
  total_profit: number;
}

// Price Variance Report interfaces
export interface ProductVariance {
  product_id: number;
  product_name: string;
  sku: string;
  category_name: string | null;
  standard_price: number;
  total_sales_count: number;
  overridden_sales_count: number;
  total_variance_amount: number;
  avg_override_price: number;
  variance_percentage: number;
}

export interface StaffVariance {
  staff_id: number;
  full_name: string;
  username: string;
  total_sales: number;
  overridden_sales: number;
  override_percentage: number;
  total_variance_amount: number;
  avg_discount_percentage: number;
}

export interface BranchVariance {
  branch_id: number;
  branch_name: string;
  total_sales: number;
  overridden_sales: number;
  override_percentage: number;
  total_variance_amount: number;
}

export interface PriceVarianceReport {
  total_sales: number;
  overridden_sales: number;
  override_rate: number;
  total_variance_amount: number;
  avg_variance_per_override: number;
  product_variances: ProductVariance[];
  staff_variances: StaffVariance[];
  branch_variances: BranchVariance[];
  date_range_days: number;
  generated_at: string;
}

// Tenant switching interfaces
export interface UserTenantMembership {
  tenant_id: number;
  tenant_name: string;
  tenant_subdomain: string;
  tenant_logo_url?: string;
  role: string;
  is_active: boolean;
}

export interface LoginWithTenantsResponse {
  user: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    is_active: boolean;
    created_at: string;
  };
  tenants: UserTenantMembership[];
  message: string;
}

// Organization interfaces
export interface Organization {
  id: number;
  name: string;
  owner_email: string;
  currency: string;
  tax_rate: number;
  timezone: string;
  subscription_plan: string;
  max_branches: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreate {
  name: string;
  owner_email: string;
  admin_username: string;
  admin_password: string;
  admin_full_name: string;
  first_branch_name: string;
  first_branch_subdomain: string;
  currency?: string;
  tax_rate?: number;
  timezone?: string;
}

export interface OrganizationUpdate {
  name?: string;
  owner_email?: string;
  currency?: string;
  tax_rate?: number;
  timezone?: string;
}

export interface Branch {
  id: number;
  name: string;
  subdomain: string;
  slug: string;
  parent_tenant_id: number | null; // For simple branch hierarchy
  organization_id?: number | null; // DEPRECATED - kept for backward compat
  is_active: boolean;
  created_at: string;
  logo_url?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface BranchCreate {
  name: string;
  subdomain?: string; // Optional - will be auto-generated from name if not provided
  admin_user_id?: number;
}

export interface BranchUpdate {
  name?: string;
  is_active?: boolean;
}

export interface OrganizationProduct {
  id: number;
  organization_id: number;
  name: string;
  sku: string;
  description?: string;
  base_cost: number;
  selling_price: number;
  target_margin: number;
  minimum_margin: number;
  category_id?: number;
  unit: string;
  image_url?: string;
  reorder_level: number;
  is_available: boolean;
  is_service: boolean;
  created_at: string;
  updated_at: string;
  category_rel?: OrganizationCategory;
}

export interface OrganizationProductCreate {
  name: string;
  sku?: string;
  description?: string;
  base_cost: number;
  selling_price: number;
  target_margin?: number;
  minimum_margin?: number;
  category_id?: number;
  unit: string;
  image_url?: string;
  reorder_level?: number;
  is_available?: boolean;
  is_service?: boolean;
}

export interface OrganizationProductUpdate {
  name?: string;
  description?: string;
  base_cost?: number;
  selling_price?: number;
  target_margin?: number;
  minimum_margin?: number;
  category_id?: number;
  unit?: string;
  image_url?: string;
  reorder_level?: number;
  is_available?: boolean;
  is_service?: boolean;
}

export interface OrganizationCategory {
  id: number;
  organization_id: number;
  name: string;
  display_order: number;
  icon?: string;
  color?: string;
  is_active: boolean;
  target_margin?: number;
  minimum_margin?: number;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCategoryCreate {
  name: string;
  display_order?: number;
  icon?: string;
  color?: string;
  is_active?: boolean;
  target_margin?: number;
  minimum_margin?: number;
}

export interface OrganizationCategoryUpdate {
  name?: string;
  display_order?: number;
  icon?: string;
  color?: string;
  is_active?: boolean;
  target_margin?: number;
  minimum_margin?: number;
}

export interface BranchStock {
  id: number;
  tenant_id: number;
  org_product_id: number;
  quantity: number;
  override_selling_price?: number;
  created_at: string;
  updated_at: string;
  product?: OrganizationProduct;
}

export interface BranchStockUpdate {
  quantity: number;
  override_selling_price?: number;
}

export interface OrganizationUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'org_admin' | 'org_viewer';
  is_active: boolean;
  joined_at: string;
}

export interface OrganizationUserInvite {
  email: string;
  full_name: string;
  role?: 'org_admin' | 'org_viewer';
}

export interface BranchPerformanceMetrics {
  branch_id: number;
  branch_name: string;
  branch_subdomain: string;
  total_revenue: number;
  total_sales: number;
  total_profit: number;
  avg_sale_value: number;
  stock_value: number;
}

export interface OrganizationDashboardStats {
  total_revenue: number;
  total_sales: number;
  total_branches: number;
  total_products: number;
  total_stock_value: number;
  active_branches: number;
}

export interface OrganizationAnalyticsResponse {
  dashboard_stats: OrganizationDashboardStats;
  branch_metrics: BranchPerformanceMetrics[];
  revenue_by_date: RevenueByDate[];
  top_products_across_branches: TopSellingProduct[];
}

export interface ConvertToOrganizationRequest {
  organization_name: string;
  currency?: string;
  tax_rate?: number;
  timezone?: string;
  subscription_plan?: string;
  max_branches?: number;
}

export interface ConvertToOrganizationResponse {
  organization: Organization;
  branch: Branch;
  migrated_products: number;
  migrated_categories: number;
  message: string;
}

// Expense interfaces
export interface Expense {
  id: number;
  tenant_id: number;
  branch_id?: number | null;
  branch_name?: string | null;
  type: string;
  amount: number;
  description?: string;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreate {
  type: string;
  amount: number;
  description?: string;
  expense_date: string;
  branch_id?: number | null;
}

export interface ExpenseUpdate {
  type?: string;
  amount?: number;
  description?: string;
  expense_date?: string;
  branch_id?: number | null;
}

async function fetchAPI(endpoint: string, options: FetchOptions = {}) {
  const { token, ...fetchOptions } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Auth endpoints
  login: (username: string, password: string, subdomain?: string) =>
    fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, subdomain }),
    }),

  getMe: (token: string) =>
    fetchAPI('/auth/me', { token }),

  getMyTenants: (token: string) =>
    fetchAPI('/auth/my-tenants', { token }),

  switchTenant: (token: string, tenantId: number) =>
    fetchAPI('/auth/switch-tenant', {
      method: 'POST',
      token,
      body: JSON.stringify({ tenant_id: tenantId }),
    }),

  // Password Reset endpoints
  forgotPassword: (email: string) =>
    fetchAPI('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string, confirmPassword: string) =>
    fetchAPI('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    }),

  // Category endpoints
  getCategories: (token: string, activeOnly: boolean = true) =>
    fetchAPI(`/categories?active_only=${activeOnly}`, { token }),

  createCategory: (token: string, data: CategoryCreate) =>
    fetchAPI('/categories', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateCategory: (token: string, categoryId: number, data: CategoryUpdate) =>
    fetchAPI(`/categories/${categoryId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteCategory: (token: string, categoryId: number) =>
    fetchAPI(`/categories/${categoryId}`, {
      method: 'DELETE',
      token,
    }),

  // NOTE: migrateCategories endpoint removed - categories are now global

  // Unit endpoints
  getUnits: (token: string, activeOnly: boolean = true) =>
    fetchAPI(`/units?active_only=${activeOnly}`, { token }),

  createUnit: (token: string, data: UnitCreate) =>
    fetchAPI('/units', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateUnit: (token: string, unitId: number, data: UnitUpdate) =>
    fetchAPI(`/units/${unitId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteUnit: (token: string, unitId: number) =>
    fetchAPI(`/units/${unitId}`, {
      method: 'DELETE',
      token,
    }),

  // User Management endpoints
  getTenantUsers: (token: string) =>
    fetchAPI('/tenants/me/users', { token }),

  addUser: (token: string, data: UserAdd) =>
    fetchAPI('/tenants/me/users', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  inviteUser: (token: string, data: UserInvite) =>
    fetchAPI('/tenants/me/users/invite', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateUserInTenant: (token: string, userId: number, data: UserTenantUpdate) =>
    fetchAPI(`/tenants/me/users/${userId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  removeUserFromTenant: (token: string, userId: number) =>
    fetchAPI(`/tenants/me/users/${userId}`, {
      method: 'DELETE',
      token,
    }),

  checkUserCanDelete: (token: string, userId: number) =>
    fetchAPI(`/tenants/me/users/${userId}/can-delete`, { token }),

  resetUserPassword: (token: string, userId: number, newPassword: string) =>
    fetchAPI(`/tenants/me/users/${userId}/reset-password?new_password=${encodeURIComponent(newPassword)}`, {
      method: 'POST',
      token,
    }),

  // Product endpoints
  getProducts: (token: string, categoryId?: number, viewBranchId?: number) => {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', categoryId.toString());
    if (viewBranchId) params.append('view_branch_id', viewBranchId.toString());
    const queryString = params.toString();
    return fetchAPI(queryString ? `/products?${queryString}` : '/products', { token });
  },

  createProduct: (token: string, data: ProductCreate) =>
    fetchAPI('/products', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateProduct: (token: string, productId: number, data: ProductUpdate) =>
    fetchAPI(`/products/${productId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  getPriceHistory: (token: string, productId: number) =>
    fetchAPI(`/products/${productId}/price-history`, { token }),

  searchProductByBarcode: (token: string, barcode: string) =>
    fetchAPI(`/products/search-by-barcode?barcode=${encodeURIComponent(barcode)}`, { token }),

  // Stock endpoints
  createStockMovement: (token: string, data: StockMovementCreate) =>
    fetchAPI('/stock/movement', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getStockHistory: (token: string, productId?: number) =>
    fetchAPI(productId ? `/stock/history?product_id=${productId}` : '/stock/history', { token }),

  // Sales endpoints
  getSales: (token: string, days?: number) => {
    const params = days ? `?days=${days}` : '';
    return fetchAPI(`/sales${params}`, { token });
  },

  getSalesSummary: (token: string, days?: number) => {
    const params = days ? `?days=${days}` : '';
    return fetchAPI(`/sales/summary${params}`, { token });
  },

  createSale: (token: string, data: SaleCreate) =>
    fetchAPI('/sales', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // Receipt Management endpoints
  updateSaleCustomer: (token: string, saleId: number, data: { customer_name?: string; customer_email?: string; customer_phone?: string }) =>
    fetchAPI(`/sales/${saleId}/customer`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  sendEmailReceipt: (token: string, saleId: number) =>
    fetchAPI(`/sales/${saleId}/send-email`, {
      method: 'POST',
      token,
    }),

  markWhatsAppSent: (token: string, saleId: number) =>
    fetchAPI(`/sales/${saleId}/mark-whatsapp-sent`, {
      method: 'POST',
      token,
    }),

  // Customer Credit Module endpoints
  createCustomer: (token: string, data: CustomerCreate) =>
    fetchAPI('/customers', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCustomers: (token: string, search?: string, hasBalance?: boolean) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (hasBalance !== undefined) params.append('has_balance', String(hasBalance));
    const queryString = params.toString();
    return fetchAPI(`/customers${queryString ? `?${queryString}` : ''}`, { token });
  },

  getCustomer: (token: string, id: number) =>
    fetchAPI(`/customers/${id}`, { token }),

  updateCustomer: (token: string, id: number, data: CustomerUpdate) =>
    fetchAPI(`/customers/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  getCustomerCredit: (token: string, id: number) =>
    fetchAPI(`/customers/${id}/credit`, { token }),

  recordPayment: (token: string, customerId: number, data: PaymentCreate) =>
    fetchAPI(`/customers/${customerId}/payments`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCustomerPayments: (token: string, id: number) =>
    fetchAPI(`/customers/${id}/payments`, { token }),

  getReminderLogs: (token: string) =>
    fetchAPI('/credit/reminders', { token }),

  // Dashboard endpoints
  getDashboardStats: (token: string, branchId?: number | null) => {
    const params = new URLSearchParams();
    if (branchId !== undefined && branchId !== null) {
      params.append('branch_id', branchId.toString());
    }
    const queryString = params.toString();
    return fetchAPI(`/dashboard/stats${queryString ? `?${queryString}` : ''}`, { token });
  },

  getFinancialReport: (token: string, days: number = 30, branchId?: number | null) => {
    const params = new URLSearchParams({ days: days.toString() });
    if (branchId !== undefined && branchId !== null) {
      params.append('branch_id', branchId.toString());
    }
    return fetchAPI(`/reports/financial?${params.toString()}`, { token });
  },

  // Staff Performance Report endpoint (admin only)
  getStaffPerformance: (token: string, days: number = 30) =>
    fetchAPI(`/reports/staff-performance?days=${days}`, { token }),

  // Branch Performance endpoint (admin only)
  getBranchPerformance: (token: string, days: number = 30): Promise<BranchPerformanceMetrics[]> =>
    fetchAPI(`/dashboard/branch-performance?days=${days}`, { token }),

  // Price Variance Report endpoint
  getPriceVarianceReport: (token: string, days: number = 30): Promise<PriceVarianceReport> =>
    fetchAPI(`/reports/price-variance?days=${days}`, { token }),

  // Staff list endpoint (admin only)
  getStaffList: (token: string) =>
    fetchAPI('/staff/list', { token }),

  // Tenant endpoints
  getTenant: (token: string) =>
    fetchAPI('/tenants/me', { token }),

  updateTenant: (token: string, data: TenantUpdate) =>
    fetchAPI('/tenants/me', {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  registerTenant: (data: TenantCreate) =>
    fetchAPI('/tenants/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  checkSubdomainAvailability: (subdomain: string) =>
    fetchAPI(`/tenants/check-subdomain/${subdomain}`),

  uploadTenantLogo: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/tenants/me/logo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  deleteTenantLogo: (token: string) =>
    fetchAPI('/tenants/me/logo', {
      method: 'DELETE',
      token,
    }),

  deleteTenant: (token: string) =>
    fetchAPI('/tenants/me', {
      method: 'DELETE',
      token,
    }),

  // Product Image Operations
  uploadProductImage: async (token: string, productId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/products/${productId}/image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Image upload failed' }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  deleteProductImage: (token: string, productId: number) =>
    fetchAPI(`/products/${productId}/image`, {
      method: 'DELETE',
      token,
    }),

  // AI Classification endpoint
  classifyProduct: (token: string, data: AIClassifyRequest) =>
    fetchAPI('/ai/classify-product', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // ==================== ORGANIZATION ENDPOINTS ====================

  // Organization CRUD
  registerOrganization: (data: OrganizationCreate) =>
    fetchAPI('/organizations/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOrganization: (token: string) =>
    fetchAPI('/organizations/me', { token }),

  updateOrganization: (token: string, data: OrganizationUpdate) =>
    fetchAPI('/organizations/me', {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteOrganization: (token: string) =>
    fetchAPI('/organizations/me', {
      method: 'DELETE',
      token,
    }),

  // Organization Users
  getOrganizationUsers: (token: string) =>
    fetchAPI('/organizations/me/users', { token }),

  inviteOrganizationUser: (token: string, data: OrganizationUserInvite) =>
    fetchAPI('/organizations/me/users/invite', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  removeOrganizationUser: (token: string, userId: number) =>
    fetchAPI(`/organizations/me/users/${userId}`, {
      method: 'DELETE',
      token,
    }),

  // Branch Management (using tenant endpoints)
  getBranches: (token: string) =>
    fetchAPI('/tenants/me/branches', { token }),

  createBranch: (token: string, data: BranchCreate) =>
    fetchAPI('/tenants/me/branches', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateBranch: (token: string, branchId: number, data: BranchUpdate) =>
    fetchAPI(`/tenants/me/branches/${branchId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteBranch: (token: string, branchId: number) =>
    fetchAPI(`/tenants/me/branches/${branchId}`, {
      method: 'DELETE',
      token,
    }),

  checkBranchCanDelete: (token: string, branchId: number) =>
    fetchAPI(`/tenants/me/branches/${branchId}/can-delete`, { token }),

  // Organization Products (Shared Catalog)
  getOrgProducts: (token: string, categoryId?: number) =>
    fetchAPI(
      categoryId
        ? `/organizations/me/products?category_id=${categoryId}`
        : '/organizations/me/products',
      { token }
    ),

  createOrgProduct: (token: string, data: OrganizationProductCreate) =>
    fetchAPI('/organizations/me/products', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateOrgProduct: (token: string, productId: number, data: OrganizationProductUpdate) =>
    fetchAPI(`/organizations/me/products/${productId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteOrgProduct: (token: string, productId: number) =>
    fetchAPI(`/organizations/me/products/${productId}`, {
      method: 'DELETE',
      token,
    }),

  // Organization Categories
  getOrgCategories: (token: string, activeOnly: boolean = true) =>
    fetchAPI(`/organizations/me/categories?active_only=${activeOnly}`, { token }),

  createOrgCategory: (token: string, data: OrganizationCategoryCreate) =>
    fetchAPI('/organizations/me/categories', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateOrgCategory: (token: string, categoryId: number, data: OrganizationCategoryUpdate) =>
    fetchAPI(`/organizations/me/categories/${categoryId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteOrgCategory: (token: string, categoryId: number) =>
    fetchAPI(`/organizations/me/categories/${categoryId}`, {
      method: 'DELETE',
      token,
    }),

  // Branch Stock Management (Organization routes)
  getBranchStock: (token: string, branchId: number) =>
    fetchAPI(`/organizations/me/branches/${branchId}/stock`, { token }),

  updateBranchStock: (token: string, branchId: number, productId: number, data: BranchStockUpdate) =>
    fetchAPI(`/organizations/me/branches/${branchId}/stock/${productId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  // Branch Stock Management (Direct routes - NEW)
  getBranchStockDirect: (token: string, branchId: number) =>
    fetchAPI(`/branches/${branchId}/stock`, { token }),

  updateBranchStockDirect: (token: string, branchId: number, productId: number, quantity?: number, overrideSellingPrice?: number) =>
    fetchAPI(`/branches/${branchId}/stock/${productId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ quantity, override_selling_price: overrideSellingPrice }),
    }),

  // Organization Analytics
  getOrganizationAnalytics: (token: string, days: number = 30) =>
    fetchAPI(`/organizations/me/analytics/dashboard?days=${days}`, { token }),

  // Tenant Conversion
  convertToOrganization: (token: string, data: ConvertToOrganizationRequest) =>
    fetchAPI('/tenants/me/convert-to-organization', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // ==================== SUBSCRIPTION ENDPOINTS ====================

  // Get subscription status (with cache busting)
  getSubscriptionStatus: (token: string) =>
    fetchAPI(`/api/subscription/status?_=${Date.now()}`, { token }),

  // Get all available plans
  getSubscriptionPlans: (token: string) =>
    fetchAPI('/api/subscription/plans', { token }),

  // Calculate price with branch discounts
  calculateSubscriptionPrice: (token: string, billingCycle: string) =>
    fetchAPI(`/api/subscription/calculate-price/${billingCycle}`, { token }),

  // Get available branches for subscription selection
  getAvailableBranches: (token: string) =>
    fetchAPI('/api/subscription/available-branches', { token }),

  // Initialize payment with branch selection
  initializeSubscription: (token: string, billingCycle: string, selectedBranchIds: number[]) =>
    fetchAPI('/api/subscription/initialize', {
      method: 'POST',
      token,
      body: JSON.stringify({
        billing_cycle: billingCycle,
        selected_branch_ids: selectedBranchIds
      }),
    }),

  // Verify payment
  verifySubscription: (token: string, reference: string) =>
    fetchAPI(`/api/subscription/verify/${reference}`, { token }),

  // Add branch to existing subscription (pro-rata payment)
  addBranchToSubscription: (token: string, branchId: number) =>
    fetchAPI('/api/subscription/add-branch', {
      method: 'POST',
      token,
      body: JSON.stringify({ branch_id: branchId }),
    }),

  // Get payment history
  getSubscriptionHistory: (token: string) =>
    fetchAPI('/api/subscription/history', { token }),

  // Cancel subscription
  cancelSubscription: (token: string) =>
    fetchAPI('/api/subscription/cancel', {
      method: 'POST',
      token,
    }),

  // Reactivate cancelled subscription
  reactivateSubscription: (token: string) =>
    fetchAPI('/api/subscription/reactivate', {
      method: 'POST',
      token,
    }),

  // Cancel branch subscription
  cancelBranchSubscription: (branchTenantId: number, token: string) =>
    fetchAPI(`/api/subscription/cancel-branch/${branchTenantId}`, {
      method: 'POST',
      token,
    }),

  // Reactivate branch subscription
  reactivateBranchSubscription: (branchTenantId: number, token: string) =>
    fetchAPI(`/api/subscription/reactivate-branch/${branchTenantId}`, {
      method: 'POST',
      token,
    }),

  // Preview upgrade to longer billing cycle
  previewUpgrade: (token: string, newBillingCycle: string) =>
    fetchAPI(`/api/subscription/upgrade-preview/${newBillingCycle}`, { token }),

  // Upgrade subscription to longer billing cycle
  upgradeSubscription: (token: string, newBillingCycle: string) =>
    fetchAPI('/api/subscription/upgrade', {
      method: 'POST',
      token,
      body: JSON.stringify({ new_billing_cycle: newBillingCycle }),
    }),

  // ==================== SUPER ADMIN SUBSCRIPTION MANAGEMENT ====================

  // Extend tenant subscription by X days
  extendTenantSubscription: (token: string, tenantId: number, days: number) =>
    fetchAPI(`/api/platform/tenants/${tenantId}/extend-subscription?days=${days}`, {
      method: 'POST',
      token,
    }),

  // Update tenant subscription status
  updateTenantSubscription: (
    token: string,
    tenantId: number,
    subscriptionStatus?: string,
    nextBillingDate?: string
  ) =>
    fetchAPI(`/api/platform/tenants/${tenantId}/subscription`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({
        subscription_status: subscriptionStatus,
        next_billing_date: nextBillingDate,
      }),
    }),

  // ==================== SUPER ADMIN GLOBAL CATEGORIES ====================

  // Get all global categories (super admin)
  getGlobalCategories: (token: string, activeOnly: boolean = false) =>
    fetchAPI(`/api/platform/categories?active_only=${activeOnly}`, { token }),

  // Create global category (super admin)
  createGlobalCategory: (token: string, data: CategoryCreate) =>
    fetchAPI('/api/platform/categories', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // Update global category (super admin)
  updateGlobalCategory: (token: string, categoryId: number, data: CategoryUpdate) =>
    fetchAPI(`/api/platform/categories/${categoryId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  // Delete global category (super admin)
  deleteGlobalCategory: (token: string, categoryId: number) =>
    fetchAPI(`/api/platform/categories/${categoryId}`, {
      method: 'DELETE',
      token,
    }),

  // ==================== SUPER ADMIN GLOBAL UNITS ====================

  // Get all global units (super admin)
  getGlobalUnits: (token: string, activeOnly: boolean = false) =>
    fetchAPI(`/api/platform/units?active_only=${activeOnly}`, { token }),

  // Create global unit (super admin)
  createGlobalUnit: (token: string, data: UnitCreate) =>
    fetchAPI('/api/platform/units', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  // Update global unit (super admin)
  updateGlobalUnit: (token: string, unitId: number, data: UnitUpdate) =>
    fetchAPI(`/api/platform/units/${unitId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  // Delete global unit (super admin)
  deleteGlobalUnit: (token: string, unitId: number) =>
    fetchAPI(`/api/platform/units/${unitId}`, {
      method: 'DELETE',
      token,
    }),

  // ==================== SUPER ADMIN UNSUBSCRIBED TENANTS ====================

  // Get all unsubscribed tenants
  getUnsubscribedTenants: (token: string) =>
    fetchAPI('/api/platform/tenants/unsubscribed', { token }),

  // Block a tenant
  blockTenant: (token: string, tenantId: number, reason?: string) =>
    fetchAPI(`/api/platform/tenants/${tenantId}/block`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    }),

  // Unblock a tenant
  unblockTenant: (token: string, tenantId: number) =>
    fetchAPI(`/api/platform/tenants/${tenantId}/unblock`, {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    }),

  // ==================== EXPENSE ENDPOINTS ====================

  createExpense: (token: string, data: ExpenseCreate) =>
    fetchAPI('/expenses', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getExpenses: (token: string, days: number = 30, branchId?: number | null) => {
    const params = new URLSearchParams({ days: days.toString() });
    if (branchId !== undefined && branchId !== null) {
      params.append('branch_id', branchId.toString());
    }
    return fetchAPI(`/expenses?${params.toString()}`, { token });
  },

  updateExpense: (token: string, expenseId: number, data: ExpenseUpdate) =>
    fetchAPI(`/expenses/${expenseId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteExpense: (token: string, expenseId: number) =>
    fetchAPI(`/expenses/${expenseId}`, {
      method: 'DELETE',
      token,
    }),

  getExpenseTypes: (token: string, prefix?: string) => {
    const params = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
    return fetchAPI(`/expenses/types${params}`, { token });
  },
};
