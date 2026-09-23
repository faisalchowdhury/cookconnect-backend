import crypto from 'crypto';
import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { getStorage } from '@/utils/storage';
import { validateImageBuffer, validateImageMime } from '@/middlewares/upload';
import { MediaAsset } from '@/modules/media/media.model';
import {
  CreateMediaAssetInput,
  DecideModerationInput,
  IMediaAssetDocument,
  ModerationStatus,
} from '@/modules/media/media.interface';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const CV_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

// Extensions come from the validated file type, never the client's file name: the local
// driver serves uploads by extension, so a "photo.html" would be served as a web page.
export function imageExtension(mimeType: string): string {
  return IMAGE_EXTENSIONS[mimeType] ?? '.bin';
}

export function cvExtension(buffer: Buffer, mimeType: string): string {
  const head = buffer.subarray(0, 4);
  if (head.toString('ascii') === '%PDF') return '.pdf';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return '.doc';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return '.docx';
  return CV_EXTENSIONS[mimeType] ?? '.bin';
}

// Several files can be stored within the same millisecond, so a timestamp alone collides.
export function uniqueStorageKey(prefix: string, kind: string, extension: string): string {
  return `${prefix}/${kind}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
}

/** Soft-deletes an upload that a newer one replaced, so it no longer waits for review. */
export async function retireAsset(id: Types.ObjectId | string | null | undefined): Promise<void> {
  if (!id) return;
  await MediaAsset.updateOne(
    { _id: toObjectId(String(id)), deletedAt: null },
    { deletedAt: new Date() },
  );
}

export async function createAsset(input: CreateMediaAssetInput): Promise<IMediaAssetDocument> {
  return MediaAsset.create({
    ownerUserId: toObjectId(input.ownerUserId),
    kind: input.kind,
    storageKey: input.storageKey,
    url: input.url,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    moderationStatus: 'pending',
    reportCount: 0,
  });
}

export async function findById(id: string): Promise<IMediaAssetDocument | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return MediaAsset.findById(id);
}

// Candidate photos only: CVs are documents, and employer logos and covers are shown without review.
export const MODERATED_PHOTO_KINDS = ['profile-photo', 'dish-photo'];

export async function decideModeration(
  id: string,
  input: DecideModerationInput,
): Promise<IMediaAssetDocument> {
  const asset = await findById(id);
  if (!asset || !MODERATED_PHOTO_KINDS.includes(asset.kind)) {
    throw new ApiError(404, 'Photo not found');
  }

  if (input.status === 'rejected' && !input.reason?.trim()) {
    throw new ApiError(422, 'A rejection reason is required');
  }

  asset.moderationStatus = input.status;
  asset.moderationReason = input.status === 'rejected' ? input.reason!.trim() : null;
  asset.reviewedBy = toObjectId(input.reviewedBy);
  asset.reviewedAt = new Date();

  return asset.save();
}

export async function listByStatus(
  status: ModerationStatus,
  limit = 50,
  skip = 0,
): Promise<IMediaAssetDocument[]> {
  return MediaAsset.find({ moderationStatus: status, kind: { $in: MODERATED_PHOTO_KINDS } })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

export async function listPending(limit = 50, skip = 0): Promise<IMediaAssetDocument[]> {
  return listByStatus('pending', limit, skip);
}

export async function softDelete(id: string): Promise<IMediaAssetDocument> {
  const asset = await findById(id);
  if (!asset) {
    throw new ApiError(404, 'Media asset not found');
  }
  return asset.softDelete();
}

export async function listReports(limit = 50, skip = 0) {
  const { ModerationReport } = await import('./moderationReport.model');
  return ModerationReport.find({ status: 'open' })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export async function adminUpload(
  ownerUserId: string,
  kind: 'homepage' | 'banner',
  file: UploadedFile,
): Promise<{ id: string; url: string }> {
  validateImageMime(file.mimetype);
  const dimensions = await validateImageBuffer(file.buffer);

  const key = uniqueStorageKey('admin', kind, imageExtension(file.mimetype));
  const stored = await getStorage().upload(key, file.buffer, file.mimetype);

  const asset = await createAsset({
    ownerUserId,
    kind,
    storageKey: stored.storageKey,
    url: stored.url,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  });

  asset.moderationStatus = 'approved';
  await asset.save();

  return { id: String(asset._id), url: asset.url };
}
