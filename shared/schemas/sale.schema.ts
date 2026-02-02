import { z } from "zod";

export const SaleSchema = z.object({
  id: z.string(),
  total: z.number(),
  createdAt: z.string(),
  synced: z.boolean()
});

export type Sale = z.infer<typeof SaleSchema>;
