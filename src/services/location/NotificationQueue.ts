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
  // Handler for old cross-notifications (encounter-based, from outbox worker)
  const worker = new Worker<{ encounterId: string; receiverId: number } | { userId: number; otherUserId: number }>(
    'cross-notifications',
    async (job: Job) => {
      if ('encounterId' in job.data) {
        // Old-style encounter notification
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
      } else {
        // New-style unlock notification — fired at exact unlock time
        const { userId, otherUserId } = job.data;
        const other = await User.findByPk(otherUserId, {
          attributes: ['id', 'firstName'],
        });
        const name = other?.firstName || 'Someone';

        await createAndDeliverNotification({
          userId,
          type: 'cross_recap',
          title: 'Profile Revealed',
          body: `${name}'s profile is now visible!`,
          actorId: otherUserId,
        });

        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit('cross:recap-ready', {
            timestamp: new Date().toISOString(),
          });
        }
      }
    },
    {
      connection: getConnectionOpts(),
      concurrency: 10,
    },
  );

  worker.on('completed', (job) => {
    const data = job.data as any;
    const id = data.encounterId || data.userId;
    console.log(`✅ Notification job completed: ${id}`);
  });

  worker.on('failed', (job, err) => {
    if (job) {
      const data = job.data as any;
      const id = data.encounterId || data.userId;
      console.error(`❌ Notification job failed: ${id} - ${err.message}`);
    }
  });
}

export function startNotificationQueue(): void {
  startConsumer();
  console.log('🔔 Notification queue consumer started');
}
