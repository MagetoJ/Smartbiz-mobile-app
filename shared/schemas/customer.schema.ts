import { z } from "zod";

export const CustomerSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export type Customer = z.infer<typeof CustomerSchema>;
