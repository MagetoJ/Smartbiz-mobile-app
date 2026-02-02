import { z } from 'zod';

export const CategorySchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Name is required"),
  display_order: z.number().default(0),
  icon: z.string().optional(),
  color: z.string().optional(),
  is_active: z.boolean().default(true),
  target_margin: z.number().nullable().optional(),
  minimum_margin: z.number().nullable().optional(),
});

export const UnitSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Name is required"),
  display_order: z.number().default(0),
  is_active: z.boolean().default(true),
});

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  full_name: z.string(),
  role: z.enum(['admin', 'staff']),
  branch_id: z.number().optional(),
});
