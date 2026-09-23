import { Document, Types } from 'mongoose';
import { MEDIA_KINDS, MODERATION_STATUSES } from '@/modules/media/media.constant';

export type MediaKind = (typeof MEDIA_KINDS)[number];
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export interface IMediaAsset {
  ownerUserId: Types.ObjectId;
  kind: MediaKind;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  moderationStatus: ModerationStatus;
  moderationReason?: string | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  reportCount: number;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMediaAssetDocument extends IMediaAsset, Document {
  id: string;
  softDelete(): Promise<IMediaAssetDocument>;
}

export interface CreateMediaAssetInput {
  ownerUserId: Types.ObjectId | string;
  kind: MediaKind;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}

export interface DecideModerationInput {
  status: 'approved' | 'rejected';
  reason?: string;
  reviewedBy: Types.ObjectId | string;
}
