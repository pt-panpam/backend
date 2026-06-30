import { Sequelize } from 'sequelize';
import path from 'path';
import { env } from './env';

// 1. Pull the URL from Render's native environment variables
const databaseUrl = process.env.DATABASE_URL;

// 2. Render Internal URLs DO NOT support SSL. External URLs (containing .render.com) DO require SSL.
const requiresSsl = databaseUrl && databaseUrl.includes('.render.com');

export const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      dialectOptions: requiresSsl ? {
        ssl: { require: true, rejectUnauthorized: false },
      } : {}, // Empty object prevents SSL crashes on Render Internal Network
      logging: false,
      define: {
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.resolve(__dirname, '../..', env.DB_PATH),
      logging: false,
      define: {
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    });

export async function initDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
  
  // Manually add missing columns
  if (databaseUrl) {
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
    ];
    for (const sql of migrations) {
      try { 
        await sequelize.query(sql); 
      } catch (e: any) { 
        console.warn('PG migration skipped:', e.message); 
      }
    }
  } else {
    const migrations = [
      'ALTER TABLE `users` ADD COLUMN `is_live` TINYINT(1) DEFAULT 0;',
      'ALTER TABLE `cross_settings` ADD COLUMN `reveal_delay_minutes` INTEGER DEFAULT 60;',
      'ALTER TABLE `users` ADD COLUMN `expo_push_token` VARCHAR(255) DEFAULT NULL;',
      'ALTER TABLE `users` ADD COLUMN `push_crosses` TINYINT(1) DEFAULT 1;',
      'ALTER TABLE `users` ADD COLUMN `looking_for` VARCHAR(30) DEFAULT \'\';',
      'ALTER TABLE `conversations` ADD COLUMN `is_request` TINYINT(1) DEFAULT 0;',
      'ALTER TABLE `conversations` ADD COLUMN `disappearing_minutes` INTEGER DEFAULT 0;',
      'ALTER TABLE `post_photos` ADD COLUMN `type` VARCHAR(10) DEFAULT \'photo\';',
      'ALTER TABLE `messages` ADD COLUMN `audio` VARCHAR(500) DEFAULT NULL;',
      'ALTER TABLE `cross_settings` ADD COLUMN `reveal_schedule_hour_1` INTEGER DEFAULT 10;',
      'ALTER TABLE `cross_settings` ADD COLUMN `reveal_schedule_hour_2` INTEGER DEFAULT 22;',
    ];
    for (const sql of migrations) {
      try { 
        await sequelize.query(sql); 
      } catch { 
        /* column already exists */ 
      }
    }
  }
  console.log(`Database connected (${databaseUrl ? 'PostgreSQL' : 'SQLite'})`);
}
