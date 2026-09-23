import mongoose, { Schema } from 'mongoose';
import { MEDIA_KINDS, MODERATION_STATUSES } from '@/modules/media/media.constant';
import { IMediaAssetDocument } from '@/modules/media/media.interface';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';

const mediaAssetSchema = new Schema<IMediaAssetDocument>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: MEDIA_KINDS, required: true },
    storageKey: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'pending', index: true },
    moderationReason: { type: String, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'mediaAssets' },
);

mediaAssetSchema.index({ moderationStatus: 1, createdAt: -1 });
mediaAssetSchema.index({ ownerUserId: 1, kind: 1 });

mediaAssetSchema.plugin(toJSONPlugin);
mediaAssetSchema.plugin(softDeletePlugin);

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema) as any;
