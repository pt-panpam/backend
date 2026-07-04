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
        overlap_ended TIMESTAMPTZ
      );
    `);

    // Migrate constraint: old was (user_a, user_b, presence_a, presence_b),
    // new is (user_a, user_b, hex_id) to prevent duplicate notifications
    // for the same pair in the same hexagon.
    await client.query(`
      ALTER TABLE encounters DROP CONSTRAINT IF EXISTS unique_encounter_pair;
    `).catch(() => {});
    await client.query(`
      DELETE FROM encounters e1 USING encounters e2
      WHERE e1.id < e2.id
        AND e1.user_a = e2.user_a
        AND e1.user_b = e2.user_b
        AND e1.hex_id = e2.hex_id;
    `).catch(() => {});
    await client.query(`
      ALTER TABLE encounters ADD CONSTRAINT unique_encounter_pair UNIQUE (user_a, user_b, hex_id);
    `).catch((err: any) => {
      if (!err.message?.includes('already exists')) throw err;
    });

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
