import { z } from 'zod';
import { ALL_ADMIN_PERMISSIONS } from '@/modules/user/user.constant';
import { isPasswordValid } from '@/utils/crypto';

export const createAdminSchema = z.object({
  email: z.string().trim().email(),
  // Admin accounts get at least the password rules every other account has.
  password: z.string().refine(isPasswordValid, {
    message:
      'Password must be at least 8 characters and include uppercase, lowercase, number, and special character',
  }),
  permissions: z.array(z.enum(ALL_ADMIN_PERMISSIONS)).default([]),
});

export const updateAdminPermissionsSchema = z
  .object({
    permissions: z.array(z.enum(ALL_ADMIN_PERMISSIONS)).optional(),
    status: z.enum(['active']).optional(),
  })
  .refine((body) => body.permissions !== undefined || body.status !== undefined, {
    message: 'Either permissions or status must be provided',
  });

export const adminIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid admin id'),
});

export const adminCandidateListQuerySchema = z.object({
  verified: z.enum(['true', 'false']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  sectorId: z.string().optional(),
  sector: z.string().optional(),
  positionId: z.string().optional(),
  position: z.string().optional(),
  city: z.string().optional(),
  experience: z.string().optional(),
  availability: z.string().optional(),
  minCompletion: z.coerce.number().int().min(0).max(100).optional(),
});

export const adminCandidateFindQuerySchema = z.object({
  revealContact: z.enum(['true', 'false']).optional(),
});

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

export const adminUpdateCandidateSchema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    city: z.string().trim().optional(),
    sectorId: z.string().trim().optional(),
    positionId: z.string().trim().optional(),
    experience: z.string().optional(),
    availability: z.string().optional(),
    contractType: z.string().optional(),
    expectedSalary: z.number().nullable().optional(),
    about: localizedStringSchema.optional(),
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
  })
  .strict();

export const addCandidateSkillSchema = z.object({
  skillId: z.string().trim().min(1),
});

export const candidateSkillParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid candidate id'),
  skillId: z.string().trim().min(1),
});

export const candidateIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid candidate id'),
});

export const setVerificationSchema = z.object({
  verified: z.boolean(),
});

export const setCandidateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'deleted']),
});

export const adminEmployerListQuerySchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const employerDecisionSchema = z.object({
  status: z.enum(['active', 'rejected']),
  rejectionReason: z.string().trim().optional(),
});

export const employerBlockSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().optional(),
});

export const moderationPhotosQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const moderationDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().trim().optional(),
});

export const mediaIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid media id'),
});

export const activityListQuerySchema = z.object({
  type: z.enum(['all', 'admin', 'admin-action', 'contact-access', 'photo']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const adminMediaUploadSchema = z.object({
  kind: z.enum(['homepage', 'banner']).default('homepage'),
});

export const adminOutboxQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});
