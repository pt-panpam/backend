import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_PG_URL = ''

export const env = {
  PORT: parseInt(process.env.PORT || '8000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '24h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_PG_URL,
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(','),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PG_DATABASE_URL: process.env.PG_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_PG_URL,
  H3_RESOLUTION: parseInt(process.env.H3_RESOLUTION || '9', 10),
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'cross-media',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '',
  R2_ENDPOINT: process.env.R2_ENDPOINT || '',
};
