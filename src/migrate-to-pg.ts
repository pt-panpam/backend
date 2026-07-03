import { Sequelize } from 'sequelize';
import { sequelize } from './config/database';
import { initModels } from './models';

const PG_URL = process.env.PG_MIGRATE_URL || 'postgresql://icross_db_user:Ag2H8fUttw09lx1cyCOSIhEPLRRErq8h@dpg-d8unhpho3t8c73cf1oj0-a.oregon-postgres.render.com/icross_db';

const pg = new Sequelize(PG_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false },
  },
  logging: false,
});

async function ensureColumns() {
  // Add missing columns to PG tables that exist in SQLite but not in PG
  const addCols: { table: string; column: string; def: string }[] = [
    { table: 'users', column: 'school', def: 'VARCHAR(255) DEFAULT \'\'' },
    { table: 'users', column: 'work', def: 'VARCHAR(255) DEFAULT \'\'' },
    { table: 'users', column: 'school_work_visibility', def: 'VARCHAR(20) DEFAULT \'public\'' },
    { table: 'users', column: 'dob_visibility', def: 'VARCHAR(20) DEFAULT \'public\'' },
    { table: 'users', column: 'sex_visibility', def: 'VARCHAR(20) DEFAULT \'public\'' },
    { table: 'users', column: 'looking_for_visibility', def: 'VARCHAR(20) DEFAULT \'public\'' },
    { table: 'users', column: 'hobbies_visibility', def: 'VARCHAR(20) DEFAULT \'public\'' },
    { table: 'users', column: 'phone_visibility', def: 'VARCHAR(20) DEFAULT \'friends\'' },
    { table: 'users', column: 'is_live', def: 'BOOLEAN DEFAULT false' },
    { table: 'users', column: 'expo_push_token', def: 'VARCHAR(255) DEFAULT NULL' },
    { table: 'users', column: 'push_crosses', def: 'BOOLEAN DEFAULT true' },
    { table: 'cross_settings', column: 'reveal_delay_minutes', def: 'INTEGER DEFAULT 60' },
    { table: 'cross_settings', column: 'reveal_schedule_hour_1', def: 'INTEGER DEFAULT 10' },
    { table: 'cross_settings', column: 'reveal_schedule_hour_2', def: 'INTEGER DEFAULT 22' },
    { table: 'cross_settings', column: 'reveal_schedule_updated_at', def: 'TIMESTAMPTZ DEFAULT NULL' },
    { table: 'conversations', column: 'is_request', def: 'BOOLEAN DEFAULT false' },
    { table: 'conversations', column: 'disappearing_minutes', def: 'INTEGER DEFAULT 0' },
    { table: 'post_photos', column: 'type', def: 'VARCHAR(10) DEFAULT \'photo\'' },
    { table: 'messages', column: 'audio', def: 'VARCHAR(500) DEFAULT NULL' },
    { table: 'cross_events', column: 'hex_id', def: 'TEXT DEFAULT NULL' },
    { table: 'cross_events', column: 'hex_latitude', def: 'DOUBLE PRECISION DEFAULT NULL' },
    { table: 'cross_events', column: 'hex_longitude', def: 'DOUBLE PRECISION DEFAULT NULL' },
    { table: 'cross_events', column: 'reveal_delay_minutes', def: 'INTEGER DEFAULT 0' },
    { table: 'cross_events', column: 'revealed_at', def: 'TIMESTAMPTZ DEFAULT NULL' },
  ];

  for (const { table, column, def } of addCols) {
    try {
      await pg.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${def}`);
    } catch (err: any) {
      // Column might already exist
      console.warn(`   ⚠️ Could not add ${column} to ${table}: ${err.message}`);
    }
  }
}

async function migrate() {
  console.log('🔍 Step 1: Connecting to SQLite...');
  const sqlite = sequelize;
  await sqlite.authenticate();
  console.log('✅ SQLite connected');

  console.log('🔍 Step 2: Connecting to PostgreSQL...');
  await pg.authenticate();
  console.log('✅ PostgreSQL connected');

  // Initialize models on PG to create tables if needed
  initModels(pg);
  await pg.sync({ alter: false });
  console.log('✅ PG tables synced');

  // Ensure all columns exist
  console.log('🔧 Ensuring all columns exist on PG...');
  await ensureColumns();
  console.log('✅ Columns ensured');

  // Step 3: Read all data from SQLite
  console.log('📦 Step 3: Reading data from SQLite...');

  const tables = [
    { name: 'hobbies', idCol: 'id', order: 'id' },
    { name: 'users', idCol: 'id', order: 'id' },
    { name: 'profile_galleries', idCol: 'id', order: 'id' },
    { name: 'cross_settings', idCol: 'id', order: 'id' },
    { name: 'posts', idCol: 'id', order: 'id' },
    { name: 'post_photos', idCol: 'id', order: 'id' },
    { name: 'post_likes', idCol: 'id', order: 'id' },
    { name: 'saved_posts', idCol: 'id', order: 'id' },
    { name: 'comments', idCol: 'id', order: 'id' },
    { name: 'conversations', idCol: 'id', order: 'id' },
    { name: 'messages', idCol: 'id', order: 'id' },
    { name: 'conversation_read_statuses', idCol: 'id', order: 'id' },
    { name: 'conversation_participants', idCol: null, order: 'conversation_id' },
    { name: 'calls', idCol: 'id', order: 'id' },
    { name: 'friend_requests', idCol: 'id', order: 'id' },
    { name: 'friends', idCol: 'id', order: 'id' },
    { name: 'blocks', idCol: 'id', order: 'id' },
    { name: 'notifications', idCol: 'id', order: 'id' },
    { name: 'cross_events', idCol: 'id', order: 'id' },
    { name: 'profile_likes', idCol: 'id', order: 'id' },
    { name: 'reports', idCol: 'id', order: 'id' },
    { name: 'recaps', idCol: 'id', order: 'id' },
  ];

  // Delete order: children first (reverse of insert order)
  const deleteOrder = [...tables].reverse();
  for (const table of deleteOrder) {
    try {
      await pg.query(`DELETE FROM "${table.name}"`);
      console.log(`   → Cleared ${table.name} in PG`);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not clear ${table.name}: ${err.message}`);
    }
  }

  for (const table of tables) {
    console.log(`\n📋 Processing table: ${table.name}...`);

    // Read from SQLite
    const rows: any[] = await sqlite.query(
      `SELECT * FROM \`${table.name}\` ORDER BY \`${table.order}\``,
      { type: 'SELECT' }
    );
    console.log(`   → ${rows.length} rows read from SQLite`);

    if (rows.length === 0) continue;

    // Get PG columns for this table
    const pgColsResult: any = await pg.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      { bind: [table.name] }
    );
    const pgColumns = new Set(pgColsResult[0].map((r: any) => r.column_name));

    if (table.name === 'conversation_participants') {
      for (const row of rows) {
        try {
          await pg.query(
            `INSERT INTO "conversation_participants" ("conversation_id", "user_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            { bind: [row.conversation_id, row.user_id] }
          );
        } catch (err: any) {
          console.error(`   ❌ Error: ${err.message}`);
        }
      }
    } else {
      // Filter columns to only those that exist in PG
      const columns = Object.keys(rows[0]).filter(col => pgColumns.has(col));
      if (columns.length === 0) {
        console.warn(`   ⚠️ No matching columns found for ${table.name}`);
        continue;
      }

      const colNames = columns.map(c => `"${c}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      let inserted = 0;
      let errors = 0;
      for (const row of rows) {
        const vals = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return null;
          if (typeof val === 'number') return val;
          if (val instanceof Date) return val.toISOString();
          return String(val);
        });
        try {
          await pg.query(
            `INSERT INTO "${table.name}" (${colNames}) VALUES (${placeholders})`,
            { bind: vals }
          );
          inserted++;
        } catch (err: any) {
          errors++;
          if (errors <= 3) {
            console.error(`   ❌ Error: ${err.message.slice(0, 100)}`);
          }
        }
      }
      console.log(`   ✅ ${inserted} rows inserted, ${errors} errors`);
    }
  }

  // Step 4: Reset sequences
  console.log('\n🔧 Step 4: Resetting sequences...');
  const seqTables = tables.filter(t => t.idCol && t.name !== 'conversation_participants');
  for (const table of seqTables) {
    try {
      const maxResult: any = await pg.query(
        `SELECT COALESCE(MAX("${table.idCol}"), 0) + 1 AS next_id FROM "${table.name}"`
      );
      const nextId = maxResult[0]?.[0]?.next_id || 1;
      await pg.query(`ALTER SEQUENCE "${table.name}_id_seq" RESTART WITH ${nextId}`);
      console.log(`   ✅ ${table.name} sequence reset to ${nextId}`);
    } catch (err: any) {
      console.warn(`   ⚠️ Could not reset sequence for ${table.name}: ${err.message}`);
    }
  }

  console.log('\n🎉 Migration complete!');
  await pg.close();
  await sqlite.close();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});