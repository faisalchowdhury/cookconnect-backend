import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';
import { NotificationType } from './notification.constant';

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: LocalizedString;
  body: LocalizedString;
  data: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  emailSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDocument extends INotification, Document {
  id: string;
}

export type CreateNotificationInput = {
  userId: Types.ObjectId | string;
  type: NotificationType;
  title: LocalizedString | { fr: string; ar?: string; en?: string };
  body: LocalizedString | { fr: string; ar?: string; en?: string };
  data?: Record<string, unknown>;
};

export type NotificationListQuery = {
  page?: number;
  limit?: number;
  read?: 'true' | 'false';
};
