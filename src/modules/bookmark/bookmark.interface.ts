import { Document, Types } from 'mongoose';
import { BookmarkKind } from './bookmark.constant';

export interface IBookmark {
  kind: BookmarkKind;
  ownerUserId: Types.ObjectId;
  targetId: Types.ObjectId;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookmarkDocument extends IBookmark, Document {
  _id: Types.ObjectId;
}

export type CreateBookmarkInput = {
  ownerUserId: string;
  kind: BookmarkKind;
  targetId: string;
  note?: string;
};
