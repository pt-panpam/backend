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
    'ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_delay_minutes" INTEGER DEFAULT 30;',
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
    'ALTER TABLE "cross_settings" ADD COLUMN IF NOT EXISTS "reveal_schedule_updated_at" TIMESTAMPTZ DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "cross_date_ist" VARCHAR(10) DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "user_a_unlock_time" TIMESTAMPTZ DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "user_b_unlock_time" TIMESTAMPTZ DEFAULT NULL;',
    'ALTER TABLE "cross_events" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ DEFAULT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_cross_events_date_ist ON cross_events(cross_date_ist);',
    'DROP INDEX IF EXISTS idx_cross_events_unique_daily;',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_events_unique_daily ON cross_events(user1_id, user2_id, cross_date_ist);',
    'CREATE TABLE IF NOT EXISTS "safe_zones" ("id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL, "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "radius_km" DOUBLE PRECISION DEFAULT 5, "label" VARCHAR(255) DEFAULT \'\', "is_active" BOOLEAN DEFAULT true, "created_at" TIMESTAMPTZ DEFAULT NOW(), "updated_at" TIMESTAMPTZ DEFAULT NOW());',
    'CREATE INDEX IF NOT EXISTS idx_safe_zones_user ON safe_zones(user_id);',
    'CREATE TABLE IF NOT EXISTS "notes" ("id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "text" TEXT NOT NULL, "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "discovery_radius_m" DOUBLE PRECISION DEFAULT 50, "published_at" TIMESTAMPTZ DEFAULT NULL, "upvote_count" INTEGER DEFAULT 0, "created_at" TIMESTAMPTZ DEFAULT NOW(), "updated_at" TIMESTAMPTZ DEFAULT NOW());',
    'CREATE TABLE IF NOT EXISTS "note_votes" ("id" SERIAL PRIMARY KEY, "note_id" INTEGER NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE, "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "created_at" TIMESTAMPTZ DEFAULT NOW(), "updated_at" TIMESTAMPTZ DEFAULT NOW());',
    'CREATE INDEX IF NOT EXISTS idx_notes_published ON notes(published_at);',
    'CREATE INDEX IF NOT EXISTS idx_note_votes_unique ON note_votes(note_id, user_id);',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_participants_unique ON conversation_participants(conversation_id, user_id);',
    'CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id, conversation_id);',
  ];
  for (const sql of migrations) {
    try { await sequelize.query(sql); } catch (e: any) { console.warn('PG migration skipped:', e.message); }
  }
  console.log('PostgreSQL connected');
}