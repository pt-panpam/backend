import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { pool } from './pgDb';
import { H3Service } from './H3Service';
import { CrossSettings } from '../../models/CrossSettings';
import { CrossEvent } from '../../models/CrossEvent';
import { User } from '../../models/User';
import { getNotificationQueue } from './NotificationQueue';
import { createAndDeliverNotification } from '../NotificationService';
import { getIO } from '../../io';
import { istDateStr, getDatePartsInIST, createDateFromIST } from '../../utils/timezone';

/**
 * EncounterService
 * ---------------------------------------------------------------------------
 * Privacy-first crossing detection.
 *
 *   - The H3 hexagon is used ONLY as a coarse "are they near each other" test.
 *   - Every user↔user pair is evaluated INDEPENDENTLY. There are never groups.
 *   - When both users of a pair are continuously co-present in the same hexagon
 *     for a full CONFIRM_MS window (30 seconds), the encounter is CONFIRMED and
 *     persisted at that point. Nobody is notified during the confirmation window.
 *   - After confirmation, each pair computes its OWN notification delay using
 *     ONLY the two users in that pair (delay = max of the two users' settings).
 *     The unrelated users' delays never affect the pair.
 *   - When the pair's delay expires, each user of that pair is notified:
 *       "<Other> crossed paths with you."
 *   - Exact real-time location is never exposed to other users.
 */

const CONFIRM_MS = 30_000;          // 30-second confirmation window
const DEFAULT_DELAY_MINUTES = 45;   // fallback when a user has no setting

/**
 * Returns the earliest recap slot (in IST) strictly after `from`, given a user's
 * two daily recap hours. E.g. cross at 21:51 with hours 9 & 23 -> today 23:00.
 */
export function nextRecapSlot(from: Date, hour1: number, hour2: number): Date {
  const p = getDatePartsInIST(from);
  for (let offset = 0; offset <= 2; offset++) {
    const slots = [
      createDateFromIST(p.year, p.month, p.day + offset, hour1, 0, 0),
      createDateFromIST(p.year, p.month, p.day + offset, hour2, 0, 0),
    ];
    for (const s of slots) {
      if (s.getTime() > from.getTime()) return s;
    }
  }
  return createDateFromIST(p.year, p.month, p.day + 1, hour1, 0, 0);
}

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

  /**
   * Called for every location update.
   * Returns the hex the user is in plus any freshly-confirmed encounters.
   */
  async onLocationUpdate(
    userId: number,
    latitude: number,
    longitude: number,
    time: Date = new Date()
  ): Promise<{ hexId: string; newEncounters: ConfirmedEncounter[] }> {
    const hexId = H3Service.latLngToHex(latitude, longitude);

    // 1. Update the user's presence (open/close presences per hexagon).
    await this.managePresence(userId, hexId, time);

    // 2. Evaluate every other active user currently in the same hexagon as an
    //    INDEPENDENT pair, confirming those that have been continuously
    //    co-present for at least CONFIRM_MS.
    const newEncounters = await this.checkAndConfirmPairs(userId, hexId, time);

    return { hexId, newEncounters };
  }

  /** Handle a batch of location points; runs confirmation for each one. */
  async onLocationBatch(
    userId: number,
    points: { latitude: number; longitude: number; recorded_at: string }[],
  ): Promise<{ pointsProcessed: number; newEncounters: ConfirmedEncounter[] }> {
    let newEncounters: ConfirmedEncounter[] = [];
    for (const p of points) {
      const time = new Date(p.recorded_at);
      const hexId = H3Service.latLngToHex(p.latitude, p.longitude);
      await this.managePresence(userId, hexId, time);
      const confirmed = await this.checkAndConfirmPairs(userId, hexId, time);
      newEncounters = newEncounters.concat(confirmed);
    }
    return { pointsProcessed: points.length, newEncounters };
  }

  /**
   * Open/close presence rows.
   * Keeping the SAME open presence while a user reports the same hexagon is what
   * lets us measure a continuous 30s stay rather than resetting on every ping.
   */
  private async managePresence(userId: number, hexId: string, time: Date): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string; hex_id: string }>(
        `SELECT id, hex_id FROM presences
          WHERE user_id = $1 AND left_at IS NULL
          ORDER BY entered_at DESC LIMIT 1`,
        [userId],
      );

      if (rows.length > 0 && rows[0].hex_id === hexId) {
        // Still in the same hexagon → keep the continuous presence open.
        await client.query('COMMIT');
        return rows[0].id;
      }

      // User moved hexagons (or had no active presence) → close old, open new.
      await client.query(
        `UPDATE presences SET left_at = COALESCE(left_at, $2)
          WHERE user_id = $1 AND left_at IS NULL`,
        [userId, time],
      );

      const presenceId = randomUUID();
      await client.query(
        `INSERT INTO presences (id, user_id, hex_id, entered_at) VALUES ($1, $2, $3, $4)`,
        [presenceId, userId, hexId, time],
      );

      await client.query('COMMIT');
      return presenceId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * For every other active user in `hexId`, evaluate the (userId, other) pair
   * independently. Confirm pairs that have been continuously co-present for
   * at least CONFIRM_MS. Returns the newly-confirmed encounters.
   */
  private async checkAndConfirmPairs(
    userId: number,
    hexId: string,
    time: Date,
  ): Promise<ConfirmedEncounter[]> {
    const { rows: others } = await pool.query<{ id: string; user_id: number; entered_at: Date }>(
      `SELECT id, user_id, entered_at FROM presences
        WHERE hex_id = $1 AND left_at IS NULL AND user_id != $2`,
      [hexId, userId],
    );
    if (others.length === 0) return [];

    const { rows: mine } = await pool.query<{ id: string; entered_at: Date }>(
      `SELECT id, entered_at FROM presences
        WHERE user_id = $1 AND left_at IS NULL AND hex_id = $2
        ORDER BY entered_at DESC LIMIT 1`,
      [userId, hexId],
    );
    if (mine.length === 0) return [];

    const myPresenceId = mine[0].id;
    const myEntered = new Date(mine[0].entered_at);

    const confirmed: ConfirmedEncounter[] = [];

    for (const other of others) {
      const A = Math.min(userId, other.user_id);
      const B = Math.max(userId, other.user_id);

      const otherEntered = new Date(other.entered_at);
      const overlapStarted = new Date(Math.max(myEntered.getTime(), otherEntered.getTime()));

      // Both must have been continuously present for the full confirmation window.
      if (time.getTime() - overlapStarted.getTime() < CONFIRM_MS) {
        continue;
      }

      const presenceA = A === userId ? myPresenceId : other.id;
      const presenceB = B === userId ? myPresenceId : other.id;

      const created = await this.confirmEncounter(
        A, B, hexId, overlapStarted, time, presenceA, presenceB,
      );
      if (created) {
        confirmed.push({ userA: A, userB: B, hexId, confirmedAt: time });
      }
    }

    return confirmed;
  }

  /**
   * Persist a confirmed encounter (idempotent) and, if newly confirmed,
   * schedule the per-pair delayed notifications. Never notifies here.
   */
  private async confirmEncounter(
    A: number,
    B: number,
    hexId: string,
    overlapStarted: Date,
    confirmedAt: Date,
    presenceA: string,
    presenceB: string,
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<{ id: string }>(
        `INSERT INTO encounters (hex_id, user_a, user_b, presence_a, presence_b, overlap_started, overlap_ended)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ON CONSTRAINT unique_encounter_occurrence DO NOTHING
         RETURNING id`,
        [hexId, A, B, presenceA, presenceB, overlapStarted, confirmedAt],
      );

      if (res.rows.length === 0) {
        // Already confirmed for this co-presence → nothing new.
        await client.query('COMMIT');
        return false;
      }

      const encounterId = res.rows[0].id;
      await this.scheduleNotifications(client, encounterId, A, B, confirmedAt);

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * A pair's delay is computed from ITS TWO users only:
   *   pairDelay = max(delayA, delayB)
   * Each user gets their own notification at that pair's delay time, and the
   * unrelated users' delays are never involved.
   */
  private async scheduleNotifications(
    client: PoolClient,
    encounterId: string,
    A: number,
    B: number,
    confirmedAt: Date,
  ): Promise<void> {
    const [delayA, delayB] = await Promise.all([this.getUserDelay(A), this.getUserDelay(B)]);
    const pairDelayMs = Math.max(delayA, delayB) * 60_000;
    const notifyAt = new Date(confirmedAt.getTime() + pairDelayMs);
    const delayMs = Math.max(0, notifyAt.getTime() - Date.now());

    // Durable per-receiver rows.
    await client.query(
      `INSERT INTO encounter_notifications (encounter_id, receiver_id, crosser_id, notify_at)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $4)`,
      [encounterId, A, B, notifyAt, B, A],
    );

    // Durable outbox rows (fallback delivery).
    await client.query(
      `INSERT INTO outbox_events (event_type, payload) VALUES
        ('encounter_push', $1),
        ('encounter_push', $2)`,
      [
        JSON.stringify({ encounterId, receiverId: A, crosserId: B, delayMs, notifyAt: notifyAt.toISOString() }),
        JSON.stringify({ encounterId, receiverId: B, crosserId: A, delayMs, notifyAt: notifyAt.toISOString() }),
      ],
    ).catch(() => {});

    // Best-effort immediate BullMQ scheduling (deduped by jobId).
    try {
      const q = getNotificationQueue();
      await q.add(
        'send-encounter-push',
        { encounterId, receiverId: A, crosserId: B },
        { delay: delayMs, jobId: `encounter-push-${encounterId}-${A}`, removeOnComplete: true },
      );
      await q.add(
        'send-encounter-push',
        { encounterId, receiverId: B, crosserId: A },
        { delay: delayMs, jobId: `encounter-push-${encounterId}-${B}`, removeOnComplete: true },
      );
    } catch {
      // BullMQ unavailable — the durable outbox rows above cover delivery.
    }

    // Mirror into CrossEvent so the existing UI/dashboard surfaces the encounter
    // as a confirmed cross (already "notified" so it shows without the old gate).
    await this.mirrorCrossEvent(A, B, encounterId, confirmedAt);
  }

  private async getUserDelay(userId: number): Promise<number> {
    try {
      const s = await CrossSettings.findOne({ where: { userId }, attributes: ['revealDelayMinutes'] });
      return s?.revealDelayMinutes ?? DEFAULT_DELAY_MINUTES;
    } catch {
      return DEFAULT_DELAY_MINUTES;
    }
  }

  /**
   * Computes the full-profile unlock time for a pair based on each user's recap
   * schedule hours. Both users of the pair unlock together at the LATER next
   * slot (consistent with the pair using max(delayA, delayB) for notifications).
   */
  private async getPairUnlockTimes(A: number, B: number, confirmedAt: Date): Promise<{ slot: Date; slotA: Date; slotB: Date }> {
    const [sa, sb] = await Promise.all([
      CrossSettings.findOne({ where: { userId: A } }),
      CrossSettings.findOne({ where: { userId: B } }),
    ]);
    const h1a = sa?.revealScheduleHour1 ?? 9;
    const h2a = sa?.revealScheduleHour2 ?? 21;
    const h1b = sb?.revealScheduleHour1 ?? 9;
    const h2b = sb?.revealScheduleHour2 ?? 21;
    const slotA = nextRecapSlot(confirmedAt, h1a, h2a);
    const slotB = nextRecapSlot(confirmedAt, h1b, h2b);
    return { slot: new Date(Math.max(slotA.getTime(), slotB.getTime())), slotA, slotB };
  }

  private async mirrorCrossEvent(
    A: number,
    B: number,
    encounterId: string,
    confirmedAt: Date,
  ): Promise<void> {
    try {
      const cDate = istDateStr(confirmedAt);
      const unlock = await this.getPairUnlockTimes(A, B, confirmedAt);
      const [event, created] = await CrossEvent.findOrCreate({
        where: { user1Id: A, user2Id: B, crossDateIst: cDate },
        defaults: {
          user1Id: A,
          user2Id: B,
          hexId: encounterId, // reused as a stable cross reference (not the H3 cell)
          crossDateIst: cDate,
          crossedAt: confirmedAt,
          revealTimeA: unlock.slotA,
          revealTimeB: unlock.slotB,
          notificationTime: confirmedAt,
          recapSlotTime: unlock.slot,
          published: true,
          notified: true,
        } as any,
      });
      if (created) {
        const io = getIO();
        if (io) {
          io.to(`user:${A}`).emit('cross:detected', { eventId: event.id });
          io.to(`user:${B}`).emit('cross:detected', { eventId: event.id });
        }
      } else {
        // A row already existed for this pair+day (e.g. from an older build that
        // stored a stale future recap slot). Refresh its unlock times so it
        // reflects the latest cross and self-heals stale data.
        await event.update({
          crossedAt: confirmedAt,
          revealTimeA: unlock.slotA,
          revealTimeB: unlock.slotB,
          recapSlotTime: unlock.slot,
        } as any);
      }
    } catch (err) {
      // Non-fatal — the durable encounter row is the source of truth.
      console.error('mirrorCrossEvent failed:', (err as Error)?.message || err);
    }
  }

  /**
   * BullMQ handler + outbox relay target. Delivers the per-pair, privacy-safe
   * message once its delay has expired.
   */
  async handleEncounterPush(data: { encounterId: string; receiverId: number; crosserId: number }): Promise<void> {
    const { encounterId, receiverId, crosserId } = data;

    // Idempotency guard — only send once per encounter+receiver.
    const update = await pool.query(
      `UPDATE encounter_notifications
          SET sent_at = NOW()
        WHERE encounter_id = $1 AND receiver_id = $2 AND sent_at IS NULL
        RETURNING id`,
      [encounterId, receiverId],
    );
    if (update.rows.length === 0) return;

    let name = 'Someone';
    try {
      const crosser = await User.findByPk(crosserId, { attributes: ['id', 'firstName', 'lastName'] });
      if (crosser) {
        name = `${crosser.firstName ?? ''} ${crosser.lastName ?? ''}`.trim() || 'Someone';
      }
    } catch {}

    await createAndDeliverNotification({
      userId: receiverId,
      type: 'cross_event',
      title: 'Paths Crossed',
      body: `${name} crossed paths with you.`,
      actorId: crosserId,
    });
  }
}
