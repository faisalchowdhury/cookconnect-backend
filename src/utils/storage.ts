import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '@/config/env';

export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<{ storageKey: string; url: string }>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  private readonly uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = path.resolve(process.cwd(), uploadDir);
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<{ storageKey: string; url: string }> {
    const filePath = path.join(this.uploadDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { storageKey: key, url: `/uploads/${key}` };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    this.bucket = env.S3_BUCKET;
    this.publicUrl = env.S3_PUBLIC_URL.replace(/\/$/, '');
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: Boolean(env.S3_ENDPOINT),
    });
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<{ storageKey: string; url: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return { storageKey: key, url: `${this.publicUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

let storageInstance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!storageInstance) {
    storageInstance =
      env.STORAGE_DRIVER === 's3' ? new S3StorageProvider() : new LocalStorageProvider(env.UPLOAD_DIR);
  }
  return storageInstance;
}
