import mongoose, { Schema, Types } from 'mongoose';

export interface ISession {
  userId: Types.ObjectId;
  tokenHash: string;
  familyId: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISessionDocument extends ISession, mongoose.Document {}

const sessionSchema = new Schema<ISessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'sessions' },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema) as any;
