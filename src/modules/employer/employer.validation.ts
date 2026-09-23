import { z } from 'zod';
import { EMPLOYER_TYPES } from './employer.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

const socialsSchema = z.object({
  instagram: z.string().trim().optional(),
  linkedin: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

export const updateEmployerSchema = z.object({
  name: z.string().trim().optional(),
  type: z.enum(EMPLOYER_TYPES).optional(),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  about: localizedStringSchema.partial().optional(),
  phone: z.string().trim().optional(),
  phonePublic: z.boolean().optional(),
  socials: socialsSchema.optional(),
  since: z.string().trim().optional(),
  staffCount: z.string().trim().optional(),
});

export const employerIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid employer id'),
});
