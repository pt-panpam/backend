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
import { StorageService } from './services/StorageService';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

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

    // Rate limiters — backed by Redis so limits are shared across instances
    const redisClient = redis.getPubClient()!;
    const sendCommand = (...args: string[]) => redisClient.call(...(args as [string, ...string[]])) as any;

    const globalLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({ sendCommand, prefix: 'rl:global:' }),
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({ sendCommand, prefix: 'rl:auth:' }),
    });

    const locationLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({ sendCommand, prefix: 'rl:loc:' }),
    });

    app.use(globalLimiter);
    app.use('/api/auth', authLimiter);
    app.use('/api/location', locationLimiter);

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