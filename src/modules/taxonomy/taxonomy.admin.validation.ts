import { z } from 'zod';
import { TAXONOMY_TYPES } from './taxonomy.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

export const createTaxonomySchema = z.object({
  type: z.enum(TAXONOMY_TYPES),
  key: z.string().trim().min(1),
  label: localizedStringSchema,
  parentKey: z.string().trim().nullable().optional(),
  group: z.string().trim().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const updateTaxonomySchema = z.object({
  label: localizedStringSchema.optional(),
  parentKey: z.string().trim().nullable().optional(),
  group: z.string().trim().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const taxonomyKeyParamsSchema = z.object({
  type: z.enum(TAXONOMY_TYPES),
  key: z.string().trim().min(1),
});
