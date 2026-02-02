import { z } from "zod";

export const ProductSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().min(0),
  category_id: z.number().optional(),
  is_active: z.boolean().default(true)
});

export type Product = z.infer<typeof ProductSchema>;
