import mongoose, { Schema } from 'mongoose';
import {
  AVAILABILITY_OPTIONS,
  CONTRACT_TYPES,
  EXPERIENCE_LEVELS,
  MAX_FOOD_PHOTOS,
  REQUIRED_COMPLETION_FIELDS,
} from './candidate.constant';
import { ICandidateProfileDocument } from './candidate.interface';
import { optionalLocalizedStringSchema } from '@/shared/localizedString';
import { softDeletePlugin, toJSONPlugin } from '@/shared/mongoosePlugins';

const trainingSchema = new Schema(
  {
    school: { type: String, required: true },
    diploma: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false },
);

const historySchema = new Schema(
  {
    establishment: { type: String, required: true },
    positionId: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false },
);

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof mongoose.Types.ObjectId) return true;
  return String(value).trim() !== '';
}

export function computeCompletionPercent(doc: ICandidateProfileDocument): number {
  const done = REQUIRED_COMPLETION_FIELDS.filter((field) => isFilled(doc[field])).length;
  return Math.round((done / REQUIRED_COMPLETION_FIELDS.length) * 100);
}

const candidateProfileSchema = new Schema<ICandidateProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    photoId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    sectorId: { type: String, default: '', trim: true },
    positionId: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true, index: true },
    country: { type: String, default: 'MA' },
    experience: { type: String, enum: [...EXPERIENCE_LEVELS, ''], default: '' },
    availability: { type: String, enum: [...AVAILABILITY_OPTIONS, ''], default: '', index: true },
    contractType: { type: String, enum: [...CONTRACT_TYPES, ''], default: '' },
    expectedSalary: { type: Number, default: null },
    phone: { type: String, default: '', trim: true, select: false },
    about: { type: optionalLocalizedStringSchema, default: () => ({ fr: '' }) },
    skills: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    training: { type: [trainingSchema], default: [] },
    history: { type: [historySchema], default: [] },
    foodPhotoIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'MediaAsset' }],
      default: [],
      validate: {
        validator(value: unknown[]) {
          return value.length <= MAX_FOOD_PHOTOS;
        },
        message: `A maximum of ${MAX_FOOD_PHOTOS} food photos is allowed`,
      },
    },
    cvAssetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    completionPercent: { type: Number, default: 0 },
    verified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    profileViews: { type: Number, default: 0 },
    searchable: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'candidateProfiles' },
);

candidateProfileSchema.index({ city: 1, sectorId: 1, positionId: 1, experience: 1 });
candidateProfileSchema.index({ verified: 1, searchable: 1 });
candidateProfileSchema.index({ firstName: 'text', lastName: 'text' });

candidateProfileSchema.pre('save', function preSave() {
  // `phone` is select:false; a document loaded without it would score the phone as
  // missing and silently lower a complete profile's percentage.
  if (!this.isNew && !this.isSelected('phone')) return;
  this.completionPercent = computeCompletionPercent(this as ICandidateProfileDocument);
});

candidateProfileSchema.plugin(toJSONPlugin);
candidateProfileSchema.plugin(softDeletePlugin);

export const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema) as any;
