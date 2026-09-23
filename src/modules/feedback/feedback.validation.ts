import { z } from 'zod';
import { FEEDBACK_ROLES, FEEDBACK_STATUSES } from './feedback.constant';

export const createFeedbackSchema = z.object({
  // Accepted for older clients but ignored: the author's account decides the role.
  role: z.enum(FEEDBACK_ROLES).optional(),
  rating: z.number().int().min(1).max(5),
  message: z.string().trim().min(1).max(5000),
});

export const replyFeedbackSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const feedbackIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid feedback id'),
});

export const adminFeedbackListQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  role: z.enum(FEEDBACK_ROLES).or(z.literal('all')).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
