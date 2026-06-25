import { Sequelize } from 'sequelize';
import path from 'path';
import { env } from './env';

const databaseUrl = process.env.DATABASE_URL;

export const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false },
      },
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
  if (!databaseUrl) {
    const migrations = [
      'ALTER TABLE `users` ADD COLUMN `is_live` TINYINT(1) DEFAULT 0;',
      'ALTER TABLE `cross_settings` ADD COLUMN `reveal_delay_minutes` INTEGER DEFAULT 60;',
      'ALTER TABLE `users` ADD COLUMN `expo_push_token` VARCHAR(255) DEFAULT NULL;',
      'ALTER TABLE `users` ADD COLUMN `push_crosses` TINYINT(1) DEFAULT 1;',
      'ALTER TABLE `conversations` ADD COLUMN `is_request` TINYINT(1) DEFAULT 0;',
      'ALTER TABLE `conversations` ADD COLUMN `disappearing_minutes` INTEGER DEFAULT 0;',
      'ALTER TABLE `post_photos` ADD COLUMN `type` VARCHAR(10) DEFAULT \'photo\';',
      'ALTER TABLE `messages` ADD COLUMN `audio` VARCHAR(500) DEFAULT NULL;',
    ];
    for (const sql of migrations) {
      try { await sequelize.query(sql); } catch { /* column already exists */ }
    }
  }
  console.log(`Database connected (${databaseUrl ? 'PostgreSQL' : 'SQLite'})`);
}
