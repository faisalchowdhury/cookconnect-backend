import mongoose, { Document, Schema, Types } from 'mongoose';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

export interface IProfileView {
  profileId: Types.ObjectId;
  viewerUserId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProfileViewDocument extends IProfileView, Document {
  id: string;
}

const profileViewSchema = new Schema<IProfileViewDocument>(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'CandidateProfile', required: true, index: true },
    viewerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'profileViews' },
);

profileViewSchema.index({ profileId: 1, viewerUserId: 1, createdAt: -1 });

profileViewSchema.plugin(toJSONPlugin);

export const ProfileView = mongoose.model<IProfileViewDocument>(
  'ProfileView',
  profileViewSchema,
);
