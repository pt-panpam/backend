import Redis from 'ioredis';
import { env } from '../../config/env';

const LOCATION_TTL = 300; // 5 minutes
const HEX_MEMBER_TTL = 300;

export type RedisStatus = 'connected' | 'disconnected' | 'error';

export class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private status: RedisStatus = 'disconnected';
  private pubSubCallbacks: Map<string, (message: string, channel: string) => void> = new Map();

  private constructor() {}

  static getInstance(): RedisService {
    if (!this.instance) {
      this.instance = new RedisService();
    }
    return this.instance;
  }

  async connect(): Promise<boolean> {
    try {
      const redisOpts = {
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        tls: env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
      } as any;

      this.client = new Redis(env.REDIS_URL, redisOpts);
      this.client.on('error', () => {});

      this.subscriber = new Redis(env.REDIS_URL, redisOpts);
      this.subscriber.on('error', () => {});

      await Promise.all([this.client.connect(), this.subscriber.connect()]);

      this.subscriber.on('message', (channel: string, message: string) => {
        const cb = this.pubSubCallbacks.get(channel);
        if (cb) cb(message, channel);
      });

      this.status = 'connected';
      console.log('🟢 Redis connected');
      return true;
    } catch (err: any) {
      this.status = 'error';
      console.warn('🟡 Redis unavailable —', err.message || err);
      this.client = null;
      this.subscriber = null;
      return false;
    }
  }

  getStatus(): RedisStatus {
    return this.status;
  }

  isAvailable(): boolean {
    return this.status === 'connected' && this.client !== null;
  }

  async setUserLocation(userId: number, hexId: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.client!.setex(`location:${userId}`, LOCATION_TTL, hexId);
      await this.client!.sadd(`hex:${hexId}`, String(userId));
      await this.client!.expire(`hex:${hexId}`, HEX_MEMBER_TTL);
    } catch (err) {
      console.error('Redis setUserLocation error:', err);
    }
  }

  async getHexOccupants(hexId: string, excludeUserId?: number): Promise<number[]> {
    if (!this.isAvailable()) return [];
    try {
      const members = await this.client!.smembers(`hex:${hexId}`);
      return members
        .map(Number)
        .filter(id => id !== excludeUserId);
    } catch (err) {
      console.error('Redis getHexOccupants error:', err);
      return [];
    }
  }

  async getUserHex(userId: number): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(`location:${userId}`);
    } catch {
      return null;
    }
  }

  async getUsersInHexes(hexIds: string[], excludeUserId?: number): Promise<Map<string, number[]>> {
    if (!this.isAvailable()) return new Map();
    try {
      const pipe = this.client!.pipeline();
      for (const hex of hexIds) {
        pipe.smembers(`hex:${hex}`);
      }
      const results = await pipe.exec();
      const map = new Map<string, number[]>();
      if (!results) return map;
      results.forEach((res, i) => {
        if (res && Array.isArray(res[1])) {
          const members = (res[1] as string[])
            .map(Number)
            .filter(id => id !== excludeUserId);
          if (members.length > 0) {
            map.set(hexIds[i], members);
          }
        }
      });
      return map;
    } catch (err) {
      console.error('Redis getUsersInHexes error:', err);
      return new Map();
    }
  }

  async publishCrossEvent(user1Id: number, user2Id: number, hexId: string, lat: number, lng: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const payload = JSON.stringify({ user1Id, user2Id, hexId, lat, lng, timestamp: new Date().toISOString() });
      await this.client!.publish('cross:detected', payload);
    } catch (err) {
      console.error('Redis publishCrossEvent error:', err);
    }
  }

  subscribe(channel: string, callback: (message: string, channel: string) => void): void {
    if (!this.isAvailable() || !this.subscriber) return;
    this.pubSubCallbacks.set(channel, callback);
    this.subscriber.subscribe(channel).catch(err => {
      console.error(`Redis subscribe error for ${channel}:`, err);
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) { await this.client.quit(); this.client = null; }
    if (this.subscriber) { await this.subscriber.quit(); this.subscriber = null; }
    this.status = 'disconnected';
  }
}
