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
import { getDatePartsInIST, istDateStr } from './utils/timezone';
import { Post } from './models/Post';
import { PostPhoto } from './models/PostPhoto';
import { PostLike } from './models/PostLike';
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
import safeZoneRoutes from './routes/safezones';
import noteRoutes from './routes/notes';
import heatmapRoutes from './routes/heatmap';

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
app.use('/api/safe-zones', safeZoneRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/heatmap', heatmapRoutes);

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

    // Recap worker — fires at exactly 03:30 UTC (9:00 AM IST) and 15:30 UTC (9:00 PM IST)
    setInterval(async () => {
      const now = new Date();
      const h = now.getUTCHours();
      const m = now.getUTCMinutes();
      // Trigger only at 03:30 or 15:30 UTC (within ±30s window)
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

        // Reset route trails for a fresh start
        const redis = RedisService.getInstance();
        for (const s of allUserIds) {
          try {
            await redis.clearRoutePoints(s.userId).catch(() => {});
            io.to(`user:${s.userId}`).emit('route:reset', { timestamp: now.toISOString() });
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