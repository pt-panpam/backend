import http from 'http';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { RedisService } from './services/location/RedisService';
import { RouteService } from './services/location/RouteService';
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

async function startWorker() {
  try {
    initModels(sequelize);
    await initDatabase();

    const redis = RedisService.getInstance();
    await redis.connect();

    const route = RouteService.getInstance();
    await route.connect();

    CrossingService.getInstance().setIO(null as any);

    await runProximityMigrations();
    startOutboxWorker();
    startNotificationQueue();

    console.log('🔧 Worker: cron jobs started');

    // 1. Cleanup old route points & cross events every hour (retention: 3 days)
    setInterval(() => {
      route.cleanupOldRoutes().catch(() => {});
      CrossEvent.destroy({
        where: { crossedAt: { [Op.lt]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      }).catch(() => {});
    }, 3600000);

    // 2. Recap worker — fires at exactly 03:30 UTC (9:00 AM IST) and 15:30 UTC (9:00 PM IST)
    setInterval(async () => {
      const now = new Date();
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      if (!((h === 3 && m === 30) || (h === 15 && m === 30))) return;

      try {
        const crossService = CrossingService.getInstance();
        const allUserIds = await CrossSettings.findAll({ attributes: ['userId'] });
        const todayStr = istDateStr(now);
        const period: 'am' | 'pm' = h < 12 ? 'am' : 'pm';

        let notifiedCount = 0;
        for (const s of allUserIds) {
          try {
            await crossService.generateAndStoreRecap(s.userId, todayStr, period);
            await createAndDeliverNotification({
              userId: s.userId,
              type: 'cross_recap',
              title: 'New Crosses Revealed',
              body: `Your recap for ${todayStr} is ready!`,
              actorId: s.userId,
            });
            notifiedCount++;
          } catch {}
        }

        console.log(`✅ Recap worker notified ${notifiedCount} users at ${h}:${m} UTC`);

        for (const s of allUserIds) {
          await redis.clearRoutePoints(s.userId).catch(() => {});
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
  } catch (err) {
    console.error('Failed to start worker:', err);
    process.exit(1);
  }
}

startWorker();
