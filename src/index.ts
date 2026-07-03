import express from 'express';
import cors from 'cors';
import http from 'http';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { errorHandler } from './middleware/errorHandler';
import { setupSocket } from './socket';
import { setIO } from './io';
import { RedisService } from './services/location/RedisService';
import { RouteService } from './services/location/RouteService';
import { CrossingService } from './services/location/CrossingService';
import { CrossEvent } from './models/CrossEvent';
import { Op } from 'sequelize';
import { createAndDeliverNotification } from './services/NotificationService';
import { StorageService } from './services/StorageService';
import { User } from './models/User';
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

    // Subscribe to Redis cross:detected for cross-instance events
    redis.subscribe('cross:detected', (message) => {
      try {
        const data = JSON.parse(message);
        io.to(`user:${data.user1Id}`).emit('cross:detected', data);
        io.to(`user:${data.user2Id}`).emit('cross:detected', data);
      } catch {}
    });

    // Cleanup old route points & cross events every hour (retention: 3 days)
    setInterval(() => {
      route.cleanupOldRoutes().catch(() => {});
      CrossEvent.destroy({
        where: { crossedAt: { [Op.lt]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      }).catch(() => {});
    }, 3600000);

    // Add notified column if not exists (for migration)
    sequelize.query(
      `ALTER TABLE cross_events ADD COLUMN notified BOOLEAN DEFAULT 0;`
    ).catch(() => {});

    // 30-min delayed cross notification worker — check every 60s
    setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000);
        const pending = await CrossEvent.findAll({
          where: {
            notified: false,
            crossedAt: { [Op.lte]: cutoff },
          },
        });
        for (const ev of pending) {
          try {
            const user1 = await User.findByPk(ev.user1Id, { attributes: ['id', 'firstName', 'profilePicture'] });
            const user2 = await User.findByPk(ev.user2Id, { attributes: ['id', 'firstName', 'profilePicture'] });
            const timeStr = ev.crossedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            // Notify user2 that user1 crossed them
            if (user1) {
              await createAndDeliverNotification({
                userId: ev.user2Id,
                type: 'cross_event',
                title: 'Cross Paths',
                body: `${user1.firstName || 'Someone'} crossed you at ${timeStr}`,
                actorId: ev.user1Id,
              });
            }

            // Notify user1 that user2 crossed them
            if (user2) {
              await createAndDeliverNotification({
                userId: ev.user1Id,
                type: 'cross_event',
                title: 'Cross Paths',
                body: `${user2.firstName || 'Someone'} crossed you at ${timeStr}`,
                actorId: ev.user2Id,
              });
            }

            ev.notified = true;
            await ev.save();
          } catch (err) {
            console.error('Delayed notify error for event', ev.id, err);
          }
        }
      } catch (err) {
        console.error('Delayed notification worker error:', err);
      }
    }, 60000);

    // Recap worker — snapshot recap at 9:00 and 21:00 daily
    let lastRecapRun: string | null = null;
    setInterval(async () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      if (m !== 0 || (h !== 9 && h !== 21)) return;
      const key = `${now.toISOString().split('T')[0]}-${h}`;
      if (lastRecapRun === key) return;
      lastRecapRun = key;

      console.log(`🔄 Recap worker at ${now.toISOString()}`);

      try {
        const period: 'am' | 'pm' = h === 9 ? 'am' : 'pm';
        const todayStr = now.toISOString().split('T')[0];
        const crossService = CrossingService.getInstance();

        const prevSlot = new Date(now);
        if (h === 9) {
          prevSlot.setHours(21, 0, 0, 0);
          prevSlot.setDate(prevSlot.getDate() - 1);
        } else {
          prevSlot.setHours(9, 0, 0, 0);
        }

        const events = await CrossEvent.findAll({
          where: { crossedAt: { [Op.between]: [prevSlot, now] } },
        });

        const userIds = new Set<number>();
        for (const e of events) {
          userIds.add(e.user1Id);
          userIds.add(e.user2Id);
        }

        let notifiedCount = 0;
        for (const userId of userIds) {
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

          io.to(`user:${userId}`).emit('cross:recap-ready', {
            date: todayStr,
            timestamp: now.toISOString(),
          });
        }

        if (notifiedCount > 0) {
          console.log(`✅ Recap worker stored recaps and notified ${notifiedCount} users`);
        }

        // At 9pm recap, emit route:reset so frontend clears local trail for a fresh start
        // (PG data stays for 3-day history; only ephemeral Redis + frontend storage reset)
        if (h === 21) {
          try {
            const redis = RedisService.getInstance();
            for (const userId of userIds) {
              await redis.clearRoutePoints(userId).catch(() => {});
            }
          } catch {}
          for (const userId of userIds) {
            io.to(`user:${userId}`).emit('route:reset', { timestamp: now.toISOString() });
          }
          console.log(`🗑️ Route trails reset for ${userIds.size} users after 9pm recap`);
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
