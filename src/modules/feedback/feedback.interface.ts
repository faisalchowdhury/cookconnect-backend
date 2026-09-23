import { Document, Types } from 'mongoose';
import { FeedbackRole, FeedbackStatus } from './feedback.constant';

export interface IFeedbackMessage {
  authorUserId: Types.ObjectId;
  body: string;
  at: Date;
  role: 'user' | 'admin';
}

export interface IFeedback {
  userId: Types.ObjectId;
  role: FeedbackRole;
  rating: number;
  message: string;
  messages: IFeedbackMessage[];
  status: FeedbackStatus;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFeedbackDocument extends IFeedback, Document {
  id: string;
  softDelete(): Promise<IFeedbackDocument>;
}

export type CreateFeedbackInput = {
  userId: string;
  role: FeedbackRole;
  rating: number;
  message: string;
};

export type ReplyFeedbackInput = {
  adminUserId: string;
  body: string;
};

export type AdminFeedbackListQuery = {
  status?: FeedbackStatus;
  role?: string;
  q?: string;
  page?: number;
  limit?: number;
};
