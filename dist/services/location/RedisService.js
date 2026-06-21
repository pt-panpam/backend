"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../../config/env");
const LOCATION_TTL = 300; // 5 minutes
const HEX_MEMBER_TTL = 300;
class RedisService {
    static instance;
    client = null;
    subscriber = null;
    status = 'disconnected';
    pubSubCallbacks = new Map();
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new RedisService();
        }
        return this.instance;
    }
    async connect() {
        try {
            this.client = new ioredis_1.default(env_1.env.REDIS_URL, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => {
                    if (times > 3)
                        return null;
                    return Math.min(times * 200, 2000);
                },
                lazyConnect: true,
                enableOfflineQueue: false,
            });
            this.client.on('error', () => { });
            this.subscriber = new ioredis_1.default(env_1.env.REDIS_URL, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => {
                    if (times > 3)
                        return null;
                    return Math.min(times * 200, 2000);
                },
                lazyConnect: true,
                enableOfflineQueue: false,
            });
            this.subscriber.on('error', () => { });
            await Promise.all([this.client.connect(), this.subscriber.connect()]);
            this.subscriber.on('message', (channel, message) => {
                const cb = this.pubSubCallbacks.get(channel);
                if (cb)
                    cb(message, channel);
            });
            this.status = 'connected';
            console.log('🟢 Redis connected');
            return true;
        }
        catch (err) {
            this.status = 'error';
            console.warn('🟡 Redis unavailable — crossing detection will use DB fallback');
            this.client = null;
            this.subscriber = null;
            return false;
        }
    }
    getStatus() {
        return this.status;
    }
    isAvailable() {
        return this.status === 'connected' && this.client !== null;
    }
    async setUserLocation(userId, hexId) {
        if (!this.isAvailable())
            return;
        try {
            await this.client.setex(`location:${userId}`, LOCATION_TTL, hexId);
            await this.client.sadd(`hex:${hexId}`, String(userId));
            await this.client.expire(`hex:${hexId}`, HEX_MEMBER_TTL);
        }
        catch (err) {
            console.error('Redis setUserLocation error:', err);
        }
    }
    async getHexOccupants(hexId, excludeUserId) {
        if (!this.isAvailable())
            return [];
        try {
            const members = await this.client.smembers(`hex:${hexId}`);
            return members
                .map(Number)
                .filter(id => id !== excludeUserId);
        }
        catch (err) {
            console.error('Redis getHexOccupants error:', err);
            return [];
        }
    }
    async getUserHex(userId) {
        if (!this.isAvailable())
            return null;
        try {
            return await this.client.get(`location:${userId}`);
        }
        catch {
            return null;
        }
    }
    async getUsersInHexes(hexIds, excludeUserId) {
        if (!this.isAvailable())
            return new Map();
        try {
            const pipe = this.client.pipeline();
            for (const hex of hexIds) {
                pipe.smembers(`hex:${hex}`);
            }
            const results = await pipe.exec();
            const map = new Map();
            if (!results)
                return map;
            results.forEach((res, i) => {
                if (res && Array.isArray(res[1])) {
                    const members = res[1]
                        .map(Number)
                        .filter(id => id !== excludeUserId);
                    if (members.length > 0) {
                        map.set(hexIds[i], members);
                    }
                }
            });
            return map;
        }
        catch (err) {
            console.error('Redis getUsersInHexes error:', err);
            return new Map();
        }
    }
    async publishCrossEvent(user1Id, user2Id, hexId, lat, lng) {
        if (!this.isAvailable())
            return;
        try {
            const payload = JSON.stringify({ user1Id, user2Id, hexId, lat, lng, timestamp: new Date().toISOString() });
            await this.client.publish('cross:detected', payload);
        }
        catch (err) {
            console.error('Redis publishCrossEvent error:', err);
        }
    }
    subscribe(channel, callback) {
        if (!this.isAvailable() || !this.subscriber)
            return;
        this.pubSubCallbacks.set(channel, callback);
        this.subscriber.subscribe(channel).catch(err => {
            console.error(`Redis subscribe error for ${channel}:`, err);
        });
    }
    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
        if (this.subscriber) {
            await this.subscriber.quit();
            this.subscriber = null;
        }
        this.status = 'disconnected';
    }
}
exports.RedisService = RedisService;
//# sourceMappingURL=RedisService.js.map