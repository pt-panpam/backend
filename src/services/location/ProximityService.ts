import { randomUUID } from 'crypto';
import { pool } from './pgDb';
import { H3Service } from './H3Service';
import { SafeZoneService } from './SafeZoneService';

interface NewEncounter {
  encounterId: string;
  userA: number;
  userB: number;
}

export class ProximityService {
  private static instance: ProximityService;

  static getInstance(): ProximityService {
    if (!this.instance) {
      this.instance = new ProximityService();
    }
    return this.instance;
  }

  /**
   * Called when a user enters (or is detected in) a hexagon.
   *
   * 1. Inserts a presence record.
   * 2. Closes any previous open presences in other hexes.
   * 3. Finds other active users in the same hex.
   * 4. Batch-attempts to insert encounters with ON CONFLICT DO NOTHING.
   * 5. For each new encounter, inserts encounter_notifications + outbox_events.
   *
   * Returns the list of newly created encounters so the caller can emit socket events.
   */
  async enterHexagon(
    userId: number,
    hexId: string,
    latitude: number,
    longitude: number,
    timestamp: Date,
  ): Promise<{ newEncounters: NewEncounter[] }> {
    const result: NewEncounter[] = [];

    if (!hexId) return { newEncounters: result };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insert presence
      const presenceId = randomUUID();
      await client.query(
        `INSERT INTO presences (id, user_id, hex_id, entered_at) VALUES ($1, $2, $3, $4)`,
        [presenceId, userId, hexId, timestamp],
      );

      // 2. Close previous open presences in other hexes
      await client.query(
        `UPDATE presences SET left_at = $1 WHERE user_id = $2 AND hex_id != $3 AND left_at IS NULL`,
        [timestamp, userId, hexId],
      );

      // 3. Find active presences in current hex + 6 neighbors (gridDisk to solve hex boundary problem)
      const searchHexes = H3Service.getNeighborHexes(hexId, 1); // [origin, ...6 neighbors]
      const { rows: otherPresences } = await client.query(
        `SELECT id, user_id FROM presences WHERE hex_id = ANY($1::varchar[]) AND left_at IS NULL AND user_id != $2`,
        [searchHexes, userId],
      );

      if (otherPresences.length === 0) {
        await client.query('COMMIT');
        return { newEncounters: result };
      }

      // Check if the entering user is in a safe zone (skip cross detection)
      const safeZoneService = SafeZoneService.getInstance();
      const enteringUserInSafeZone = await safeZoneService.isInSafeZone(userId, latitude, longitude);
      if (enteringUserInSafeZone) {
        await client.query('COMMIT');
        return { newEncounters: result };
      }

      // 4. Fetch reveal_delay_minutes for all involved users from cross_settings
      const allUserIds = [userId, ...otherPresences.map((p: any) => p.user_id)];
      const { rows: settings } = await client.query(
        `SELECT user_id, reveal_delay_minutes FROM cross_settings WHERE user_id = ANY($1::int[])`,
        [allUserIds],
      );
      const delayMap = new Map<number, number>();
      for (const s of settings) {
        delayMap.set(s.user_id, s.reveal_delay_minutes ?? 30);
      }
      const myDelay = delayMap.get(userId) ?? 30;

      const hexCenter = H3Service.hexToCenter(hexId);

      for (const other of otherPresences) {
        const otherId = other.user_id;
        const otherDelay = delayMap.get(otherId) ?? 30;

        // Skip if the other user is in one of their safe zones
        const otherInSafeZone = await safeZoneService.isInSafeZone(otherId, H3Service.hexToCenter(hexId).lat, H3Service.hexToCenter(hexId).lng);
        if (otherInSafeZone) continue;

        // Lexicographical sort for UNIQUE constraint
        const [userA, userB] = userId < otherId ? [userId, otherId] : [otherId, userId];
        const [presenceA, presenceB] = userId < otherId
          ? [presenceId, other.id]
          : [other.id, presenceId];

        const delayA = userA === userId ? myDelay : otherDelay;
        const delayB = userB === userId ? myDelay : otherDelay;
        const notifyTimeA = new Date(timestamp.getTime() + delayA * 60000);
        const notifyTimeB = new Date(timestamp.getTime() + delayB * 60000);

        // 5. INSERT … ON CONFLICT DO NOTHING RETURNING id (idempotent)
        const { rows: newEncounters } = await client.query(
          `INSERT INTO encounters (hex_id, user_a, user_b, presence_a, presence_b, overlap_started)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_a, user_b, hex_id) DO NOTHING
           RETURNING id`,
          [hexId, userA, userB, presenceA, presenceB, timestamp],
        );

        if (newEncounters.length === 0) continue;

        const encounterId = newEncounters[0].id;

        // 6. Insert 2 encounter_notifications (one per user)
        await client.query(
          `INSERT INTO encounter_notifications (encounter_id, receiver_id, crosser_id, notify_at)
           VALUES ($1, $2, $3, $4), ($1, $3, $2, $5)`,
          [encounterId, userA, userB, notifyTimeA, notifyTimeB],
        );

        // 7. Insert 2 outbox_events for delayed push notifications
        const payloadA = JSON.stringify({ encounterId, receiverId: userA, delayMs: delayA * 60000 });
        const payloadB = JSON.stringify({ encounterId, receiverId: userB, delayMs: delayB * 60000 });

        await client.query(
          `INSERT INTO outbox_events (event_type, payload)
           VALUES ('SCHEDULE_NOTIFICATION', $1), ('SCHEDULE_NOTIFICATION', $2)`,
          [payloadA, payloadB],
        );

        result.push({ encounterId, userA, userB });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('ProximityService.enterHexagon error:', error);
      throw error;
    } finally {
      client.release();
    }

    return { newEncounters: result };
  }

  /**
   * Checks if a user has been notified for a given encounter.
   */
  async isEncounterNotified(encounterId: string, receiverId: number): Promise<boolean> {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM encounter_notifications
         WHERE encounter_id = $1 AND receiver_id = $2 AND sent_at IS NOT NULL
         LIMIT 1`,
        [encounterId, receiverId],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Marks an encounter_notification as sent.
   */
  async markNotificationSent(encounterId: string, receiverId: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE encounter_notifications SET sent_at = NOW()
         WHERE encounter_id = $1 AND receiver_id = $2 AND sent_at IS NULL`,
        [encounterId, receiverId],
      );
    } catch {}
  }
}
