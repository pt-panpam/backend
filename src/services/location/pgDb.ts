import { Pool } from 'pg';
import { env } from '../../config/env';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  min: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('pg pool error:', err.message);
});

export async function runProximityMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS presences (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL,
        hex_id VARCHAR(50) NOT NULL,
        entered_at TIMESTAMPTZ NOT NULL,
        left_at TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_presences_active ON presences(hex_id) WHERE left_at IS NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_presences_user ON presences(user_id) WHERE left_at IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS encounters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hex_id VARCHAR(50) NOT NULL,
        user_a INTEGER NOT NULL,
        user_b INTEGER NOT NULL,
        presence_a UUID NOT NULL REFERENCES presences(id),
        presence_b UUID NOT NULL REFERENCES presences(id),
        overlap_started TIMESTAMPTZ NOT NULL,
        overlap_ended TIMESTAMPTZ,
        CONSTRAINT unique_encounter_pair UNIQUE (user_a, user_b, presence_a, presence_b)
      );
    `);

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
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_encounter_notifications_lookup
      ON encounter_notifications(encounter_id, receiver_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
      ON outbox_events(created_at) WHERE processed_at IS NULL;
    `);

    console.log('✅ Proximity tables ready');
  } catch (err: any) {
    console.error('❌ Proximity migration error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
