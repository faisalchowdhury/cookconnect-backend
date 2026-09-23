import mongoose, { Document, Schema, Types } from 'mongoose';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

export const SEARCH_EVENT_KINDS = ['job-search', 'candidate-search'] as const;
export type SearchEventKind = (typeof SEARCH_EVENT_KINDS)[number];

export interface ISearchEvent {
  kind: SearchEventKind;
  term: string;
  filters: {
    city?: string;
    sectorId?: string;
    positionId?: string;
    [key: string]: unknown;
  };
  userId: Types.ObjectId | null;
  resultCount: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISearchEventDocument extends ISearchEvent, Document {
  id: string;
}

const searchEventSchema = new Schema<ISearchEventDocument>(
  {
    kind: { type: String, enum: SEARCH_EVENT_KINDS, required: true, index: true },
    term: { type: String, default: '', trim: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resultCount: { type: Number, default: 0 },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true, collection: 'searchEvents' },
);

searchEventSchema.index({ createdAt: -1 });
searchEventSchema.index({ 'filters.positionId': 1 });
searchEventSchema.index({ 'filters.city': 1 });
searchEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 * 1000 });

searchEventSchema.plugin(toJSONPlugin);

export const SearchEvent = mongoose.model<ISearchEventDocument>(
  'SearchEvent',
  searchEventSchema,
);
