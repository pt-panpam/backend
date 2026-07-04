import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { errorHandler } from './middleware/errorHandler';
import { setupSocket } from './socket';
import { setIO } from './io';
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
import { Post } from './models/Post';
import { PostPhoto } from './models/PostPhoto';
import { PostLike } from './models/PostLike';
import { SavedPost } from './models/SavedPost';
import { Comment } from './models/Comment';
import { Notification } from './models/Notification';
import { Message } from './models/Message';
import { Conversation } from './models/Conversation';

import authRoutes from './routes/auth';
import friendshipRoutes from './routes/friendship';
import postRoutes from './routes/posts';
import chatRoutes from './routes/chat';
import notificationRoutes from './routes/notifications';
import crossRoutes from './routes/crosses';
import locationRoutes from './routes/location';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendshipRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/crosses', crossRoutes);
app.use('/api/location', locationRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// R2 connectivity test (uploads a tiny test file, verifies public URL, then cleans up)
function checkUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    }).on('error', () => resolve(false));
  });
}

app.get('/api/health/r2', async (_req, res) => {
  try {
    const url = await StorageService.uploadFile(Buffer.from('ok'), 'test.txt', 'text/plain', '_healthcheck');
    const urlAccessible = await checkUrl(url);
    await StorageService.deleteFile(url);
    res.json({
      status: urlAccessible ? 'ok' : 'degraded',
      message: urlAccessible
        ? 'R2 upload, public URL, & delete all working'
        : 'Upload works but public URL is not accessible — enable bucket public access in Cloudflare dashboard',
      url,
      url_accessible: urlAccessible,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Error handler
app.use(errorHandler);

// Socket.io
const io = setupSocket(server);
setIO(io);

async function start() {
  try {
    initModels(sequelize);
    await initDatabase();

    // Connect Redis
    const redis = RedisService.getInstance();
    await redis.connect();

    // Connect PostgreSQL/TimescaleDB
    const route = RouteService.getInstance();
    await route.connect();

    // Initialize CrossingService with Socket.IO
    CrossingService.getInstance().setIO(io);

    // Run proximity schema migration (presences, encounters, outbox — idempotent)
    await runProximityMigrations();

    // Start outbox relay worker (SKIP LOCKED → BullMQ)
    startOutboxWorker();

    // Start BullMQ notification queue consumer
    startNotificationQueue();

    // Cleanup old route points & cross events every hour (retention: 3 days)
    setInterval(() => {
      route.cleanupOldRoutes().catch(() => {});
      CrossEvent.destroy({
        where: { crossedAt: { [Op.lt]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      }).catch(() => {});
    }, 3600000);

    // Recap worker — check every 60s for users whose recap time has passed
    let recapLastRun: string | null = null;
    setInterval(async () => {
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      const key = `${now.toISOString().split('T')[0]}-${currentMinute}`;
      if (recapLastRun === key) return;
      recapLastRun = key;

      try {
        const crossService = CrossingService.getInstance();
        const allSettings = await CrossSettings.findAll({ attributes: ['userId', 'revealScheduleHour1', 'revealScheduleHour2'] });

        // Also include users with no settings (default 9 and 21)
        const defaultHours = [9, 21];
        const userRecapMap = new Map<number, { hour1: number; hour2: number }>();
        for (const s of allSettings) {
          userRecapMap.set(s.userId, { hour1: s.revealScheduleHour1, hour2: s.revealScheduleHour2 });
        }

        const matchedUserIds = new Set<number>();
        for (const [userId, hours] of userRecapMap) {
          if (currentMinute === hours.hour1 * 60 || currentMinute === hours.hour2 * 60) {
            matchedUserIds.add(userId);
          }
        }

        let notifiedCount = 0;
        for (const userId of matchedUserIds) {
          const todayStr = now.toISOString().split('T')[0];
          const period: 'am' | 'pm' = currentMinute < 12 * 60 ? 'am' : 'pm';

          try {
            await crossService.generateAndStoreRecap(userId, todayStr, period);
          } catch {}

          try {
            await createAndDeliverNotification({
              userId,
              type: 'cross_recap',
              title: 'New Crosses Revealed',
              body: `Your daily recap for ${todayStr} is ready!`,
              actorId: userId,
            });
            notifiedCount++;
          } catch {}

          try {
            io.to(`user:${userId}`).emit('cross:recap-ready', {
              date: todayStr,
              timestamp: now.toISOString(),
            });
          } catch {}
        }

        if (notifiedCount > 0) {
          console.log(`✅ Recap worker notified ${notifiedCount} users`);
        }

        // At each user's recap time, also reset their route trail for a fresh start
        for (const userId of matchedUserIds) {
          try {
            const redis = RedisService.getInstance();
            await redis.clearRoutePoints(userId).catch(() => {});
            io.to(`user:${userId}`).emit('route:reset', { timestamp: now.toISOString() });
          } catch {}
        }
      } catch (err) {
        console.error('❌ Recap worker error:', err);
      }
    }, 60000);

    // Expired posts & chat media cleanup from R2 — every 10 minutes
    setInterval(async () => {
      try {
        // 1. Expired posts — delete media from R2 then remove DB records
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
          await SavedPost.destroy({ where: { postId: post.id } });
          await PostPhoto.destroy({ where: { postId: post.id } });
          await post.destroy();
        }

        // 2. Disappearing chat media — delete from R2 then remove expired records
        const conversations = await Conversation.findAll({
          where: { disappearingMinutes: { [Op.gt]: 0 } },
        });
        for (const conv of conversations) {
          const cutoff = new Date(Date.now() - conv.disappearingMinutes * 60 * 1000);
          const expiredMessages = await Message.findAll({
            where: {
              conversationId: conv.id,
              created_at: { [Op.lt]: cutoff },
              [Op.or]: [
                { image: { [Op.ne]: null } },
                { audio: { [Op.ne]: null } },
              ],
            },
          });
          for (const msg of expiredMessages) {
            if (StorageService.isR2Url(msg.image)) {
              await StorageService.deleteFile(msg.image);
            }
            if (StorageService.isR2Url(msg.audio)) {
              await StorageService.deleteFile(msg.audio);
            }
          }
          if (expiredMessages.length > 0) {
            await Message.destroy({
              where: { id: { [Op.in]: expiredMessages.map(m => m.id) } },
            });
          }
        }

        if (expiredPosts.length > 0) {
          console.log(`🧹 Cleaned up ${expiredPosts.length} expired posts from R2 & DB`);
        }
      } catch (err) {
        console.error('🧹 Cleanup worker error:', err);
      }
    }, 600000);

    server.listen(env.PORT, '0.0.0.0', () => {
      console.log(`🚀 Node.js backend running on http://0.0.0.0:${env.PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { app, server, io };
