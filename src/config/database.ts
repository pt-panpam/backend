import { Sequelize } from 'sequelize';
import { env } from './env';

const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;
const requiresSsl = databaseUrl && databaseUrl.includes('.render.com');

export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  dialectOptions: requiresSsl ? {
    ssl: { require: true, rejectUnauthorized: false },
  } : {},
  logging: false,
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
});

export async function initDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
  const migrations = [
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_live" BOOLEAN DEFAULT false;',
    'ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_delay_minutes" INTEGER DEFAULT 60;',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "expo_push_token" VARCHAR(255) DEFAULT NULL;',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_crosses" BOOLEAN DEFAULT true;',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "looking_for" VARCHAR(30) DEFAULT \'\';',
    'ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "is_request" BOOLEAN DEFAULT false;',
    'ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "disappearing_minutes" INTEGER DEFAULT 0;',
    'ALTER TABLE "post_photos" ADD COLUMN IF NOT EXISTS "type" VARCHAR(10) DEFAULT \'photo\';',
    'ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "audio" VARCHAR(500) DEFAULT NULL;',
    'ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_schedule_hour_1" INTEGER DEFAULT 10;',
    'ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_schedule_hour_2" INTEGER DEFAULT 22;',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school" VARCHAR(255) DEFAULT \'\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work" VARCHAR(255) DEFAULT \'\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "school_work_visibility" VARCHAR(20) DEFAULT \'public\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dob_visibility" VARCHAR(20) DEFAULT \'public\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sex_visibility" VARCHAR(20) DEFAULT \'public\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "looking_for_visibility" VARCHAR(20) DEFAULT \'public\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hobbies_visibility" VARCHAR(20) DEFAULT \'public\';',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_visibility" VARCHAR(20) DEFAULT \'friends\';',
    'ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP DEFAULT NULL;',
    'ALTER TABLE "post_photos" ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "hex_id" TEXT DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "hex_latitude" DOUBLE PRECISION DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "hex_longitude" DOUBLE PRECISION DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "reveal_delay_minutes" INTEGER DEFAULT 0;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "revealed_at" TIMESTAMPTZ DEFAULT NULL;',
  ];
  for (const sql of migrations) {
    try { await sequelize.query(sql); } catch (e: any) { console.warn('PG migration skipped:', e.message); }
  }
  console.log('PostgreSQL connected');
}
