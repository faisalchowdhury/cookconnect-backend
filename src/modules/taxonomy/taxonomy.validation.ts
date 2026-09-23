import { z } from 'zod';

export const positionsBySectorQuerySchema = z.object({
  sectorId: z.string().trim().optional(),
});
