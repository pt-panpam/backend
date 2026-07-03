/**
 * PostgreSQL-native crossing system.
 *
 * This module replaces the MongoDB-style approach with proper relational
 * PostgreSQL patterns:
 *
 *   - Normalized tables (presences, encounters, notifications, outbox_events)
 *   - ACID transactions for all write operations
 *   - ON CONFLICT DO NOTHING RETURNING for idempotent encounter creation
 *   - FOR UPDATE SKIP LOCKED for safe concurrent outbox processing
 *   - UPDATE ... RETURNING for atomic claim-and-send notification delivery
 */

export { crossingPool, getClient, query } from './db';
export { migrateSchema } from './schema';
export { enterHexagon, leaveHexagon } from './engine';
export type { EnterHexagonResult } from './engine';
export {
  processOutbox,
  startOutboxPolling,
} from './outboxWorker';
export type { OutboxEvent, OutboxHandler } from './outboxWorker';
export {
  claimAndSendNotification,
  processDueNotifications,
  startNotificationPolling,
} from './notificationWorker';
export type { NotificationJob } from './notificationWorker';