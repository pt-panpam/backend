import { query } from './db';

/**
 * Schema migration for the PostgreSQL-native crossing system.
 *
 * Creates four tables:
 *   1. presences       — tracks a user's physical visit to a hexagon
 *   2. encounters      — tracks the overlap event between two users
 *   3. notifications   — tracks who gets notified and when (1 encounter = 2 notifications)
 *   4. outbox_events   — for safely handing off jobs to the queue worker
 *
 * All CREATE TABLE statements use IF NOT EXISTS so they are idempotent.
 * Indexes use IF NOT EXISTS (PG 9.5+) so re-running is safe.
 */
const SCHEMA_SQL = `
-- 1. Presences: Tracks a user's physical visit
CREATE TABLE IF NOT EXISTS presences (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL,
    hex_id VARCHAR(50) NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL,
    left_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_presences_active
    ON presences(hex_id) WHERE left_at IS NULL;

-- 2. Encounters: Tracks the overlap event
CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hex_id VARCHAR(50) NOT NULL,
    user_a INTEGER NOT NULL,      -- Always alphabetically smaller
    user_b INTEGER NOT NULL,      -- Always alphabetically larger
    presence_a UUID NOT NULL REFERENCES presences(id),
    presence_b UUID NOT NULL REFERENCES presences(id),
    overlap_started TIMESTAMPTZ NOT NULL,
    overlap_ended TIMESTAMPTZ
);

-- Migrate constraint: old was (user_a, user_b, presence_a, presence_b),
-- new is (user_a, user_b, hex_id) to prevent duplicate notifications.
ALTER TABLE encounters DROP CONSTRAINT IF EXISTS unique_encounter_pair;
DELETE FROM encounters e1 USING encounters e2
WHERE e1.id < e2.id
  AND e1.user_a = e2.user_a
  AND e1.user_b = e2.user_b
  AND e1.hex_id = e2.hex_id;
ALTER TABLE encounters ADD CONSTRAINT unique_encounter_pair UNIQUE (user_a, user_b, hex_id);

-- 3. Notifications: Tracks who gets notified and when (1 Encounter = 2 Notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL,
    crosser_id INTEGER NOT NULL,
    notify_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_lookup
    ON notifications(encounter_id, receiver_id);

-- 4. Outbox: For safely handing off jobs to our Queue
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
    ON outbox_events(created_at) WHERE processed_at IS NULL;

-- 5. Index on notifications for worker polling (unprocessed notifications)
CREATE INDEX IF NOT EXISTS idx_notifications_pending
    ON notifications(notify_at) WHERE sent_at IS NULL;
`;

/**
 * Run the schema migration once at startup.
 * Idempotent — safe to call multiple times.
 */
export async function migrateSchema(): Promise<void> {
  console.log('🔧 Running crossing-pg schema migration...');
  await query(SCHEMA_SQL);
  console.log('✅ Crossing-pg schema up to date.');
}