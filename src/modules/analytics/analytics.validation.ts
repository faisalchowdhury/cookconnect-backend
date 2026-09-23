import { z } from 'zod';

export const growthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  metric: z.enum(['cooks', 'restaurants']).optional(),
});

export const statisticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});
