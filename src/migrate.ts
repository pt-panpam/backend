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

  await addColumn(q, 'users', 'school', { type: 'STRING(255)', defaultValue: '' });
  await addColumn(q, 'users', 'work', { type: 'STRING(255)', defaultValue: '' });
  await addColumn(q, 'users', 'school_work_visibility', { type: 'STRING(20)', defaultValue: 'public' });
  await addColumn(q, 'users', 'dob_visibility', { type: 'STRING(20)', defaultValue: 'public' });
  await addColumn(q, 'users', 'sex_visibility', { type: 'STRING(20)', defaultValue: 'public' });
  await addColumn(q, 'users', 'looking_for_visibility', { type: 'STRING(20)', defaultValue: 'public' });
  await addColumn(q, 'users', 'hobbies_visibility', { type: 'STRING(20)', defaultValue: 'public' });
  await addColumn(q, 'users', 'phone_visibility', { type: 'STRING(20)', defaultValue: 'friends' });

  await sequelize.close();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
