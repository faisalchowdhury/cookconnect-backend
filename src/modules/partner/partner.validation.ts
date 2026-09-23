import { z } from 'zod';

export const createPartnerSchema = z.object({
  name: z.string().trim().min(1),
  logoId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  // Rendered as a link on the public site, so javascript: and other schemes are refused.
  href: z
    .string()
    .trim()
    .regex(/^(https?:\/\/\S+|\/(?!\/)\S*)$/i, 'Link must be an http(s) URL or a site path starting with /'),
  order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const updatePartnerSchema = createPartnerSchema.partial();

export const partnerIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid partner id'),
});

export const adminPartnerListQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
