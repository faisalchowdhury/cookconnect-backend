import mongoose, { Schema } from 'mongoose';
import { localizedStringSchema } from '@/shared/localizedString';
import { toJSONPlugin } from '@/shared/mongoosePlugins';
import { DEFAULT_SITE_SETTINGS, SITE_SETTINGS_MODES } from './siteSettings.constant';
import { ISiteSettingsDocument } from './siteSettings.interface';

const siteSettingsSchema = new Schema(
  {
    _id: { type: String, default: 'default' },
    mode: { type: String, enum: SITE_SETTINGS_MODES, default: DEFAULT_SITE_SETTINGS.mode },
    imageId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    headline: { type: localizedStringSchema, default: () => DEFAULT_SITE_SETTINGS.headline },
    subheadline: {
      type: localizedStringSchema,
      default: () => DEFAULT_SITE_SETTINGS.subheadline,
    },
    cta: { type: localizedStringSchema, default: () => DEFAULT_SITE_SETTINGS.cta },
  },
  { timestamps: true, collection: 'siteSettings' },
);

siteSettingsSchema.plugin(toJSONPlugin);

export const SiteSettings = mongoose.model<ISiteSettingsDocument>(
  'SiteSettings',
  siteSettingsSchema,
);
