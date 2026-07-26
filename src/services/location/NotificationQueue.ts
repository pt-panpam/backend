import { Queue, Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import { User } from '../../models/User';
import { CrossEvent } from '../../models/CrossEvent';
import { createAndDeliverNotification } from '../NotificationService';
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
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    });
  }
  return queue;
}

export function startNotificationQueue(): void {
  const worker = new Worker(
    'cross-notifications',
    async (job: Job) => {
      if (job.name === 'send-crossing-push') {
        const { eventId, userA, userB } = job.data;
        
        // 1. Verify Event and mark as Notified
        const event = await CrossEvent.findByPk(eventId);
        if (!event || event.notified) return;
        await event.update({ notified: true });

        // 2. Fetch Users
        const uA = await User.findByPk(userA, { attributes: ['id', 'lastName'] });
        const uB = await User.findByPk(userB, { attributes: ['id', 'lastName'] });
        if (!uA || !uB) return;

        // 3. Deliver Anonymous Push Notifications
        // Rule: Never reveal identity, time, or location.
        await createAndDeliverNotification({
          userId: userA,
          type: 'cross_event',
          title: 'Paths Crossed',
          body: `Someone crossed your path. Open the app to find out who.`,
          actorId: userB,
        });

        await createAndDeliverNotification({
          userId: userB,
          type: 'cross_event',
          title: 'Paths Crossed',
          body: `Someone crossed your path. Open the app to find out who.`,
          actorId: userA,
        });

        // 4. Trigger Socket Updates (Client fetches new sanitized list)
        const io = getIO();
        if (io) {
          io.to(`user:${userA}`).emit('cross:detected', { eventId });
          io.to(`user:${userB}`).emit('cross:detected', { eventId });
        }
      }
    },
    { connection: getConnectionOpts(), concurrency: 10 }
  );

  worker.on('completed', (job) => console.log(`✅ Notification job completed: ${job.id}`));
  worker.on('failed', (job, err) => console.error(`❌ Notification job failed: ${job?.id} - ${err.message}`));
  
  console.log('🔔 Privacy-First Notification queue consumer started');
}