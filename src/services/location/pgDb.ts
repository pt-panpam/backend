import { Pool } from 'pg';
import { env } from '../../config/env';

const pgUrl = env.DATABASE_URL;
const needsSsl = !pgUrl.includes('localhost') && !pgUrl.includes('127.0.0.1');

const pool = new Pool({
  connectionString: pgUrl,
  max: 10,
  min: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('pg pool error:', err.message);
});

export async function runProximityMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Presences Table - Added last_seen_at and valid_at for strict dwell time
    await client.query(`
      CREATE TABLE IF NOT EXISTS presences (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL,
        hex_id VARCHAR(50) NOT NULL,
        entered_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        valid_at TIMESTAMPTZ,
        left_at TIMESTAMPTZ
      );
    `);
    // Upgrade pre-existing presences tables that predate the dwell-time columns.
    await client.query(`ALTER TABLE presences ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;`).catch(() => {});
    await client.query(`ALTER TABLE presences ADD COLUMN IF NOT EXISTS valid_at TIMESTAMPTZ;`).catch(() => {});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_presences_active ON presences(hex_id) WHERE left_at IS NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_presences_user ON presences(user_id) WHERE left_at IS NULL;`);

    // 2. Encounters Table - Added delay snapshots and exact unlock_at timestamp
    await client.query(`
      CREATE TABLE IF NOT EXISTS encounters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hex_id VARCHAR(50) NOT NULL,
        user_a INTEGER NOT NULL,
        user_b INTEGER NOT NULL,
        presence_a UUID NOT NULL REFERENCES presences(id),
        presence_b UUID NOT NULL REFERENCES presences(id),
        overlap_started TIMESTAMPTZ NOT NULL,
        user_a_delay_minutes INTEGER NOT NULL,
        user_b_delay_minutes INTEGER NOT NULL,
        pair_delay_minutes INTEGER NOT NULL,
        unlock_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Upgrade pre-existing encounters tables that predate the delay/unlock columns.
    await client.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS user_a_delay_minutes INTEGER NOT NULL DEFAULT 45;`).catch(() => {});
    await client.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS user_b_delay_minutes INTEGER NOT NULL DEFAULT 45;`).catch(() => {});
    await client.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pair_delay_minutes INTEGER NOT NULL DEFAULT 45;`).catch(() => {});
    await client.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ;`).catch(() => {});
    await client.query(`ALTER TABLE encounters ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});

    // Cleanup old invalid constraints. Deduplication is now enforced via Postgres Advisory Locks 
    // inside the detection transaction to guarantee thread-safe 24-hour windows.
    await client.query(`ALTER TABLE encounters DROP CONSTRAINT IF EXISTS unique_encounter_occurrence;`).catch(() => {});
    await client.query(`ALTER TABLE encounters DROP CONSTRAINT IF EXISTS unique_encounter_pair;`).catch(() => {});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_encounters_pair_time ON encounters(user_a, user_b, created_at);`);

    // 3. Notifications & Outbox
    await client.query(`
      CREATE TABLE IF NOT EXISTS encounter_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL,
        crosser_id INTEGER NOT NULL,
        notify_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_encounter_notifications_lookup ON encounter_notifications(encounter_id, receiver_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox_events(created_at) WHERE processed_at IS NULL;`);

    console.log('✅ Proximity tables migrated and ready');
  } catch (err: any) {
    console.error('❌ Proximity migration error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export { pool };