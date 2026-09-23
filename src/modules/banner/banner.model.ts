import mongoose, { Schema } from 'mongoose';
import { localizedStringSchema, optionalLocalizedStringSchema } from '@/shared/localizedString';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';
import { BANNER_PLACEMENTS } from './banner.constant';
import { IBannerDocument } from './banner.interface';

const bannerSchema = new Schema<IBannerDocument>(
  {
    placement: { type: String, enum: BANNER_PLACEMENTS, required: true, index: true },
    title: { type: localizedStringSchema, required: true },
    subtitle: { type: optionalLocalizedStringSchema, default: () => ({ fr: '' }) },
    cta: { type: optionalLocalizedStringSchema, default: () => ({ fr: '' }) },
    href: { type: String, required: true, trim: true },
    imageId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    theme: { type: String, default: '', trim: true },
    order: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'banners' },
);

bannerSchema.index({ placement: 1, active: 1, order: 1 });

bannerSchema.plugin(toJSONPlugin);
bannerSchema.plugin(softDeletePlugin);

export const Banner = mongoose.model('Banner', bannerSchema) as any;
