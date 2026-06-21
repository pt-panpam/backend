"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocket = setupSocket;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("./config/env");
const User_1 = require("./models/User");
const Conversation_1 = require("./models/Conversation");
const Message_1 = require("./models/Message");
const ConversationReadStatus_1 = require("./models/ConversationReadStatus");
function setupSocket(server) {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.env.CORS_ORIGINS,
            credentials: true,
        },
    });
    // Track online users: userId -> Set<socketId>
    const onlineUsers = new Map();
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
            const user = await User_1.User.findByPk(decoded.userId);
            if (!user || !user.isActive) {
                return next(new Error('Invalid user'));
            }
            socket.userId = user.id;
            socket.username = user.username;
            next();
        }
        catch {
            next(new Error('Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.userId;
        // Track online status
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socket.id);
        // Join personal room for direct messages
        socket.join(`user:${userId}`);
        // Broadcast online status
        io.emit('user:online', { userId });
        // Join conversation rooms
        socket.on('conversation:join', (conversationId) => {
            socket.join(`conversation:${conversationId}`);
        });
        socket.on('conversation:leave', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
        });
        // Send message
        socket.on('message:send', async (data, callback) => {
            try {
                let convId = data.conversationId;
                if (!convId && data.receiverId) {
                    // Find or create conversation
                    const allConvs = await Conversation_1.Conversation.findAll({
                        include: [{
                                model: User_1.User,
                                as: 'participants',
                                through: { attributes: [] },
                            }],
                    });
                    const existing = allConvs.find(c => c.participants?.length === 2 &&
                        c.participants?.some((p) => p.id === userId) &&
                        c.participants?.some((p) => p.id === data.receiverId));
                    if (existing) {
                        convId = existing.id;
                    }
                    else {
                        const conv = await Conversation_1.Conversation.create();
                        await conv.setParticipants([userId, data.receiverId]);
                        convId = conv.id;
                    }
                }
                if (!convId) {
                    callback?.({ error: 'No conversation specified' });
                    return;
                }
                const msg = await Message_1.Message.create({
                    conversationId: convId,
                    senderId: userId,
                    text: data.text || '',
                    image: data.image || null,
                });
                await Conversation_1.Conversation.update({ updated_at: new Date() }, { where: { id: convId } });
                const full = await Message_1.Message.findByPk(msg.id, {
                    include: [{ model: User_1.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'profilePicture'] }],
                });
                const messageData = {
                    id: msg.id,
                    conversation: convId,
                    sender: {
                        id: full?.sender?.id,
                        first_name: full?.sender?.firstName,
                        profile_picture: full?.sender?.profilePicture,
                    },
                    text: msg.text,
                    image: msg.image,
                    is_read: msg.isRead,
                    created_at: msg.created_at,
                };
                // Emit to conversation room
                io.to(`conversation:${convId}`).emit('message:new', messageData);
                // Also emit to receiver's personal room
                if (data.receiverId) {
                    io.to(`user:${data.receiverId}`).emit('message:new', messageData);
                    io.to(`user:${data.receiverId}`).emit('conversation:updated', { conversationId: convId });
                }
                callback?.({ success: true, message: messageData });
            }
            catch (err) {
                callback?.({ error: err.message });
            }
        });
        // Mark messages as read
        socket.on('message:read', async (data) => {
            try {
                const lastMsg = await Message_1.Message.findOne({
                    where: { conversationId: data.conversationId },
                    order: [['created_at', 'DESC']],
                });
                if (lastMsg) {
                    await ConversationReadStatus_1.ConversationReadStatus.upsert({
                        conversationId: data.conversationId,
                        userId,
                        lastReadMessageId: lastMsg.id,
                    });
                }
                io.to(`conversation:${data.conversationId}`).emit('message:read-receipt', {
                    conversationId: data.conversationId,
                    userId,
                });
            }
            catch (err) {
                console.error('Error marking read:', err.message);
            }
        });
        // Typing indicators
        socket.on('typing:start', (data) => {
            socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
                conversationId: data.conversationId,
                userId,
                username: socket.username,
            });
        });
        socket.on('typing:stop', (data) => {
            socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
                conversationId: data.conversationId,
                userId,
            });
        });
        // Call signaling
        socket.on('call:offer', (data) => {
            io.to(`user:${data.calleeId}`).emit('call:offer', {
                callerId: userId,
                callerUsername: socket.username,
                offer: data.offer,
            });
        });
        socket.on('call:answer', (data) => {
            io.to(`user:${data.callerId}`).emit('call:answer', {
                calleeId: userId,
                answer: data.answer,
            });
        });
        socket.on('call:ice-candidate', (data) => {
            io.to(`user:${data.userId}`).emit('call:ice-candidate', {
                from: userId,
                candidate: data.candidate,
            });
        });
        socket.on('call:end', (data) => {
            io.to(`user:${data.userId}`).emit('call:end', { userId });
        });
        // Cross detection — subscribe to real-time crossing events
        socket.on('cross:subscribe', () => {
            socket.join(`cross:${userId}`);
        });
        socket.on('cross:unsubscribe', () => {
            socket.leave(`cross:${userId}`);
        });
        // Start location sharing (periodic location push from client)
        socket.on('location:start', () => {
            socket.join(`location:${userId}`);
            io.emit('location:sharing-started', { userId });
        });
        socket.on('location:stop', () => {
            socket.leave(`location:${userId}`);
            io.emit('location:sharing-stopped', { userId });
        });
        // Client sends location update via WS (alternative to REST)
        socket.on('location:update', async (data) => {
            try {
                const { H3Service } = await Promise.resolve().then(() => __importStar(require('./services/location/H3Service')));
                const { CrossingService } = await Promise.resolve().then(() => __importStar(require('./services/location/CrossingService')));
                const hexId = H3Service.latLngToHex(data.latitude, data.longitude);
                const crossing = CrossingService.getInstance();
                const result = await crossing.updateLocation(userId, data.latitude, data.longitude);
                // Echo back to sender
                socket.emit('location:updated', {
                    hex_id: result.hexId,
                    crossing_detected: result.crossingDetected,
                    crossed_with: result.crossedWith,
                });
            }
            catch (err) {
                console.error('location:update error:', err.message);
            }
        });
        // Disconnect
        socket.on('disconnect', () => {
            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    io.emit('user:offline', { userId });
                }
            }
        });
    });
    return io;
}
//# sourceMappingURL=socket.js.map