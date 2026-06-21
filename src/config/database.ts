import { Sequelize } from 'sequelize';
import path from 'path';
import { env } from './env';

const dbPath = path.resolve(__dirname, '../..', env.DB_PATH);

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
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
  // Manually add missing columns (SQLite ALTER TABLE is limited)
  const migrations = [
    'ALTER TABLE `users` ADD COLUMN `is_live` TINYINT(1) DEFAULT 0;',
    'ALTER TABLE `cross_settings` ADD COLUMN `reveal_delay_minutes` INTEGER DEFAULT 60;',
    'ALTER TABLE `users` ADD COLUMN `expo_push_token` VARCHAR(255) DEFAULT NULL;',
  ];
  for (const sql of migrations) {
    try { await sequelize.query(sql); } catch { /* column already exists */ }
  }
  console.log('Database connected and synced');
}
