import { z } from 'zod';
import { SITE_SETTINGS_MODES } from './siteSettings.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

export const updateSiteSettingsSchema = z.object({
  mode: z.enum(SITE_SETTINGS_MODES).optional(),
  imageId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  headline: localizedStringSchema.optional(),
  subheadline: localizedStringSchema.optional(),
  cta: localizedStringSchema.optional(),
});
