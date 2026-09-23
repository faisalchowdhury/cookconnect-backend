import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  MODERATION_REPORT_STATUSES,
  MODERATION_REPORT_TARGET_TYPES,
} from '@/modules/media/media.constant';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

export interface IModerationReport {
  targetType: (typeof MODERATION_REPORT_TARGET_TYPES)[number];
  targetId: Types.ObjectId;
  reporterUserId?: Types.ObjectId | null;
  reason: string;
  status: (typeof MODERATION_REPORT_STATUSES)[number];
  createdAt: Date;
  updatedAt: Date;
}

export interface IModerationReportDocument extends IModerationReport, Document {
  id: string;
}

const moderationReportSchema = new Schema<IModerationReportDocument>(
  {
    targetType: { type: String, enum: MODERATION_REPORT_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reporterUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: MODERATION_REPORT_STATUSES, default: 'open' },
  },
  { timestamps: true, collection: 'moderationReports' },
);

moderationReportSchema.index({ targetType: 1, targetId: 1, status: 1 });

moderationReportSchema.plugin(toJSONPlugin);

export const ModerationReport = mongoose.model<IModerationReportDocument>(
  'ModerationReport',
  moderationReportSchema,
);
