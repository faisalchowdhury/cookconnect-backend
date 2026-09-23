import mongoose, { Schema } from 'mongoose';

export const OTP_PURPOSES = ['verify-email', 'reset-password'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export interface IOtpToken {
  email: string;
  codeHash: string;
  purpose: OtpPurpose;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOtpTokenDocument extends IOtpToken, mongoose.Document {}

const otpSchema = new Schema<IOtpTokenDocument>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'otpTokens' },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpToken = mongoose.model('OtpToken', otpSchema) as any;
