import { RedisService } from './RedisService';
import { H3Service } from './H3Service';

const USER_HEX_TTL = 600;

export interface ValidEncounter {
  userA: number;
  userB: number;
  hexId: string;
}

export class ProximityService {
  private static instance: ProximityService;

  static getInstance(): ProximityService {
    if (!this.instance) {
      this.instance = new ProximityService();
    }
    return this.instance;
  }

  async enterHexagon(
    userId: number,
    latitude: number,
    longitude: number,
    timestamp: Date
  ): Promise<{ newEncounters: ValidEncounter[] }> {
    const hexId = H3Service.latLngToHex(latitude, longitude);
    const redis = RedisService.getInstance();

    if (!redis.isAvailable()) return { newEncounters: [] };

    const currentHexKey = `user:${userId}:hex`;
    const client = redis.getPubClient();

    if (!client) return { newEncounters: [] };

    const previousHex = await client.get(currentHexKey);

    if (previousHex !== hexId) {
      await client.set(currentHexKey, hexId, 'EX', USER_HEX_TTL);

      if (previousHex) {
        await client.srem(`hex:${previousHex}`, String(userId));
      }
      await client.sadd(`hex:${hexId}`, String(userId));
      await client.expire(`hex:${hexId}`, USER_HEX_TTL);
    }

    const occupants = await redis.getHexOccupants(hexId, userId);
    const validEncounters: ValidEncounter[] = [];

    for (const otherId of occupants) {
      const otherHex = await client.get(`user:${otherId}:hex`);
      if (otherHex === hexId) {
        validEncounters.push({
          userA: Math.min(userId, otherId),
          userB: Math.max(userId, otherId),
          hexId,
        });
      }
    }

    return { newEncounters: validEncounters };
  }
}
