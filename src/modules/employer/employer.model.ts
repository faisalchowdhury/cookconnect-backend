import mongoose, { Schema } from 'mongoose';
import { EMPLOYER_STATUSES, EMPLOYER_TYPES } from './employer.constant';
import { IEmployerProfileDocument } from './employer.interface';
import { optionalLocalizedStringSchema } from '@/shared/localizedString';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';

const socialsSchema = new Schema(
  {
    instagram: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  { _id: false },
);

const employerProfileSchema = new Schema<IEmployerProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, default: '', trim: true },
    type: { type: String, enum: [...EMPLOYER_TYPES, ''], default: '' },
    city: { type: String, default: '', trim: true, index: true },
    address: { type: String, default: '', trim: true },
    logoId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    coverId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    about: { type: optionalLocalizedStringSchema, default: () => ({ fr: '' }) },
    phone: { type: String, default: '', trim: true },
    phonePublic: { type: Boolean, default: false },
    socials: { type: socialsSchema, default: () => ({}) },
    since: { type: String, default: '' },
    staffCount: { type: String, default: '' },
    status: { type: String, enum: EMPLOYER_STATUSES, default: 'pending', index: true },
    verified: { type: Boolean, default: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true, collection: 'employerProfiles' },
);

employerProfileSchema.index({ status: 1, createdAt: -1 });
employerProfileSchema.index({ city: 1, type: 1 });
employerProfileSchema.index({ createdAt: -1 });

employerProfileSchema.plugin(toJSONPlugin);
employerProfileSchema.plugin(softDeletePlugin);

export const EmployerProfile = mongoose.model('EmployerProfile', employerProfileSchema) as any;
