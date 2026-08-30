import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { pool } from './pgDb';
import { H3Service } from './H3Service';
import { CrossSettings } from '../../models/CrossSettings';
import { CrossEvent } from '../../models/CrossEvent';
import { getNotificationQueue } from './NotificationQueue';
import { createAndDeliverNotification } from '../NotificationService';
import { getIO } from '../../io';
import { istDateStr, nextRecapSlot } from '../../utils/timezone';

export const EncounterConfig = {
  MAX_GPS_ACCURACY_METERS: 50,      // Ignore wildly inaccurate readings
  MIN_DWELL_MS: 30_000,             // Must remain continuously in hex for 30s
  DEDUPLICATION_HOURS: 24,          // Prevent duplicate pair crossings within 24 hours
  DEFAULT_DELAY_MINUTES: 45,        // Fallback delay
  PRESENCE_STALE_MS: 2 * 60_000,    // Presence considered stale (not co-located) after no update
};

export interface ConfirmedEncounter {
  userA: number;
  userB: number;
  hexId: string;
  confirmedAt: Date;
}

export class EncounterService {
  private static instance: EncounterService;

  static getInstance(): EncounterService {
    if (!this.instance) {
      this.instance = new EncounterService();
    }
    return this.instance;
  }

  async onLocationUpdate(
    userId: number,
    latitude: number,
    longitude: number,
    accuracy?: number,
    time: Date = new Date()
  ): Promise<{ hexId: string | null; newEncounters: ConfirmedEncounter[] }> {
    // 1. Accuracy Filter
    if (accuracy !== undefined && accuracy > EncounterConfig.MAX_GPS_ACCURACY_METERS) {
      return { hexId: null, newEncounters: [] };
    }

    const hexId = H3Service.latLngToHex(latitude, longitude);

    // 2. Process Presence Dwell Time
    await this.managePresence(userId, hexId, time);

    // 3. Evaluate & Detect Crossings
    const newEncounters = await this.checkAndConfirmPairs(userId, hexId, time);

    return { hexId, newEncounters };
  }

  async onLocationBatch(
    userId: number,
    points: { latitude: number; longitude: number; accuracy?: number; recorded_at: string }[],
  ): Promise<{ pointsProcessed: number; newEncounters: ConfirmedEncounter[] }> {
    let newEncounters: ConfirmedEncounter[] = [];
    for (const p of points) {
      const { newEncounters: newlyConfirmed } = await this.onLocationUpdate(
        userId, p.latitude, p.longitude, p.accuracy, new Date(p.recorded_at)
      );
      newEncounters = newEncounters.concat(newlyConfirmed);
    }
    return { pointsProcessed: points.length, newEncounters };
  }

  private async managePresence(userId: number, hexId: string, time: Date): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string; hex_id: string; entered_at: Date; valid_at: Date | null }>(
        `SELECT id, hex_id, entered_at, valid_at FROM presences 
         WHERE user_id = $1 AND left_at IS NULL 
         ORDER BY entered_at DESC LIMIT 1`,
        [userId],
      );

      if (rows.length > 0 && rows[0].hex_id === hexId) {
        // Still in same cell. Update last_seen. Check if we crossed the 30s dwell threshold.
        const enteredAt = new Date(rows[0].entered_at);
        const dwellTimeMs = time.getTime() - enteredAt.getTime();
        
        let newValidAt = rows[0].valid_at;
        if (!newValidAt && dwellTimeMs >= EncounterConfig.MIN_DWELL_MS) {
          newValidAt = time; // User's presence is now valid
        }

        await client.query(
          `UPDATE presences SET last_seen_at = $2, valid_at = $3 WHERE id = $1`,
          [rows[0].id, time, newValidAt]
        );
      } else {
        // Moved to (or entered) another cell. Remove the user from any other open hex so they
        // are only present in the current one. Rows referenced by encounter history are kept.
        await client.query(
          `DELETE FROM presences
           WHERE user_id = $1 AND left_at IS NULL AND hex_id != $2
             AND NOT EXISTS (
               SELECT 1 FROM encounters e
               WHERE e.presence_a = presences.id OR e.presence_b = presences.id
             )`,
          [userId, hexId],
        );
        // Mark any unreferenced-removable leftovers closed, and open the new live row.
        await client.query(
          `UPDATE presences SET left_at = COALESCE(left_at, $2)
           WHERE user_id = $1 AND left_at IS NULL AND hex_id != $3`,
          [userId, time, hexId],
        );
        await client.query(
          `INSERT INTO presences (id, user_id, hex_id, entered_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), userId, hexId, time, time],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async checkAndConfirmPairs(userId: number, hexId: string, time: Date): Promise<ConfirmedEncounter[]> {
    const minRecency = new Date(time.getTime() - EncounterConfig.PRESENCE_STALE_MS);

    // Both users MUST have valid_at IS NOT NULL (dwell satisfied) AND be recently active (not stale).
    const { rows: others } = await pool.query<{ id: string; user_id: number; valid_at: Date }>(
      `SELECT id, user_id, valid_at FROM presences
       WHERE hex_id = $1 AND left_at IS NULL AND user_id != $2
         AND valid_at IS NOT NULL AND last_seen_at >= $3`,
      [hexId, userId, minRecency],
    );
    if (others.length === 0) return [];

    const { rows: mine } = await pool.query<{ id: string; valid_at: Date }>(
      `SELECT id, valid_at FROM presences
       WHERE user_id = $1 AND left_at IS NULL AND hex_id = $2
         AND valid_at IS NOT NULL AND last_seen_at >= $3
       ORDER BY entered_at DESC LIMIT 1`,
      [userId, hexId, minRecency],
    );
    if (mine.length === 0) return [];

    const confirmed: ConfirmedEncounter[] = [];

    for (const other of others) {
      // Pair Normalization
      const A = Math.min(userId, other.user_id);
      const B = Math.max(userId, other.user_id);
      
      const overlapStarted = new Date(Math.max(new Date(mine[0].valid_at).getTime(), new Date(other.valid_at).getTime()));
      const presenceA = A === userId ? mine[0].id : other.id;
      const presenceB = B === userId ? mine[0].id : other.id;

      const created = await this.transactionalConfirmEncounter(A, B, hexId, overlapStarted, time, presenceA, presenceB);
      if (created) confirmed.push({ userA: A, userB: B, hexId, confirmedAt: time });
    }

    return confirmed;
  }

  // Background-monitor entry point: given a hex and the users currently in it (from the
  // Redis live monitor), confirm a crossing for every pair that has valid, fresh Postgres
  // presence (30s dwell met and recently active). Triggers notifications via the encounter flow.
  async checkHexCrossings(hexId: string, occupantIds: number[], time: Date = new Date()): Promise<ConfirmedEncounter[]> {
    if (occupantIds.length < 2) return [];

    const minRecency = new Date(time.getTime() - EncounterConfig.PRESENCE_STALE_MS);
    const placeholders = occupantIds.map((_, i) => `$${i + 1}`).join(', ');

    // Only occupants that have a valid (dwelled) AND fresh presence count as co-located now.
    const { rows: present } = await pool.query<{ user_id: number; id: string; valid_at: Date }>(
      `SELECT user_id, id, valid_at FROM presences
       WHERE hex_id = $${occupantIds.length + 1} AND left_at IS NULL
         AND user_id IN (${placeholders})
         AND valid_at IS NOT NULL AND last_seen_at >= $${occupantIds.length + 2}`,
      [...occupantIds, hexId, minRecency],
    );
    if (present.length < 2) return [];

    const byUser = new Map<number, { id: string; valid_at: Date }>();
    for (const p of present) byUser.set(p.user_id, { id: p.id, valid_at: p.valid_at });

    const confirmed: ConfirmedEncounter[] = [];
    const ids = [...byUser.keys()].sort((a, b) => a - b);

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = ids[i];
        const B = ids[j];
        const overlapStarted = new Date(Math.max(
          byUser.get(A)!.valid_at.getTime(),
          byUser.get(B)!.valid_at.getTime(),
        ));
        const created = await this.transactionalConfirmEncounter(
          A, B, hexId, overlapStarted, time, byUser.get(A)!.id, byUser.get(B)!.id,
        );
        if (created) confirmed.push({ userA: A, userB: B, hexId, confirmedAt: time });
      }
    }

    return confirmed;
  }

  private async transactionalConfirmEncounter(
    A: number, B: number, hexId: string, overlapStarted: Date, confirmedAt: Date, presenceA: string, presenceB: string
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Race-Condition Proof Advisory Lock for Deduplication (Locks exact pair execution)
      await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [A, B]);

      // 2. Apply Deduplication Policy (e.g., 24 hours)
      const { rows: existing } = await client.query(
        `SELECT id FROM encounters WHERE user_a = $1 AND user_b = $2 AND created_at >= NOW() - INTERVAL '${EncounterConfig.DEDUPLICATION_HOURS} hours'`,
        [A, B]
      );
      if (existing.length > 0) {
        await client.query('ROLLBACK');
        return false;
      }

      // 3. Dynamic Delay Calculation and Snapshots
      const delayA = await this.getUserDelay(A);
      const delayB = await this.getUserDelay(B);
      const pairDelay = Math.max(delayA, delayB);
      const unlockAt = new Date(confirmedAt.getTime() + (pairDelay * 60_000));

      const res = await client.query<{ id: string }>(
        `INSERT INTO encounters (hex_id, user_a, user_b, presence_a, presence_b, overlap_started, user_a_delay_minutes, user_b_delay_minutes, pair_delay_minutes, unlock_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [hexId, A, B, presenceA, presenceB, overlapStarted, delayA, delayB, pairDelay, unlockAt, confirmedAt],
      );

      const encounterId = res.rows[0].id;
      
      // 4. Send Immediate Anonymous Notification & Schedule Unlock Notification
      await this.scheduleNotifications(client, encounterId, A, B, confirmedAt, unlockAt);

      await client.query('COMMIT');
      
      // 5. Mirror to Application DB
      await this.mirrorCrossEvent(A, B, encounterId, confirmedAt, unlockAt);
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async scheduleNotifications(
    client: PoolClient, encounterId: string, A: number, B: number, confirmedAt: Date, unlockAt: Date
  ): Promise<void> {
    const delayMs = Math.max(0, unlockAt.getTime() - Date.now());

    // Schedule Future Profile Reveal Notifications (Idempotent durable outbox)
    await client.query(
      `INSERT INTO encounter_notifications (encounter_id, receiver_id, crosser_id, notify_at) VALUES ($1, $2, $3, $4), ($1, $5, $6, $4)`,
      [encounterId, A, B, unlockAt, B, A],
    );

    await client.query(
      `INSERT INTO outbox_events (event_type, payload) VALUES ('encounter_push', $1), ('encounter_push', $2)`,
      [
        JSON.stringify({ encounterId, receiverId: A, crosserId: B, delayMs, notifyAt: unlockAt.toISOString() }),
        JSON.stringify({ encounterId, receiverId: B, crosserId: A, delayMs, notifyAt: unlockAt.toISOString() }),
      ],
    );

    // Send Immediate Privacy-Safe "Anonymous" Notification
    createAndDeliverNotification({ userId: A, type: 'cross_event', title: 'Paths Crossed', body: `Someone crossed your path. Profile unlocks later.` });
    createAndDeliverNotification({ userId: B, type: 'cross_event', title: 'Paths Crossed', body: `Someone crossed your path. Profile unlocks later.` });
  }

  private async getUserDelay(userId: number): Promise<number> {
    try {
      const s = await CrossSettings.findOne({ where: { userId }, attributes: ['revealDelayMinutes'] });
      return s?.revealDelayMinutes ?? EncounterConfig.DEFAULT_DELAY_MINUTES;
    } catch {
      return EncounterConfig.DEFAULT_DELAY_MINUTES;
    }
  }

  private async mirrorCrossEvent(A: number, B: number, encounterId: string, confirmedAt: Date, unlockAt: Date): Promise<void> {
    try {
      const cDate = istDateStr(confirmedAt);

      // Full reveal is gated to the daily recap slot (from each user's schedule
      // hours), NOT the pair delay. Use the later of the two users' next slots so
      // neither sees a premature full unlock.
      const [settingsA, settingsB] = await Promise.all([
        CrossSettings.findOne({ where: { userId: A } }),
        CrossSettings.findOne({ where: { userId: B } }),
      ]);
      const slotA = nextRecapSlot(
        confirmedAt,
        settingsA?.revealScheduleHour1 ?? 9,
        settingsA?.revealScheduleHour2 ?? 21,
      );
      const slotB = nextRecapSlot(
        confirmedAt,
        settingsB?.revealScheduleHour1 ?? 9,
        settingsB?.revealScheduleHour2 ?? 21,
      );
      const recapSlotTime = slotA.getTime() > slotB.getTime() ? slotA : slotB;

      const [event, created] = await CrossEvent.findOrCreate({
        where: { user1Id: A, user2Id: B, hexId: encounterId },
        defaults: {
          user1Id: A,
          user2Id: B,
          hexId: encounterId,
          crossDateIst: cDate,
          crossedAt: confirmedAt,
          revealTimeA: unlockAt, // Explicit pair delay unlock time (notification)
          revealTimeB: unlockAt,
          recapSlotTime, // Full profile reveal at the daily recap slot
          notificationTime: unlockAt,
          published: false,
          notified: false,
        } as any,
      });

      if (created) {
        const io = getIO();
        if (io) {
          io.to(`user:${A}`).emit('cross:detected', { eventId: event.id });
          io.to(`user:${B}`).emit('cross:detected', { eventId: event.id });
        }
      }
    } catch (err) {
      console.error('mirrorCrossEvent failed:', (err as Error)?.message || err);
    }
  }

  // BullMQ handler triggered perfectly at 'unlock_at'
  async handleEncounterPush(data: { encounterId: string; receiverId: number; crosserId: number }): Promise<void> {
    const { encounterId, receiverId, crosserId } = data;

    const update = await pool.query(
      `UPDATE encounter_notifications SET sent_at = NOW() WHERE encounter_id = $1 AND receiver_id = $2 AND sent_at IS NULL RETURNING id`,
      [encounterId, receiverId],
    );
    if (update.rows.length === 0) return;

    // Fetch CrossEvent to mark as fully published for UI visibility
    await CrossEvent.update(
      { published: true, notified: true }, 
      { where: { hexId: encounterId, user1Id: Math.min(receiverId, crosserId), user2Id: Math.max(receiverId, crosserId) } }
    );

    // Anonymous notification — never reveal the crosser's name here. The full
    // profile reveal is gated to the daily recap slot, not this delayed push.
    await createAndDeliverNotification({
      userId: receiverId, type: 'cross_event', title: 'Paths Crossed', body: 'Someone crossed your path.',
    });
  }
}