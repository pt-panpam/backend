import { Queue, Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import { User } from '../../models/User';
import { createAndDeliverNotification } from '../NotificationService';
import { ProximityService } from './ProximityService';
import { pool } from './pgDb';
import { getIO } from '../../io';

function getConnectionOpts() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || '6379'),
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

let queue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!queue) {
    queue = new Queue('cross-notifications', {
      connection: getConnectionOpts(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return queue;
}

function startConsumer(): void {
  const worker = new Worker<{ encounterId: string; receiverId: number }>(
    'cross-notifications',
    async (job: Job) => {
      const { encounterId, receiverId } = job.data;

      const proximity = ProximityService.getInstance();

      await proximity.markNotificationSent(encounterId, receiverId);

      const { rows } = await pool.query(
        `SELECT crosser_id FROM encounter_notifications
         WHERE encounter_id = $1 AND receiver_id = $2`,
        [encounterId, receiverId],
      );
      if (rows.length === 0) return;
      const crosserId = rows[0].crosser_id;

      const crosser = await User.findByPk(crosserId, {
        attributes: ['id', 'firstName'],
      });

      await createAndDeliverNotification({
        userId: receiverId,
        type: 'cross_event',
        title: 'Cross Paths',
        body: `${crosser?.firstName || 'Someone'} crossed you earlier today`,
        actorId: crosserId,
      });

      const io = getIO();
      if (io) {
        io.to(`user:${receiverId}`).emit('cross:detected', { encounterId });
      }
    },
    {
      connection: getConnectionOpts(),
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    console.log(`✅ Notification sent for encounter ${job.data.encounterId} → user ${job.data.receiverId}`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      console.error(`❌ Notification failed for encounter ${job.data.encounterId}:`, err.message);
    }
  });
}

export function startNotificationQueue(): void {
  startConsumer();
  console.log('🔔 Notification queue consumer started');
}
