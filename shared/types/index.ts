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

export interface Unit {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
}

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
  branch_id?: number;
  branch_name?: string;
}
