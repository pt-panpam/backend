import { sequelize } from './config/database';

async function addColumn(q: any, table: string, column: string, def: any) {
  if (sequelize.getDialect() === 'sqlite') {
    try {
      await q.addColumn(table, column, def);
      console.log(`Added ${column} to ${table}`);
    } catch {
      console.log(`Column ${column} already exists on ${table}`);
    }
  } else {
    await q.addColumn(table, column, def);
    console.log(`Added ${column} to ${table}`);
  }
}

async function migrate() {
  const q = sequelize.getQueryInterface();

  await addColumn(q, 'post_photos', 'type', { type: 'STRING(10)', defaultValue: 'photo' });
  await addColumn(q, 'messages', 'audio', { type: 'STRING(500)', allowNull: true });

  await sequelize.close();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
