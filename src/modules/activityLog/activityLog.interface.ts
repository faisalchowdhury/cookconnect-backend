import { Document, Types } from 'mongoose';
import { LocalizedString } from '@/shared/localizedString';

export interface IActivityLog {
  actorUserId: Types.ObjectId | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: Types.ObjectId;
  detail: LocalizedString;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivityLogDocument extends IActivityLog, Document {
  id: string;
}

export type LogActivityInput = {
  actorUserId?: Types.ObjectId | string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: Types.ObjectId | string;
  detail: LocalizedString;
  ip?: string;
  userAgent?: string;
};
