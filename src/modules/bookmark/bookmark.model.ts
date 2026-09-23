import mongoose, { Schema } from 'mongoose';
import { BOOKMARK_KINDS } from './bookmark.constant';
import { IBookmarkDocument } from './bookmark.interface';
import { toJSONPlugin } from '@/shared/mongoosePlugins';

const bookmarkSchema = new Schema<IBookmarkDocument>(
  {
    kind: { type: String, enum: BOOKMARK_KINDS, required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    note: { type: String, default: null },
  },
  { timestamps: true, collection: 'bookmarks' },
);

bookmarkSchema.index({ ownerUserId: 1, kind: 1, targetId: 1 }, { unique: true });

bookmarkSchema.plugin(toJSONPlugin);

export const Bookmark = mongoose.model('Bookmark', bookmarkSchema) as any;
