import mongoose, { Schema } from 'mongoose';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';
import { FEEDBACK_ROLES, FEEDBACK_STATUSES } from './feedback.constant';
import { IFeedbackDocument } from './feedback.interface';

const feedbackMessageSchema = new Schema(
  {
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
    role: { type: String, enum: ['user', 'admin'], required: true },
  },
  { _id: false },
);

const feedbackSchema = new Schema<IFeedbackDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: FEEDBACK_ROLES, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    message: { type: String, required: true, trim: true },
    messages: { type: [feedbackMessageSchema], default: [] },
    status: { type: String, enum: FEEDBACK_STATUSES, default: 'new', index: true },
  },
  { timestamps: true, collection: 'feedback' },
);

feedbackSchema.index({ status: 1, createdAt: -1 });

feedbackSchema.plugin(toJSONPlugin);
feedbackSchema.plugin(softDeletePlugin);

export const Feedback = mongoose.model('Feedback', feedbackSchema) as any;
