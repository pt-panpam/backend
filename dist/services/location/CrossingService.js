"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossingService = void 0;
const H3Service_1 = require("./H3Service");
const RedisService_1 = require("./RedisService");
const RouteService_1 = require("./RouteService");
const CrossEvent_1 = require("../../models/CrossEvent");
const User_1 = require("../../models/User");
const Friend_1 = require("../../models/Friend");
const Notification_1 = require("../../models/Notification");
const sequelize_1 = require("sequelize");
class CrossingService {
    static instance;
    io = null;
    onCrossingCallbacks = [];
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new CrossingService();
        }
        return this.instance;
    }
    setIO(io) {
        this.io = io;
    }
    onCrossing(callback) {
        this.onCrossingCallbacks.push(callback);
    }
    async updateLocation(userId, latitude, longitude) {
        const result = { crossingDetected: false, crossedWith: [], hexId: '' };
        // 1. Convert GPS to H3 hex
        const hexId = H3Service_1.H3Service.latLngToHex(latitude, longitude);
        result.hexId = hexId;
        const redis = RedisService_1.RedisService.getInstance();
        const route = RouteService_1.RouteService.getInstance();
        // 2. Store route point in PostgreSQL/TimescaleDB
        if (route.isAvailable()) {
            await route.insertRoutePoint({
                userId,
                latitude,
                longitude,
                hexId,
                recordedAt: new Date(),
            }).catch(() => { });
        }
        // 3. Update Redis with current hex
        if (redis.isAvailable()) {
            await redis.setUserLocation(userId, hexId);
        }
        // 4. Check for hex collisions — Redis path (fast)
        let occupants = [];
        if (redis.isAvailable()) {
            occupants = await redis.getHexOccupants(hexId, userId);
        }
        else {
            // Fallback: check recent CrossEvents in DB
            const recentEvents = await CrossEvent_1.CrossEvent.findAll({
                where: {
                    [sequelize_1.Op.or]: [{ user1Id: userId }, { user2Id: userId }],
                    crossedAt: { [sequelize_1.Op.gte]: new Date(Date.now() - 300000) }, // last 5 min
                },
            });
            const otherIds = new Set();
            for (const e of recentEvents) {
                otherIds.add(e.user1Id === userId ? e.user2Id : e.user1Id);
            }
            occupants = Array.from(otherIds);
        }
        // 5. For each potential cross, verify and persist
        if (occupants.length > 0) {
            const hexCenter = H3Service_1.H3Service.hexToCenter(hexId);
            const neighborHexes = H3Service_1.H3Service.getNeighborHexes(hexId, 1);
            // Get all neighbors' occupants too
            let allNearby = new Map();
            if (redis.isAvailable()) {
                allNearby = await redis.getUsersInHexes(neighborHexes, userId);
            }
            allNearby.set(hexId, occupants);
            const processedPairs = new Set();
            for (const [, members] of allNearby) {
                for (const otherId of members) {
                    const pairKey = [userId, otherId].sort().join(':');
                    if (processedPairs.has(pairKey))
                        continue;
                    processedPairs.add(pairKey);
                    const isFriend = await Friend_1.Friend.findOne({
                        where: {
                            [sequelize_1.Op.or]: [
                                { userId, friendId: otherId },
                                { userId: otherId, friendId: userId },
                            ],
                        },
                    });
                    // Create CrossEvent
                    try {
                        const event = await CrossEvent_1.CrossEvent.create({
                            user1Id: Math.min(userId, otherId),
                            user2Id: Math.max(userId, otherId),
                            latitude,
                            longitude,
                            crossedAt: new Date(),
                            published: false,
                        });
                        result.crossedWith.push(otherId);
                        result.crossingDetected = true;
                        // Store in TimescaleDB
                        if (route.isAvailable()) {
                            await route.insertCrossingRoute({
                                user1Id: Math.min(userId, otherId),
                                user2Id: Math.max(userId, otherId),
                                hexId,
                                lat1: userId === Math.min(userId, otherId) ? latitude : hexCenter.lat,
                                lng1: userId === Math.min(userId, otherId) ? longitude : hexCenter.lng,
                                lat2: userId === Math.max(userId, otherId) ? latitude : hexCenter.lat,
                                lng2: userId === Math.max(userId, otherId) ? longitude : hexCenter.lng,
                                crossedAt: new Date(),
                            }).catch(() => { });
                        }
                        // Publish to Redis Pub/Sub
                        await redis.publishCrossEvent(userId, otherId, hexId, latitude, longitude);
                        // Notify via WebSocket
                        if (this.io) {
                            const otherUser = await User_1.User.findByPk(otherId, {
                                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                            });
                            const eventData = {
                                id: event.id,
                                other_user: otherUser ? {
                                    id: otherUser.id,
                                    username: otherUser.username,
                                    first_name: otherUser.firstName,
                                    last_name: otherUser.lastName,
                                    profile_picture: otherUser.profilePicture,
                                } : null,
                                hex_id: hexId,
                                latitude: latitude,
                                longitude: longitude,
                                crossed_at: event.crossedAt,
                                is_friend: !!isFriend,
                            };
                            // Emit to both users
                            this.io.to(`user:${userId}`).emit('cross:detected', eventData);
                            this.io.to(`user:${otherId}`).emit('cross:detected', eventData);
                            // Create notification
                            if (!isFriend) {
                                try {
                                    await Notification_1.Notification.create({
                                        userId: otherId,
                                        type: 'cross_event',
                                        title: 'Cross Paths',
                                        body: `${(await User_1.User.findByPk(userId))?.firstName || 'Someone'} crossed your path nearby!`,
                                        actorId: userId,
                                    });
                                }
                                catch { }
                            }
                        }
                        // Fire callbacks
                        for (const cb of this.onCrossingCallbacks) {
                            cb({
                                user1Id: Math.min(userId, otherId),
                                user2Id: Math.max(userId, otherId),
                                hexId,
                                lat: latitude,
                                lng: longitude,
                                timestamp: new Date(),
                            });
                        }
                    }
                    catch (err) {
                        console.error('CrossingService: error creating event:', err);
                    }
                }
            }
        }
        return result;
    }
    async getRecentCrosses(userId, limit = 50) {
        const events = await CrossEvent_1.CrossEvent.findAll({
            where: {
                [sequelize_1.Op.or]: [{ user1Id: userId }, { user2Id: userId }],
            },
            order: [['crossed_at', 'DESC']],
            limit,
        });
        const userCache = new Map();
        const results = await Promise.all(events.map(async (e) => {
            const otherId = e.user1Id === userId ? e.user2Id : e.user1Id;
            if (!userCache.has(otherId)) {
                const u = await User_1.User.findByPk(otherId, {
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture', 'location'],
                });
                userCache.set(otherId, u);
            }
            const other = userCache.get(otherId);
            const isFriend = !!(await Friend_1.Friend.findOne({
                where: {
                    [sequelize_1.Op.or]: [
                        { userId, friendId: otherId },
                        { userId: otherId, friendId: userId },
                    ],
                },
            }));
            // Jitter non-friend locations
            let displayLat = e.latitude;
            let displayLng = e.longitude;
            if (!isFriend) {
                displayLat = e.latitude + (Math.random() - 0.5) * 0.02;
                displayLng = e.longitude + (Math.random() - 0.5) * 0.02;
            }
            return {
                id: e.id,
                other_user: other
                    ? {
                        id: other.id,
                        username: other.username,
                        first_name: other.firstName,
                        last_name: other.lastName,
                        profile_picture: other.profilePicture,
                        location: other.location,
                    }
                    : null,
                latitude: e.latitude,
                longitude: e.longitude,
                display_latitude: displayLat,
                display_longitude: displayLng,
                crossed_at: e.crossedAt,
                published: e.published,
                is_friend: isFriend,
            };
        }));
        return results;
    }
    async getUserRoute(userId) {
        const route = RouteService_1.RouteService.getInstance();
        if (!route.isAvailable())
            return [];
        const points = await route.getUserRoute(userId);
        return points.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            hex_id: p.hexId,
            recorded_at: p.recordedAt,
        }));
    }
    async getDashboardStats(userId) {
        const totalCrosses = await CrossEvent_1.CrossEvent.count({
            where: {
                [sequelize_1.Op.or]: [{ user1Id: userId }, { user2Id: userId }],
            },
        });
        const events = await CrossEvent_1.CrossEvent.findAll({
            where: {
                [sequelize_1.Op.or]: [{ user1Id: userId }, { user2Id: userId }],
            },
            attributes: ['user1Id', 'user2Id'],
        });
        const uniqueOthers = new Set();
        for (const e of events) {
            uniqueOthers.add(e.user1Id === userId ? e.user2Id : e.user1Id);
        }
        const todayCrosses = await CrossEvent_1.CrossEvent.count({
            where: {
                [sequelize_1.Op.or]: [{ user1Id: userId }, { user2Id: userId }],
                crossedAt: { [sequelize_1.Op.gte]: new Date(Date.now() - 86400000) },
            },
        });
        let currentHex = null;
        const redis = RedisService_1.RedisService.getInstance();
        if (redis.isAvailable()) {
            currentHex = await redis.getUserHex(userId);
        }
        return {
            totalCrosses,
            uniqueCrosses: uniqueOthers.size,
            todayCrosses,
            currentHex,
        };
    }
}
exports.CrossingService = CrossingService;
//# sourceMappingURL=CrossingService.js.map