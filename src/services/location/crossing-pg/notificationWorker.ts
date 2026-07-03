import { query } from './db';

// ---------------------------------------------------------------------------
// Notification Worker (The Queue Consumer)
//
// When the timer (BullMQ, setTimeout, etc.) fires, this function is called.
// It uses PostgreSQL's RETURNING clause to atomically check-and-update the
// notification row. If sent_at was already populated, the UPDATE affects 0
// rows and we skip the push notification — guaranteeing idempotency.
//
// This is the "Targeted Update" pattern from the architecture doc.
// ---------------------------------------------------------------------------

export interface NotificationJob {
  encounterId: string;
  receiverId: number;
  crosserId: number;
}

/**
 * Attempt to claim and send a notification.
 *
 * Uses a single atomic UPDATE ... WHERE sent_at IS NULL RETURNING id.
 * If the row was already claimed (sent_at is set), the UPDATE affects 0 rows
 * and we skip sending — this handles retries from crashed workers perfectly.
 *
 * @returns true if the notification was claimed and should be sent.
 */
export async function claimAndSendNotification(
  job: NotificationJob,
): Promise<boolean> {
  const { encounterId, receiverId } = job;

  // -----------------------------------------------------------------------
  // PostgreSQL superpower: UPDATE ... RETURNING
  //
  // We do the Check AND Update in a single atomic SQL query.
  // If sent_at is already populated, it will update 0 rows.
  // -----------------------------------------------------------------------
  const { rowCount } = await query(
    `UPDATE notifications
     SET sent_at = NOW()
     WHERE encounter_id = $1
       AND receiver_id = $2
       AND sent_at IS NULL
     RETURNING id`,
    [encounterId, receiverId],
  );

  // Idempotency check:
  //   - rowCount === 1 → we successfully claimed this notification → send it.
  //   - rowCount === 0 → already sent (worker crashed and retried) → skip.
  return rowCount === 1;
}

/**
 * Poll for notifications whose notify_at has passed and that haven't been sent.
 * This is a fallback for environments without a proper queue (BullMQ/SQS).
 *
 * Uses the same atomic UPDATE ... RETURNING pattern for safety.
 *
 * @param batchSize  Max notifications to process per poll (default 50).
 * @returns          Number of notifications sent.
 */
export async function processDueNotifications(
  batchSize: number = 50,
): Promise<number> {
  // -----------------------------------------------------------------------
  // Step 1: Atomically claim due notifications using a CTE (Common Table
  // Expression). This is a "SELECT ... FOR UPDATE SKIP LOCKED" pattern
  // adapted for the notifications table.
  //
  // The CTE locks the rows, then the UPDATE claims them.
  // -----------------------------------------------------------------------
  const { rows } = await query(
    `WITH claimed AS (
       SELECT id, encounter_id, receiver_id, crosser_id
       FROM notifications
       WHERE notify_at <= NOW()
         AND sent_at IS NULL
       ORDER BY notify_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE notifications n
     SET sent_at = NOW()
     FROM claimed
     WHERE n.id = claimed.id
     RETURNING n.id, n.encounter_id, n.receiver_id, n.crosser_id`,
    [batchSize],
  );

  if (rows.length === 0) return 0;

  // For each claimed notification, send the push notification.
  // In production, you'd batch these or send via a push service.
  for (const row of rows) {
    try {
      await sendPushNotification(row.receiver_id, row.crosser_id);
    } catch (err) {
      console.error(
        `❌ Failed to send push for notification ${row.id}:`,
        err,
      );
    }
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Push notification sender (stub — replace with your actual push logic)
// ---------------------------------------------------------------------------

/**
 * Send a push notification to the receiver about a cross event.
 *
 * In production, replace this with your actual push notification service
 * (Firebase Cloud Messaging, Expo Push, APNs, etc.).
 */
async function sendPushNotification(
  receiverId: number,
  crosserId: number,
): Promise<void> {
  // TODO: Look up the receiver's push token and send the notification.
  // Example:
  //   const user = await User.findByPk(receiverId, { attributes: ['expoPushToken'] });
  //   if (user?.expoPushToken) {
  //     await fetch('https://exp.host/--/api/v2/push/send', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         to: user.expoPushToken,
  //         title: 'Cross Paths',
  //         body: `Someone crossed your path!`,
  //         data: { crosserId },
  //       }),
  //     });
  //   }

  // For now, just log it.
  console.log(
    `🔔 Would send push to user ${receiverId} about crosser ${crosserId}`,
  );
}

/**
 * Start a continuous polling loop that processes due notifications.
 *
 * @param intervalMs Polling interval in milliseconds (default 5000).
 * @param batchSize  Max notifications per poll (default 50).
 * @returns          A function that stops the polling loop.
 */
export function startNotificationPolling(
  intervalMs: number = 5000,
  batchSize: number = 50,
): () => void {
  let running = true;

  async function poll(): Promise<void> {
    while (running) {
      try {
        const sent = await processDueNotifications(batchSize);
        if (sent > 0) {
          console.log(`🔔 Notification worker: sent ${sent} notifications`);
        }
      } catch (err: any) {
        console.error('❌ Notification worker error:', err.message);
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