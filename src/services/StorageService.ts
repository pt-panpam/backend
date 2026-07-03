import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '35843aa68ded4d9fc6de85a47426fde5';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '5ff8b8c16acf42d0e3e6190db3b4e373';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '35f7354cbedacfcace375a507b01b10ec3a9909e3c64c288c50353aade5a709f';
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cross-media';
const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL || `https://${BUCKET_NAME}.${ACCOUNT_ID}.r2.dev`;
const S3_ENDPOINT = process.env.R2_S3_ENDPOINT || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

export class StorageService {
  /**
   * Upload a file to Cloudflare R2.
   * @returns The public URL of the uploaded file.
   */
  static async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
    folder: string = 'uploads'
  ): Promise<string> {
    const ext = path.extname(originalName);
    const key = `${folder}/${uuidv4()}${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      })
    );

    return `${PUBLIC_URL_BASE}/${key}`;
  }

  /**
   * Delete a file from Cloudflare R2 by its public URL.
   */
  static async deleteFile(publicUrl: string): Promise<void> {
    const urlObj = new URL(publicUrl);
    const key = urlObj.pathname.replace(/^\//, '');
    if (!key || key.startsWith('pub-')) return; // safety: don't delete root paths

    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      );
    } catch (err) {
      console.error('Failed to delete file from R2:', err);
    }
  }

  /**
   * Extract the key from a public URL for deletion.
   */
  static urlToKey(publicUrl: string): string {
    const urlObj = new URL(publicUrl);
    return urlObj.pathname.replace(/^\//, '');
  }

  static isR2Url(url: string | null | undefined): url is string {
    if (!url) return false;
    return url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com');
  }
}