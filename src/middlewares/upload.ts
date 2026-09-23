import multer from 'multer';
import sharp from 'sharp';
import { ApiError } from '@/shared/ApiError';

export const IMAGE_MAX = 5 * 1024 * 1024;
export const CV_MAX = 5 * 1024 * 1024;
export const MIN_DIMENSION = 600;

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_CV_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(IMAGE_MAX, CV_MAX) },
});

export function uploadSingle(field: string) {
  return memoryUpload.single(field);
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
}

function isOleDoc(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

function isZipDocx(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

// The declared MIME type comes from the client, so both checks below trust only the file's bytes.
export function validateCvBuffer(buffer: Buffer, _mimeType?: string): void {
  if (buffer.length > CV_MAX) {
    throw new ApiError(422, 'CV file exceeds the maximum allowed size of 5 MB');
  }

  if (!isPdf(buffer) && !isOleDoc(buffer) && !isZipDocx(buffer)) {
    throw new ApiError(422, 'CV must be a PDF, DOC, or DOCX file');
  }
}

const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'];

export async function validateImageBuffer(
  buffer: Buffer,
  { minWidth = MIN_DIMENSION, minHeight = MIN_DIMENSION } = {},
): Promise<{ width: number; height: number }> {
  if (buffer.length > IMAGE_MAX) {
    throw new ApiError(422, 'Image exceeds the maximum allowed size of 5 MB');
  }

  let metadata: { width?: number; height?: number; format?: string };
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new ApiError(422, 'Invalid or corrupted image file');
  }

  if (!metadata.format || !ALLOWED_IMAGE_FORMATS.includes(metadata.format)) {
    throw new ApiError(422, 'Image must be JPEG, PNG, or WebP');
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width < minWidth || height < minHeight) {
    throw new ApiError(
      422,
      `Image must be at least ${minWidth}×${minHeight} pixels (received ${width}×${height})`,
    );
  }

  return { width, height };
}

export function validateImageMime(mimeType: string): void {
  if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
    throw new ApiError(422, 'Image must be JPEG, PNG, or WebP');
  }
}
