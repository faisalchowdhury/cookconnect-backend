import { z } from 'zod';

export const createProfileBookmarkSchema = z.object({
  targetId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid profile id'),
  note: z.string().trim().max(500).optional(),
});

export const createJobBookmarkSchema = z.object({
  targetId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid job id'),
  note: z.string().trim().max(500).optional(),
});

export const deleteBookmarkQuerySchema = z.object({
  targetId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid target id'),
});
