import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { env } from './config/env';
import { sequelize, initDatabase } from './config/database';
import { initModels } from './models';
import { errorHandler } from './middleware/errorHandler';
import { setupSocket } from './socket';
import { setIO } from './io';
import { RedisService } from './services/location/RedisService';
import { RouteService } from './services/location/RouteService';
import { CrossingService } from './services/location/CrossingService';

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

// Static uploads
app.use('/uploads', express.static(path.resolve(__dirname, '..', env.UPLOAD_DIR)));

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

    // Cleanup old routes every hour
    setInterval(() => {
      route.cleanupOldRoutes().catch(() => {});
    }, 3600000);

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
