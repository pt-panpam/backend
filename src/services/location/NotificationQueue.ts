import { Queue, Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import { EncounterService } from './EncounterService';

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
      // The single source of truth for dynamic profile reveal pushes
      if (job.name === 'send-encounter-push') {
        await EncounterService.getInstance().handleEncounterPush(job.data);
      }
    },
    { connection: getConnectionOpts(), concurrency: 10 }
  );

  worker.on('completed', (job) => console.log(`✅ Notification job completed: ${job.id}`));
  worker.on('failed', (job, err) => console.error(`❌ Notification job failed: ${job?.id} - ${err.message}`));
  
  console.log('🔔 Privacy-First Notification queue consumer started');
}