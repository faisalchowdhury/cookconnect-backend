import mongoose, { Schema } from 'mongoose';
import { localizedStringSchema } from '@/shared/localizedString';
import { toJSONPlugin } from '@/shared/mongoosePlugins';
import { NOTIFICATION_TYPES } from './notification.constant';
import { INotificationDocument } from './notification.interface';

const notificationSchema = new Schema<INotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: localizedStringSchema, required: true },
    body: { type: localizedStringSchema, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

notificationSchema.plugin(toJSONPlugin);

export const Notification = mongoose.model<INotificationDocument>(
  'Notification',
  notificationSchema,
);
