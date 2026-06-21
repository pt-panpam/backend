"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const models_1 = require("./models");
const errorHandler_1 = require("./middleware/errorHandler");
const socket_1 = require("./socket");
const io_1 = require("./io");
const RedisService_1 = require("./services/location/RedisService");
const RouteService_1 = require("./services/location/RouteService");
const CrossingService_1 = require("./services/location/CrossingService");
const auth_1 = __importDefault(require("./routes/auth"));
const friendship_1 = __importDefault(require("./routes/friendship"));
const posts_1 = __importDefault(require("./routes/posts"));
const chat_1 = __importDefault(require("./routes/chat"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const crosses_1 = __importDefault(require("./routes/crosses"));
const location_1 = __importDefault(require("./routes/location"));
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
// Middleware
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Static uploads
app.use('/uploads', express_1.default.static(path_1.default.resolve(__dirname, '..', env_1.env.UPLOAD_DIR)));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/friends', friendship_1.default);
app.use('/api/posts', posts_1.default);
app.use('/api/chat', chat_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/crosses', crosses_1.default);
app.use('/api/location', location_1.default);
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Error handler
app.use(errorHandler_1.errorHandler);
// Socket.io
const io = (0, socket_1.setupSocket)(server);
exports.io = io;
(0, io_1.setIO)(io);
async function start() {
    try {
        (0, models_1.initModels)(database_1.sequelize);
        await (0, database_1.initDatabase)();
        // Connect Redis
        const redis = RedisService_1.RedisService.getInstance();
        await redis.connect();
        // Connect PostgreSQL/TimescaleDB
        const route = RouteService_1.RouteService.getInstance();
        await route.connect();
        // Initialize CrossingService with Socket.IO
        CrossingService_1.CrossingService.getInstance().setIO(io);
        // Subscribe to Redis cross:detected for cross-instance events
        redis.subscribe('cross:detected', (message) => {
            try {
                const data = JSON.parse(message);
                io.to(`user:${data.user1Id}`).emit('cross:detected', data);
                io.to(`user:${data.user2Id}`).emit('cross:detected', data);
            }
            catch { }
        });
        // Cleanup old routes every hour
        setInterval(() => {
            route.cleanupOldRoutes().catch(() => { });
        }, 3600000);
        server.listen(env_1.env.PORT, '0.0.0.0', () => {
            console.log(`🚀 Node.js backend running on http://0.0.0.0:${env_1.env.PORT}`);
        });
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map