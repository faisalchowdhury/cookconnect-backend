import mongoose, { Schema } from 'mongoose';
import {
  ADMIN_LEVELS,
  AUTH_PROVIDERS,
  LOCALES,
  USER_ROLES,
  USER_STATUSES,
} from './user.constant';
import { IUserDocument } from './user.interface';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    status: { type: String, enum: USER_STATUSES, default: 'pending' },
    emailVerified: { type: Boolean, default: false },
    phone: { type: String, trim: true },
    locale: { type: String, enum: LOCALES, default: 'fr' },
    authProvider: { type: String, enum: AUTH_PROVIDERS, default: 'local' },
    providerId: { type: String },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date },
    adminLevel: { type: String, enum: [...ADMIN_LEVELS, null], default: null },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ authProvider: 1, providerId: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });

userSchema.plugin(toJSONPlugin);
userSchema.plugin(softDeletePlugin);

export const User = mongoose.model('User', userSchema) as any;
