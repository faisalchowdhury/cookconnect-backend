import { z } from 'zod';

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  read: z.enum(['true', 'false']).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid notification id'),
});
