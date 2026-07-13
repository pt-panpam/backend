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

      const presenceId = randomUUID();
      await client.query(
        `INSERT INTO presences (id, user_id, hex_id, entered_at) VALUES ($1, $2, $3, $4)`,
        [presenceId, userId, hexId, timestamp],
      );

      await client.query(
        `UPDATE presences SET left_at = $1 WHERE user_id = $2 AND hex_id != $3 AND left_at IS NULL`,
        [timestamp, userId, hexId],
      );

      const searchHexes = H3Service.getNeighborHexes(hexId, 1);
      const { rows: otherPresences } = await client.query(
        `SELECT id, user_id FROM presences WHERE hex_id = ANY($1::varchar[]) AND left_at IS NULL AND user_id != $2`,
        [searchHexes, userId],
      );

      // Smart Privacy Shield: Crowd Protection
      // Prevents identification in isolated places. Must have at least N users in the hexagon cluster.
      const MIN_CROWD_SIZE = 2; // Configurable threshold (Set to 2 for basic matching, scale to 3-5 in heavy production)
      if (otherPresences.length + 1 < MIN_CROWD_SIZE) {
        await client.query('COMMIT');
        return { newEncounters: result }; // Encounter stays hidden until anonymity can be preserved
      }

      if (otherPresences.length === 0) {
        await client.query('COMMIT');
        return { newEncounters: result };
      }

      const safeZoneService = SafeZoneService.getInstance();
      const enteringUserInSafeZone = await safeZoneService.isInSafeZone(userId, latitude, longitude);
      if (enteringUserInSafeZone) {
        await client.query('COMMIT');
        return { newEncounters: result };
      }

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

        const otherInSafeZone = await safeZoneService.isInSafeZone(otherId, H3Service.hexToCenter(hexId).lat, H3Service.hexToCenter(hexId).lng);
        if (otherInSafeZone) continue;

        const [userA, userB] = userId < otherId ? [userId, otherId] : [otherId, userId];
        const [presenceA, presenceB] = userId < otherId
          ? [presenceId, other.id]
          : [other.id, presenceId];

        const delayA = userA === userId ? myDelay : otherDelay;
        const delayB = userB === userId ? myDelay : otherDelay;
        const notifyTimeA = new Date(timestamp.getTime() + delayA * 60000);
        const notifyTimeB = new Date(timestamp.getTime() + delayB * 60000);

        const { rows: newEncounters } = await client.query(
          `INSERT INTO encounters (hex_id, user_a, user_b, presence_a, presence_b, overlap_started)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_a, user_b, hex_id) DO NOTHING
           RETURNING id`,
          [hexId, userA, userB, presenceA, presenceB, timestamp],
        );

        if (newEncounters.length === 0) continue;

        const encounterId = newEncounters[0].id;

        await client.query(
          `INSERT INTO encounter_notifications (encounter_id, receiver_id, crosser_id, notify_at)
           VALUES ($1, $2, $3, $4), ($1, $3, $2, $5)`,
          [encounterId, userA, userB, notifyTimeA, notifyTimeB],
        );

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