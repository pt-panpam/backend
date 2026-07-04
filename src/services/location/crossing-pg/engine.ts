import { randomUUID } from 'crypto';
import { getClient } from './db';
import { H3Service } from '../H3Service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnterHexagonResult {
  /** Number of new encounters created (duplicates suppressed by ON CONFLICT). */
  newEncounters: number;
  /** IDs of users we crossed paths with (new encounters only). */
  crossedWith: number[];
  /** The hex ID we entered. */
  hexId: string;
}

// ---------------------------------------------------------------------------
// Core: enterHexagon
// ---------------------------------------------------------------------------

/**
 * Called when a user enters a hexagon (i.e. sends a location update).
 *
 * PostgreSQL-native design:
 *   - Single ACID transaction (BEGIN / COMMIT / ROLLBACK)
 *   - INSERT ... ON CONFLICT DO NOTHING RETURNING id for idempotent encounter creation
 *   - Lexicographical sorting of user pairs to satisfy the UNIQUE constraint
 *   - Respects each user's reveal_delay_minutes for scheduling notifications
 *
 * @param userId  The user entering the hexagon (integer ID from Sequelize models).
 * @param hexId   The H3 hexagon ID.
 * @param time    The timestamp of the entry.
 */
export async function enterHexagon(
  userId: number,
  hexId: string,
  time: Date,
): Promise<EnterHexagonResult> {
  const presenceId = randomUUID();
  const result: EnterHexagonResult = { newEncounters: 0, crossedWith: [], hexId };

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // 1. Insert the presence record
    // -----------------------------------------------------------------------
    await client.query(
      `INSERT INTO presences (id, user_id, hex_id, entered_at)
       VALUES ($1, $2, $3, $4)`,
      [presenceId, userId, hexId, time],
    );

    // -----------------------------------------------------------------------
    // 2. Find other active (non-left) users in the same hexagon
    // -----------------------------------------------------------------------
    const { rows: otherPresences } = await client.query(
      `SELECT id, user_id
       FROM presences
       WHERE hex_id = $1
         AND left_at IS NULL
         AND user_id != $2`,
      [hexId, userId],
    );

    // No one else is here — commit and return early.
    if (otherPresences.length === 0) {
      await client.query('COMMIT');
      return result;
    }

    // -----------------------------------------------------------------------
    // 3. Fetch reveal_delay_minutes for all involved users
    //    (We need the current user's delay too, since it's used for notify_at)
    // -----------------------------------------------------------------------
    const allUserIds = [userId, ...otherPresences.map((p) => p.user_id)];
    const { rows: userRows } = await client.query(
      `SELECT id, reveal_delay_minutes
       FROM cross_settings
       WHERE user_id = ANY($1::int[])`,
      [allUserIds],
    );

    // Build a lookup map; default to 30 minutes if no settings row exists.
    const delays = new Map<number, number>();
    for (const row of userRows) {
      delays.set(row.id, row.reveal_delay_minutes ?? 30);
    }
    // Ensure defaults for any user missing from cross_settings
    for (const id of allUserIds) {
      if (!delays.has(id)) delays.set(id, 30);
    }

    const myDelay = delays.get(userId)!;

    // -----------------------------------------------------------------------
    // 4. Prepare encounter candidates & attempt idempotent insertion
    // -----------------------------------------------------------------------
    for (const other of otherPresences) {
      const otherId = other.user_id;
      const otherDelay = delays.get(otherId)!;

      // Lexicographical sorting to satisfy the UNIQUE constraint.
      // user_a / presence_a must be the "smaller" side.
      const isUser1Smaller = userId < otherId;
      const userA = isUser1Smaller ? userId : otherId;
      const userB = isUser1Smaller ? otherId : userId;
      const presenceA = isUser1Smaller ? presenceId : other.id;
      const presenceB = isUser1Smaller ? other.id : presenceId;

      // Compute notify_at for each user based on THEIR delay setting.
      const notifyTimeA = new Date(
        time.getTime() + (isUser1Smaller ? myDelay : otherDelay) * 60_000,
      );
      const notifyTimeB = new Date(
        time.getTime() + (isUser1Smaller ? otherDelay : myDelay) * 60_000,
      );

      // -------------------------------------------------------------------
      // 5. PostgreSQL superpower: INSERT ... ON CONFLICT DO NOTHING RETURNING
      //
      //    We throw every pair at the database. If a row with the same
      //    (user_a, user_b, hex_id) already exists, PG silently ignores it.
      //    Only the truly new rows return an id.
      // -------------------------------------------------------------------
      const { rows: newEncounters } = await client.query(
        `INSERT INTO encounters (hex_id, user_a, user_b, presence_a, presence_b, overlap_started)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_a, user_b, hex_id) DO NOTHING
         RETURNING id`,
        [hexId, userA, userB, presenceA, presenceB, time],
      );

      // If an ID was returned, this is a brand-new encounter.
      if (newEncounters.length > 0) {
        const encounterId = newEncounters[0].id;

        // Insert the 2 notification rows for this encounter.
        await client.query(
          `INSERT INTO notifications (encounter_id, receiver_id, crosser_id, notify_at)
           VALUES ($1, $2, $3, $4), ($1, $3, $2, $5)`,
          [encounterId, userA, userB, notifyTimeA, notifyTimeB],
        );

        // Insert outbox events for the queue worker.
        const payloadA = JSON.stringify({
          encounterId,
          receiverId: userA,
          delayMs: notifyTimeA.getTime() - time.getTime(),
        });
        const payloadB = JSON.stringify({
          encounterId,
          receiverId: userB,
          delayMs: notifyTimeB.getTime() - time.getTime(),
        });

        await client.query(
          `INSERT INTO outbox_events (event_type, payload)
           VALUES ('SCHEDULE_NOTIFICATION', $1), ('SCHEDULE_NOTIFICATION', $2)`,
          [payloadA, payloadB],
        );

        result.newEncounters++;
        result.crossedWith.push(otherId);
      }
    }

    // -----------------------------------------------------------------------
    // 6. Commit the transaction
    // -----------------------------------------------------------------------
    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Helper: leaveHexagon (mark presence as left)
// ---------------------------------------------------------------------------

/**
 * Mark a user's presence as ended. Called when the user leaves a hexagon
 * (e.g. moves to a different hex or the app goes to background).
 */
export async function leaveHexagon(presenceId: string, leftAt: Date): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE presences SET left_at = $1 WHERE id = $2 AND left_at IS NULL`,
      [leftAt, presenceId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}