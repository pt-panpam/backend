import { pool } from './pgDb';
import { getNotificationQueue } from './NotificationQueue';
const notificationQueue = getNotificationQueue();

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Outbox Relay Worker:
 * Runs every 5 seconds, grabs up to 100 unprocessed outbox events
 * using FOR UPDATE SKIP LOCKED, and relays them to BullMQ with
 * the configured delay so the queue consumer fires at notify_at.
 */
async function processOutbox(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: events } = await client.query(
      `SELECT id, payload FROM outbox_events
       WHERE processed_at IS NULL
       ORDER BY created_at ASC
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
    );

    if (events.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    for (const event of events) {
      const data = event.payload;

      await notificationQueue.add(
        'notify-user',
        {
          encounterId: data.encounterId,
          receiverId: data.receiverId,
        },
        {
          delay: data.delayMs,
          jobId: `outbox-${event.id}`,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    const eventIds = events.map((e: any) => e.id);
    await client.query(
      `UPDATE outbox_events SET processed_at = NOW() WHERE id = ANY($1::uuid[])`,
      [eventIds],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('OutboxWorker error:', error);
  } finally {
    client.release();
  }
}

export function startOutboxWorker(): void {
  if (running) return;
  running = true;
  intervalHandle = setInterval(processOutbox, 5000);
  console.log('🔁 Outbox worker started (polling every 5s)');
}

export function stopOutboxWorker(): void {
  running = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
