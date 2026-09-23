import mongoose, { Schema } from 'mongoose';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';
import { IPartnerDocument } from './partner.interface';

const partnerSchema = new Schema<IPartnerDocument>(
  {
    name: { type: String, required: true, trim: true },
    logoId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    href: { type: String, required: true, trim: true },
    order: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'partners' },
);

partnerSchema.index({ active: 1, order: 1 });

partnerSchema.plugin(toJSONPlugin);
partnerSchema.plugin(softDeletePlugin);

export const Partner = mongoose.model('Partner', partnerSchema) as any;
