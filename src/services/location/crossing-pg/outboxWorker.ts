import { getClient } from './db';

// ---------------------------------------------------------------------------
// Outbox Worker (The Outbox Relay)
//
// Uses PostgreSQL's FOR UPDATE SKIP LOCKED to safely pull rows from the
// outbox_events table without colliding with other server instances.
//
// Multiple workers can run this concurrently — each will grab a different
// batch of rows thanks to SKIP LOCKED.
// ---------------------------------------------------------------------------

export interface OutboxEvent {
  id: string;
  event_type: string;
  payload: {
    encounterId: string;
    receiverId: number;
    delayMs: number;
  };
}

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

/**
 * Poll the outbox for unprocessed events, process them via the provided
 * handler, then mark them as processed.
 *
 * @param handler  Async function that processes each event (e.g. enqueue to BullMQ/SQS).
 * @param batchSize  Number of events to grab per poll (default 100).
 */
export async function processOutbox(
  handler: OutboxHandler,
  batchSize: number = 100,
): Promise<number> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // PostgreSQL superpower: FOR UPDATE SKIP LOCKED
    //
    // Safely grabs up to `batchSize` rows, locking them for THIS transaction.
    // If another server instance runs this code at the exact same time, it
    // will skip these rows and grab the next batch.
    // -----------------------------------------------------------------------
    const { rows: events } = await client.query(
      `SELECT id, event_type, payload
       FROM outbox_events
       WHERE processed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    if (events.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    // Process each event via the handler.
    // The handler is responsible for sending to the actual queue (BullMQ, SQS, etc.).
    for (const row of events) {
      const event: OutboxEvent = {
        id: row.id,
        event_type: row.event_type,
        payload: row.payload, // pg driver auto-parses JSONB
      };
      await handler(event);
    }

    // Mark all as processed in one quick UPDATE.
    const eventIds = events.map((e: any) => e.id);
    await client.query(
      `UPDATE outbox_events
       SET processed_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [eventIds],
    );

    await client.query('COMMIT');

    return events.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Start a continuous polling loop that processes the outbox every `intervalMs`.
 *
 * @param handler    Async function that processes each event.
 * @param intervalMs Polling interval in milliseconds (default 1000).
 * @param batchSize  Number of events to grab per poll (default 100).
 * @returns          A function that stops the polling loop.
 */
export function startOutboxPolling(
  handler: OutboxHandler,
  intervalMs: number = 1000,
  batchSize: number = 100,
): () => void {
  let running = true;

  async function poll(): Promise<void> {
    while (running) {
      try {
        const processed = await processOutbox(handler, batchSize);
        if (processed > 0) {
          console.log(`📤 Outbox worker: processed ${processed} events`);
        }
      } catch (err: any) {
        console.error('❌ Outbox worker error:', err.message);
      }

      if (running) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  poll();

  return () => {
    running = false;
  };
}