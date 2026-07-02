import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_PG_URL = 'postgresql://icross_db_user:Ag2H8fUttw09lx1cyCOSIhEPLRRErq8h@dpg-d8unhpho3t8c73cf1oj0-a.oregon-postgres.render.com/icross_db'

export const env = {
  PORT: parseInt(process.env.PORT || '8000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '24h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  DATABASE_URL: process.env.DATABASE_URL || DEFAULT_PG_URL,
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(','),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  PG_DATABASE_URL: process.env.PG_DATABASE_URL || DEFAULT_PG_URL,
  H3_RESOLUTION: parseInt(process.env.H3_RESOLUTION || '9', 10),
};
