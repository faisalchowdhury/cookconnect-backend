import { z } from 'zod';
import { CONTRACT_TYPES, EXPERIENCE_LEVELS, JOB_STATUSES } from './job.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

const jobBodySchema = z.object({
  title: localizedStringSchema,
  description: localizedStringSchema,
  sectorId: z.string().trim().min(1),
  positionId: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().optional(),
  contractType: z.enum(CONTRACT_TYPES),
  salaryMin: z.number().int().nonnegative().nullable().optional(),
  salaryMax: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().optional(),
  experience: z.enum(EXPERIENCE_LEVELS),
  requirements: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
});

export const createJobSchema = jobBodySchema.extend({
  asDraft: z.boolean().optional(),
});

export const updateJobSchema = jobBodySchema.partial().extend({
  submit: z.boolean().optional(),
});

export const jobIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid job id'),
});

export const jobSearchQuerySchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  sectorId: z.string().optional(),
  positionId: z.string().optional(),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  establishmentType: z.string().optional(),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  searchAll: z.coerce.boolean().optional(),
});

export const reportJobSchema = z.object({
  reason: z.string().trim().min(3, 'Reason is required').max(1000),
});

export const featuredJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const adminJobListQuerySchema = z.object({
  employerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const adminDecisionSchema = z.object({
  status: z.enum(['active', 'rejected', 'closed']),
  rejectionReason: z.string().trim().optional(),
});

export const adminUpdateJobSchema = z.object({
  title: localizedStringSchema.optional(),
  description: localizedStringSchema.optional(),
  salaryMin: z.number().int().nonnegative().nullable().optional(),
  salaryMax: z.number().int().nonnegative().nullable().optional(),
  city: z.string().trim().optional(),
  requirements: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
});

export const adminExtendSchema = z.object({
  extendedUntil: z.coerce.date(),
});

export type CreateJobBody = z.infer<typeof createJobSchema>;
export type UpdateJobBody = z.infer<typeof updateJobSchema>;
