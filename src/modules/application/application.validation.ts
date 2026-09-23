import { z } from 'zod';
import { APPLICATION_STATUSES } from './application.constant';

export const createApplicationSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid job id'),
  coverNote: z.string().trim().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const applicationIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid application id'),
});

export const receivedApplicationsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
});
