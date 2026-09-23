import mongoose, { Schema } from 'mongoose';
import { IActivityLogDocument } from './activityLog.interface';
import { localizedStringSchema } from '@/shared/localizedString';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

const activityLogSchema = new Schema<IActivityLogDocument>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorLabel: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    detail: { type: localizedStringSchema, required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true, collection: 'activityLogs' },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ actorUserId: 1, createdAt: -1 });

activityLogSchema.plugin(toJSONPlugin);

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema) as any;
