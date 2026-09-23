import { z } from 'zod';
import {
  AVAILABILITY_OPTIONS,
  CONTRACT_TYPES,
  EXPERIENCE_LEVELS,
} from './candidate.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

const trainingSchema = z.object({
  school: z.string().trim().min(1),
  diploma: z.string().trim().min(1),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

const historySchema = z.object({
  establishment: z.string().trim().min(1),
  positionId: z.string().trim().min(1),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export const updateCandidateSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  sectorId: z.string().trim().optional(),
  positionId: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  availability: z.enum(AVAILABILITY_OPTIONS).optional(),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  expectedSalary: z.number().int().nonnegative().nullable().optional(),
  phone: z.string().trim().optional(),
  about: localizedStringSchema.partial().optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  training: z.array(trainingSchema).optional(),
  history: z.array(historySchema).optional(),
});

export const candidateSearchQuerySchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  sectorId: z.string().optional(),
  positionId: z.string().optional(),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  availability: z.enum(AVAILABILITY_OPTIONS).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const candidateIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid candidate id'),
});

export const dishPhotoAssetParamSchema = z.object({
  assetId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid asset id'),
});
