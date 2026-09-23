import mongoose, { Schema } from 'mongoose';
import { APPLICATION_STATUSES } from './application.constant';
import { IApplicationDocument, IApplicationTimelineEntry } from './application.interface';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

const timelineEntrySchema = new Schema<IApplicationTimelineEntry>(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const applicationSchema = new Schema<IApplicationDocument>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'CandidateProfile', required: true, index: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'EmployerProfile', required: true, index: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'pending' },
    coverNote: { type: String, default: null },
    timeline: { type: [timelineEntrySchema], default: [] },
    appliedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'applications' },
);

applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ candidateId: 1, appliedAt: -1 });
applicationSchema.index({ employerId: 1, status: 1 });

applicationSchema.plugin(toJSONPlugin);

export const Application = mongoose.model('Application', applicationSchema) as any;
