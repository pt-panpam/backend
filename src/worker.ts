import http from 'http';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { RedisService } from './services/location/RedisService';
import { CrossingService } from './services/location/CrossingService';
import { runProximityMigrations } from './services/location/pgDb';
import { startOutboxWorker } from './services/location/OutboxWorker';
import { startNotificationQueue } from './services/location/NotificationQueue';
import { CrossEvent } from './models/CrossEvent';
import { CrossSettings } from './models/CrossSettings';
import { Op } from 'sequelize';
import { createAndDeliverNotification } from './services/NotificationService';
import { StorageService } from './services/StorageService';
import { istDateStr } from './utils/timezone';
import { Post } from './models/Post';
import { PostPhoto } from './models/PostPhoto';
import { PostLike } from './models/PostLike';
import { Comment } from './models/Comment';
import { Notification } from './models/Notification';
import { Note } from './models/Note';
import { NoteVote } from './models/NoteVote';

async function startWorker() {
  try {
    initModels(sequelize);
    await initDatabase();

    const redis = RedisService.getInstance();
    await redis.connect();

    CrossingService.getInstance().setIO(null as any);

    await runProximityMigrations();
    startOutboxWorker();
    startNotificationQueue();

    console.log('🔧 Worker: cron jobs started');

    // 1. Cleanup old cross events every hour (retention: 3 days)
    setInterval(() => {
      CrossEvent.destroy({
        where: { crossedAt: { [Op.lt]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      }).catch(() => {});
    }, 3600000);

    // 2. Recap worker — fires every minute, unlocks crossings whose recapSlotTime has passed
    //    At 9AM IST (03:30 UTC) and 9PM IST (15:30 UTC) it also sends recap notifications
    let lastNotifiedPeriod: string | null = null;
    setInterval(async () => {
      try {
        const crossService = CrossingService.getInstance();
        const allUsers = await CrossSettings.findAll({ attributes: ['userId'] });
        const now = new Date();
        const todayStr = istDateStr(now);
        const h = now.getUTCHours();
        const m = now.getUTCMinutes();

        // Determine if this is a recap window (within 1 minute of 03:30 or 15:30 UTC)
        const isRecapWindow =
          (h === 3 && m === 30) ||
          (h === 15 && m === 30);
        const currentPeriod: 'am' | 'pm' = h < 12 ? 'am' : 'pm';
        const periodKey = `${todayStr}-${currentPeriod}`;

        let notifiedCount = 0;
        for (const s of allUsers) {
          try {
            const result = await crossService.generateAndStoreRecap(s.userId, todayStr, currentPeriod);

            if (isRecapWindow && lastNotifiedPeriod !== periodKey && result.events_processed > 0) {
              await createAndDeliverNotification({
                userId: s.userId,
                type: 'cross_recap',
                title: 'New Crosses Revealed',
                body: `Your recap for ${todayStr} is ready!`,
                actorId: s.userId,
              });
              notifiedCount++;
            }
          } catch {}
        }

        if (isRecapWindow && lastNotifiedPeriod !== periodKey) {
          lastNotifiedPeriod = periodKey;
          console.log(`✅ Recap worker notified ${notifiedCount} users at ${h}:${m} UTC`);
        }
      } catch (err) {
        console.error('❌ Recap worker error:', err);
      }
    }, 60000);

    // 3. Expired posts & chat media cleanup from R2 — every 10 minutes
    setInterval(async () => {
      try {
        const expiredPosts = await Post.findAll({
          where: { expiresAt: { [Op.lt]: new Date() } },
        });
        for (const post of expiredPosts) {
          const photos = await PostPhoto.findAll({ where: { postId: post.id } });
          for (const photo of photos) {
            if (StorageService.isR2Url(photo.image)) {
              await StorageService.deleteFile(photo.image);
            }
          }
          await Notification.destroy({ where: { postId: post.id } });
          await PostLike.destroy({ where: { postId: post.id } });
          await Comment.destroy({ where: { postId: post.id } });
          await PostPhoto.destroy({ where: { postId: post.id } });
          await post.destroy();
        }

        if (expiredPosts.length > 0) {
          console.log(`🧹 Cleaned up ${expiredPosts.length} expired posts from R2 & DB`);
        }
      } catch (err) {
        console.error('🧹 Cleanup worker error:', err);
      }
    }, 600000);

    // 4. Expired notes cleanup — every 10 minutes
    setInterval(async () => {
      try {
        const expiredNotes = await Note.findAll({
          where: { expiresAt: { [Op.lt]: new Date() } },
        });
        for (const note of expiredNotes) {
          await NoteVote.destroy({ where: { noteId: note.id } });
          await note.destroy();
        }

        if (expiredNotes.length > 0) {
          console.log(`🧹 Cleaned up ${expiredNotes.length} expired notes from DB`);
        }
      } catch (err) {
        console.error('🧹 Note cleanup worker error:', err);
      }
    }, 600000);
  } catch (err) {
    console.error('Failed to start worker:', err);
    process.exit(1);
  }
}

startWorker();
