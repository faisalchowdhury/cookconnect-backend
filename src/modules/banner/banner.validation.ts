import { z } from 'zod';
import { BANNER_PLACEMENTS } from './banner.constant';

const localizedStringSchema = z.object({
  fr: z.string().trim().min(1, 'French text is required'),
  ar: z.string().trim().optional(),
  en: z.string().trim().optional(),
});

export const publicBannerQuerySchema = z.object({
  placement: z.enum(BANNER_PLACEMENTS).optional(),
});

export const bannerIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid banner id'),
});

// Rendered as a link on the public site, so javascript: and other schemes are refused.
const linkSchema = z
  .string()
  .trim()
  .regex(/^(https?:\/\/\S+|\/(?!\/)\S*)$/i, 'Link must be an http(s) URL or a site path starting with /');

const bannerFields = z.object({
  placement: z.enum(BANNER_PLACEMENTS),
  title: localizedStringSchema,
  subtitle: localizedStringSchema.optional(),
  cta: localizedStringSchema.optional(),
  href: linkSchema,
  imageId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  theme: z.string().trim().optional(),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

const endsAfterStart = (banner: { startsAt?: Date | null; endsAt?: Date | null }) =>
  !banner.startsAt || !banner.endsAt || banner.endsAt >= banner.startsAt;
const scheduleIssue = { message: 'endsAt must not be before startsAt', path: ['endsAt'] };

export const createBannerSchema = bannerFields.refine(endsAfterStart, scheduleIssue);

export const updateBannerSchema = bannerFields.partial().refine(endsAfterStart, scheduleIssue);

export const adminBannerListQuerySchema = z.object({
  placement: z.enum(BANNER_PLACEMENTS).optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
