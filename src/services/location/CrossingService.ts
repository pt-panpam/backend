import { H3Service } from './H3Service';
import { RedisService } from './RedisService';
import { RouteService } from './RouteService';
import { CrossEvent } from '../../models/CrossEvent';
import { CrossSettings } from '../../models/CrossSettings';
import { User } from '../../models/User';
import { Friend } from '../../models/Friend';
import { createAndDeliverNotification } from '../NotificationService';
import { Op } from 'sequelize';
import { Server as SocketIOServer } from 'socket.io';

type CrossingCallback = (event: {
  user1Id: number;
  user2Id: number;
  hexId: string;
  lat: number;
  lng: number;
  timestamp: Date;
}) => void;

function getRevealSlots(userSettings: { hour1: number; hour2: number }): Date[] {
  const now = new Date();
  const today1 = new Date(now);
  today1.setHours(userSettings.hour1, 0, 0, 0);
  const today2 = new Date(now);
  today2.setHours(userSettings.hour2, 0, 0, 0);

  // If the second slot has already passed today, first slot is tomorrow
  if (now >= today2) {
    const tomorrow1 = new Date(now);
    tomorrow1.setDate(tomorrow1.getDate() + 1);
    tomorrow1.setHours(userSettings.hour1, 0, 0, 0);
    return [today2, tomorrow1];
  }

  // If the first slot has already passed
  if (now >= today1) {
    return [today1, today2];
  }

  // Both are still in the future (before first slot)
  const yesterday2 = new Date(now);
  yesterday2.setDate(yesterday2.getDate() - 1);
  yesterday2.setHours(userSettings.hour2, 0, 0, 0);
  return [yesterday2, today1];
}

function getNextRevealSlot(userSettings: { hour1: number; hour2: number }): Date {
  const now = new Date();
  const today1 = new Date(now);
  today1.setHours(userSettings.hour1, 0, 0, 0);
  const today2 = new Date(now);
  today2.setHours(userSettings.hour2, 0, 0, 0);

  if (now < today1) return today1;
  if (now < today2) return today2;
  const tomorrow1 = new Date(now);
  tomorrow1.setDate(tomorrow1.getDate() + 1);
  tomorrow1.setHours(userSettings.hour1, 0, 0, 0);
  return tomorrow1;
}

function getPreviousRevealSlot(userSettings: { hour1: number; hour2: number }): Date {
  const now = new Date();
  const today1 = new Date(now);
  today1.setHours(userSettings.hour1, 0, 0, 0);
  const today2 = new Date(now);
  today2.setHours(userSettings.hour2, 0, 0, 0);

  if (now >= today2) return today2;
  if (now >= today1) return today1;
  const yesterday2 = new Date(now);
  yesterday2.setDate(yesterday2.getDate() - 1);
  yesterday2.setHours(userSettings.hour2, 0, 0, 0);
  return yesterday2;
}

function formatRevealWindows(settings: { hour1: number; hour2: number }): { next: Date; previous: Date } {
  return {
    next: getNextRevealSlot(settings),
    previous: getPreviousRevealSlot(settings),
  };
}

export class CrossingService {
  private static instance: CrossingService;
  private io: SocketIOServer | null = null;
  private onCrossingCallbacks: CrossingCallback[] = [];

  private constructor() {}

  static getInstance(): CrossingService {
    if (!this.instance) {
      this.instance = new CrossingService();
    }
    return this.instance;
  }

  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  onCrossing(callback: CrossingCallback): void {
    this.onCrossingCallbacks.push(callback);
  }

  async getUserSettings(userId: number): Promise<{ hour1: number; hour2: number }> {
    const settings = await CrossSettings.findOne({ where: { userId } });
    if (!settings) {
      return { hour1: 9, hour2: 21 };
    }
    return { hour1: settings.revealScheduleHour1, hour2: settings.revealScheduleHour2 };
  }

  async isCrossUnlocked(userId: number, crossedAt: Date): Promise<boolean> {
    const settings = await this.getUserSettings(userId);
    const previous = getPreviousRevealSlot(settings);
    // Cross is unlocked if it happened before or at the previous reveal slot
    return new Date(crossedAt) <= previous;
  }

  getRevealWindows(settings: { hour1: number; hour2: number }) {
    return formatRevealWindows(settings);
  }

  getNextRevealLabel(settings: { hour1: number; hour2: number }): string {
    const next = getNextRevealSlot(settings);
    const hours = next.getHours();
    const mins = next.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
  }

  async updateLocation(
    userId: number,
    latitude: number,
    longitude: number
  ): Promise<{
    crossingDetected: boolean;
    crossedWith: number[];
    hexId: string;
  }> {
    const result = { crossingDetected: false, crossedWith: [] as number[], hexId: '' };

    const hexId = H3Service.latLngToHex(latitude, longitude);
    result.hexId = hexId;

    const redis = RedisService.getInstance();
    const route = RouteService.getInstance();

    // Store route point
    if (route.isAvailable()) {
      await route.insertRoutePoint({
        userId,
        latitude,
        longitude,
        hexId,
        recordedAt: new Date(),
      }).catch(() => {});
    }

    // Update Redis
    if (redis.isAvailable()) {
      await redis.setUserLocation(userId, hexId);
    }

    // Check for hex collisions
    let occupants: number[] = [];
    if (redis.isAvailable()) {
      occupants = await redis.getHexOccupants(hexId, userId);
    } else {
      const recentEvents = await CrossEvent.findAll({
        where: {
          [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
          crossedAt: { [Op.gte]: new Date(Date.now() - 300000) },
        },
      });
      const otherIds = new Set<number>();
      for (const e of recentEvents) {
        otherIds.add(e.user1Id === userId ? e.user2Id : e.user1Id);
      }
      occupants = Array.from(otherIds);
    }

    if (occupants.length > 0) {
      const hexCenter = H3Service.hexToCenter(hexId);
      const neighborHexes = H3Service.getNeighborHexes(hexId, 1);

      let allNearby: Map<string, number[]> = new Map();
      if (redis.isAvailable()) {
        allNearby = await redis.getUsersInHexes(neighborHexes, userId);
      }
      allNearby.set(hexId, occupants);

      const processedPairs = new Set<string>();

      for (const [, members] of allNearby) {
        for (const otherId of members) {
          const pairKey = [userId, otherId].sort().join(':');
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const isFriend = await Friend.findOne({
            where: {
              [Op.or]: [
                { userId, friendId: otherId },
                { userId: otherId, friendId: userId },
              ],
            },
          });

          const recentCross = await CrossEvent.findOne({
            where: {
              user1Id: Math.min(userId, otherId),
              user2Id: Math.max(userId, otherId),
              crossedAt: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) },
            },
          });
          if (recentCross) continue;

          try {
            const event = await CrossEvent.create({
              user1Id: Math.min(userId, otherId),
              user2Id: Math.max(userId, otherId),
              latitude,
              longitude,
              crossedAt: new Date(),
              published: false,
            } as any);

            result.crossedWith.push(otherId);
            result.crossingDetected = true;

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
              }).catch(() => {});
            }

            await redis.publishCrossEvent(userId, otherId, hexId, latitude, longitude);

            if (this.io) {
              const otherUser = await User.findByPk(otherId, {
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

              this.io.to(`user:${userId}`).emit('cross:detected', eventData);
              this.io.to(`user:${otherId}`).emit('cross:detected', eventData);

              if (!isFriend) {
                try {
                  await createAndDeliverNotification({
                    userId: otherId,
                    type: 'cross_event',
                    title: 'Cross Paths',
                    body: `${(await User.findByPk(userId))?.firstName || 'Someone'} crossed your path nearby!`,
                    actorId: userId,
                  });
                } catch {}
              }
            }

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
          } catch (err) {
            console.error('CrossingService: error creating event:', err);
          }
        }
      }
    }

    return result;
  }

  async getRecentCrosses(
    userId: number,
    limit: number = 50
  ): Promise<any[]> {
    const settings = await this.getUserSettings(userId);
    const revealWindows = this.getRevealWindows(settings);

    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossedAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      order: [['crossed_at', 'DESC']],
      limit,
    });

    const userCache = new Map<number, any>();
    const results = await Promise.all(
      events.map(async (e) => {
        const otherId = e.user1Id === userId ? e.user2Id : e.user1Id;
        if (!userCache.has(otherId)) {
          const u = await User.findByPk(otherId, {
            attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture', 'location'],
          });
          userCache.set(otherId, u);
        }
        const other = userCache.get(otherId);
        const isFriend = !!(await Friend.findOne({
          where: {
            [Op.or]: [
              { userId, friendId: otherId },
              { userId: otherId, friendId: userId },
            ],
          },
        }));

        const isUnlocked = await this.isCrossUnlocked(userId, e.crossedAt);

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
          crossed_at: e.crossedAt,
          published: e.published,
          is_friend: isFriend,
          is_unlocked: isUnlocked,
          next_reveal_at: revealWindows.next.toISOString(),
        };
      })
    );

    return results;
  }

  async getUserRoute(userId: number): Promise<any[]> {
    const route = RouteService.getInstance();
    if (!route.isAvailable()) return [];
    const points = await route.getUserRoute(userId);
    return points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
      hex_id: p.hexId,
      recorded_at: p.recordedAt,
    }));
  }

  async getRouteTimeline(userId: number): Promise<any[]> {
    const route = RouteService.getInstance();
    if (!route.isAvailable()) return [];

    const [points, crosses] = await Promise.all([
      route.getUserRoute(userId),
      CrossEvent.findAll({
        where: {
          [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
          crossedAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        order: [['crossed_at', 'ASC']],
      }),
    ]);

    const crossMap = new Map<string, { otherId: number; otherName: string; lat: number; lng: number }>();
    for (const c of crosses) {
      const otherId = c.user1Id === userId ? c.user2Id : c.user1Id;
      const key = `${otherId}:${c.crossedAt.getTime()}`;
      const user = await User.findByPk(otherId, { attributes: ['id', 'firstName', 'lastName'] });
      crossMap.set(key, {
        otherId,
        otherName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Someone',
        lat: c.latitude,
        lng: c.longitude,
      });
    }

    const timeline: any[] = [];
    for (const p of points) {
      const timeKey = p.recordedAt.getTime();
      timeline.push({
        type: 'route',
        time: p.recordedAt.toISOString(),
        latitude: p.latitude,
        longitude: p.longitude,
        hex_id: p.hexId,
        label: null,
      });
      // Check if a cross happened at this point (within same minute)
      for (const [key, val] of crossMap) {
        const crossTime = parseInt(key.split(':')[1]);
        if (Math.abs(crossTime - timeKey) < 60000) {
          timeline.push({
            type: 'cross',
            time: new Date(crossTime).toISOString(),
            latitude: val.lat,
            longitude: val.lng,
            hex_id: null,
            label: `Crossed ${val.otherName}`,
          });
          crossMap.delete(key);
        }
      }
    }

    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return timeline;
  }

  async getDashboardStats(userId: number): Promise<{
    totalCrosses: number;
    uniqueCrosses: number;
    todayCrosses: number;
    currentHex: string | null;
  }> {
    const totalCrosses = await CrossEvent.count({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
      },
    });

    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
      },
      attributes: ['user1Id', 'user2Id'],
    });
    const uniqueOthers = new Set<number>();
    for (const e of events) {
      uniqueOthers.add(e.user1Id === userId ? e.user2Id : e.user1Id);
    }

    const todayCrosses = await CrossEvent.count({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossedAt: { [Op.gte]: new Date(Date.now() - 86400000) },
      },
    });

    let currentHex: string | null = null;
    const redis = RedisService.getInstance();
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
