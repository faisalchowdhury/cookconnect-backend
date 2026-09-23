import mongoose, { Schema } from 'mongoose';
import {
  CONTRACT_TYPES,
  DEFAULT_CURRENCY,
  EXPERIENCE_LEVELS,
  JOB_STATUSES,
} from './job.constant';
import { IJobDocument } from './job.interface';
import { localizedStringSchema } from '@/shared/localizedString';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';

const jobSchema = new Schema<IJobDocument>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true, index: true },
    title: { type: localizedStringSchema, required: true },
    description: { type: localizedStringSchema, required: true },
    sectorId: { type: String, required: true },
    positionId: { type: String, required: true },
    city: { type: String, required: true, index: true },
    country: { type: String, required: true, default: 'MA' },
    contractType: { type: String, enum: CONTRACT_TYPES, required: true },
    salaryMin: { type: Number, default: null },
    salaryMax: { type: Number, default: null },
    currency: { type: String, default: DEFAULT_CURRENCY },
    experience: { type: String, enum: EXPERIENCE_LEVELS, required: true },
    requirements: { type: [String], default: [] },
    benefits: { type: [String], default: [] },
    status: { type: String, enum: JOB_STATUSES, default: 'pending', index: true },
    postedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    extendedUntil: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    viewCount: { type: Number, default: 0 },
    applicationCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    republishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'jobs' },
);

jobSchema.index({ status: 1, expiresAt: 1 });
jobSchema.index({ employerId: 1, status: 1 });
jobSchema.index({
  city: 1,
  sectorId: 1,
  positionId: 1,
  contractType: 1,
  experience: 1,
});
jobSchema.index({ postedAt: -1 });
jobSchema.index({ 'title.fr': 'text', 'title.en': 'text' });

jobSchema.plugin(toJSONPlugin);
jobSchema.plugin(softDeletePlugin);

export const Job = mongoose.model('Job', jobSchema) as any;
