import { H3Service } from './H3Service';
import { RedisService } from './RedisService';
import { RouteService } from './RouteService';
import { ProximityService } from './ProximityService';
import { CrossEvent } from '../../models/CrossEvent';
import { CrossSettings } from '../../models/CrossSettings';
import { Recap } from '../../models/Recap';
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

  async getUserSettings(userId: number): Promise<{ hour1: number; hour2: number; delayMinutes: number }> {
    const settings = await CrossSettings.findOne({ where: { userId } });
    if (!settings) {
      return { hour1: 9, hour2: 21, delayMinutes: 30 };
    }
    return {
      hour1: settings.revealScheduleHour1,
      hour2: settings.revealScheduleHour2,
      delayMinutes: settings.revealDelayMinutes || 30,
    };
  }

  /**
   * Check if cooling period has elapsed since the cross event.
   * Uses the other user's revealDelayMinutes setting (snapshot on the event).
   */
  async isCrossUnlocked(userId: number, event: CrossEvent): Promise<boolean> {
    if (!event.revealedAt) return false;
    return new Date() >= new Date(event.revealedAt);
  }

  /**
   * Full profile is accessible after the current user's second recap slot (hour2).
   * Default: 9 PM. Before that, basic profile (photo + name) is visible from the
   * delay unlock, but tapping navigates to a "Full profile unlocks at [time]" modal.
   */
  async isProfileAccessible(userId: number): Promise<boolean> {
    const settings = await this.getUserSettings(userId);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= settings.hour2 * 60;
  }

  async getNextProfileUnlock(userId: number): Promise<Date> {
    const settings = await this.getUserSettings(userId);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = settings.hour2 * 60;

    if (currentMinutes < slotMinutes) {
      const d = new Date(now);
      d.setHours(settings.hour2, 0, 0, 0);
      return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(settings.hour2, 0, 0, 0);
    return d;
  }

  /**
   * Batch insert multiple route points at once. Also updates Redis with the
   * latest point's hex and runs cross-detection for the most recent location.
   */
  async updateLocationBatch(
    userId: number,
    points: { latitude: number; longitude: number; recorded_at: string }[]
  ): Promise<{ inserted: number }> {
    const route = RouteService.getInstance();
    if (!route.isAvailable()) return { inserted: 0 };

    const redis = RedisService.getInstance();

    // Full-resolution: store ALL raw points in Redis (24h TTL)
    if (redis.isAvailable()) {
      await redis.setRoutePoints(userId, points).catch(() => {});
    }

    // Simplified: decimate to one point per 30-second window for PostgreSQL
    const routePoints: { userId: number; latitude: number; longitude: number; hexId: string; recordedAt: Date }[] = [];
    let lastWindowStart = 0;
    for (const p of points) {
      const ts = new Date(p.recorded_at).getTime();
      const windowStart = Math.floor(ts / 30000) * 30000;
      if (windowStart !== lastWindowStart) {
        routePoints.push({
          userId,
          latitude: p.latitude,
          longitude: p.longitude,
          hexId: H3Service.latLngToHex(p.latitude, p.longitude),
          recordedAt: new Date(p.recorded_at),
        });
        lastWindowStart = windowStart;
      }
    }

    await route.insertRoutePointsBatch(routePoints).catch(() => {});

    // Update Redis current hex + cross-check the latest point
    if (points.length > 0) {
      const latest = points[points.length - 1];
      if (redis.isAvailable()) {
        const hexId = H3Service.latLngToHex(latest.latitude, latest.longitude);
        await redis.setUserLocation(userId, hexId);
      }
      await this.updateLocation(userId, latest.latitude, latest.longitude);
    }

    return { inserted: points.length };
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

    // Store single point in Redis full-res + PG simplified
    if (redis.isAvailable()) {
      await redis.setRoutePoints(userId, [{
        latitude,
        longitude,
        recorded_at: new Date().toISOString(),
      }]).catch(() => {});
    }
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

    // Use ProximityService.enterHexagon for idempotent encounter detection
    const proximity = ProximityService.getInstance();
    const timestamp = new Date();
    const { newEncounters } = await proximity.enterHexagon(userId, hexId, latitude, longitude, timestamp);
    const hexCenter = H3Service.hexToCenter(hexId);

    for (const enc of newEncounters) {
      const otherId = enc.userA === userId ? enc.userB : enc.userA;

      result.crossedWith.push(otherId);
      result.crossingDetected = true;

      // Create CrossEvent for API backward compatibility
      const otherSettings = await this.getUserSettings(otherId);
      const delayMs = otherSettings.delayMinutes * 60 * 1000;
      const revealedAt = new Date(timestamp.getTime() + delayMs);

      try {
        await CrossEvent.findOrCreate({
          where: {
            user1Id: Math.min(userId, otherId),
            user2Id: Math.max(userId, otherId),
            hexId,
            crossedAt: { [Op.gte]: new Date(timestamp.getTime() - 60000) },
          },
          defaults: {
            user1Id: Math.min(userId, otherId),
            user2Id: Math.max(userId, otherId),
            latitude,
            longitude,
            hexId,
            hexLatitude: hexCenter.lat,
            hexLongitude: hexCenter.lng,
            revealDelayMinutes: otherSettings.delayMinutes,
            revealedAt,
            crossedAt: timestamp,
            published: false,
          } as any,
        });
      } catch {}

      if (route.isAvailable()) {
        await route.insertCrossingRoute({
          user1Id: Math.min(userId, otherId),
          user2Id: Math.max(userId, otherId),
          hexId,
          lat1: userId === Math.min(userId, otherId) ? latitude : hexCenter.lat,
          lng1: userId === Math.min(userId, otherId) ? longitude : hexCenter.lng,
          lat2: userId === Math.max(userId, otherId) ? latitude : hexCenter.lat,
          lng2: userId === Math.max(userId, otherId) ? longitude : hexCenter.lng,
          crossedAt: timestamp,
        }).catch(() => {});
      }

      for (const cb of this.onCrossingCallbacks) {
        cb({
          user1Id: Math.min(userId, otherId),
          user2Id: Math.max(userId, otherId),
          hexId,
          lat: latitude,
          lng: longitude,
          timestamp,
        });
      }
    }

    return result;
  }

  private async enrichCrossEvent(
    userId: number,
    e: CrossEvent,
    profileAccessibleOverride?: boolean,
  ): Promise<any> {
    const isUnlocked = await this.isCrossUnlocked(userId, e);
    if (!isUnlocked) return null;

    const profileAccessible = profileAccessibleOverride ?? await this.isProfileAccessible(userId);
    const otherId = e.user1Id === userId ? e.user2Id : e.user1Id;
    const other = await User.findByPk(otherId, {
      attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture', 'location'],
    });
    const isFriend = !!(await Friend.findOne({
      where: {
        [Op.or]: [
          { userId, friendId: otherId },
          { userId: otherId, friendId: userId },
        ],
      },
    }));
    const showProfile = profileAccessible;
    const settings = await this.getUserSettings(userId);
    return {
      id: e.id,
      other_user: other
        ? {
            id: other.id,
            username: other.username,
            first_name: showProfile ? other.firstName : null,
            last_name: other.lastName,
            profile_picture: other.profilePicture,
            location: other.location,
          }
        : null,
      hex_id: e.hexId,
      latitude: e.hexLatitude || e.latitude,
      longitude: e.hexLongitude || e.longitude,
      crossed_at: e.crossedAt,
      published: e.published,
      is_friend: isFriend,
      is_unlocked: isUnlocked,
      profile_accessible: profileAccessible,
      next_profile_unlock: !profileAccessible
        ? (await this.getNextProfileUnlock(userId)).toISOString()
        : null,
      reveal_schedule_hour_2: settings.hour2,
      reveal_delay_minutes: e.revealDelayMinutes || 0,
      revealed_at: e.revealedAt?.toISOString() || null,
    };
  }

  async getRecentCrosses(
    userId: number,
    limit: number = 50,
    hoursBack: number = 24
  ): Promise<any[]> {
    const [events, profileAccessible] = await Promise.all([
      CrossEvent.findAll({
        where: {
          [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
          crossedAt: { [Op.gte]: new Date(Date.now() - hoursBack * 60 * 60 * 1000) },
        },
        order: [['crossed_at', 'DESC']],
        limit,
      }),
      this.isProfileAccessible(userId),
    ]);
    const enriched = await Promise.all(events.map((e) => this.enrichCrossEvent(userId, e, profileAccessible)));
    return enriched.filter(Boolean);
  }

  async getEventsByDate(userId: number, dateStr: string): Promise<any[]> {
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');
    const [events, profileAccessible] = await Promise.all([
      CrossEvent.findAll({
        where: {
          [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
          crossedAt: { [Op.between]: [start, end] },
        },
        order: [['crossed_at', 'DESC']],
      }),
      this.isProfileAccessible(userId),
    ]);
    const enriched = await Promise.all(events.map((e) => this.enrichCrossEvent(userId, e, profileAccessible)));
    return enriched.filter(Boolean);
  }

  async generateAndStoreRecap(userId: number, date: string, period: 'am' | 'pm'): Promise<void> {
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossedAt: { [Op.between]: [dayStart, dayEnd] },
      },
    });

    let total = 0;
    let unlocked = 0;
    for (const e of events) {
      if (await this.isCrossUnlocked(userId, e)) {
        total++;
        unlocked++;
      }
    }

    await Recap.upsert({
      userId,
      date,
      period,
      total,
      unlocked,
    } as any);
  }

  async getRecapHistory(userId: number): Promise<{
    date: string;
    total: number;
    unlocked: number;
    friend_total: number;
    friend_unlocked: number;
    unknown_total: number;
    unknown_unlocked: number;
  }[]> {
    const recaps = await Recap.findAll({
      where: { userId },
      order: [['date', 'DESC']],
    });

    if (recaps.length === 0) return [];

    const dates = [...new Set(recaps.map(r => r.date))].sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const allEvents = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossedAt: {
          [Op.between]: [
            new Date(minDate + 'T00:00:00.000Z'),
            new Date(maxDate + 'T23:59:59.999Z'),
          ],
        },
      },
    });

    const otherUserIds = new Set<number>();
    for (const e of allEvents) {
      otherUserIds.add(e.user1Id === userId ? e.user2Id : e.user1Id);
    }

    const friendStatus = new Map<number, boolean>();
    if (otherUserIds.size > 0) {
      const friends = await Friend.findAll({
        where: {
          [Op.or]: [
            { userId, friendId: { [Op.in]: Array.from(otherUserIds) } },
            { userId: { [Op.in]: Array.from(otherUserIds) }, friendId: userId },
          ],
        },
      });
      for (const f of friends) {
        const otherId = f.userId === userId ? f.friendId : f.userId;
        friendStatus.set(otherId, true);
      }
      for (const id of otherUserIds) {
        if (!friendStatus.has(id)) friendStatus.set(id, false);
      }
    }

    const dayMap = new Map<string, {
      total: number; unlocked: number;
      friend_total: number; friend_unlocked: number;
      unknown_total: number; unknown_unlocked: number;
    }>();
    for (const r of recaps) {
      if (!dayMap.has(r.date)) {
        dayMap.set(r.date, {
          total: 0, unlocked: 0,
          friend_total: 0, friend_unlocked: 0,
          unknown_total: 0, unknown_unlocked: 0,
        });
      }
      const entry = dayMap.get(r.date)!;
      entry.total += r.total;
      entry.unlocked += r.unlocked;
    }

    for (const e of allEvents) {
      if (!(await this.isCrossUnlocked(userId, e))) continue;
      const dateStr = e.crossedAt.toISOString().split('T')[0];
      if (!dayMap.has(dateStr)) continue;
      const otherId = e.user1Id === userId ? e.user2Id : e.user1Id;
      const isFriend = friendStatus.get(otherId) ?? false;
      const entry = dayMap.get(dateStr)!;
      if (isFriend) {
        entry.friend_total++;
        entry.friend_unlocked++;
      } else {
        entry.unknown_total++;
        entry.unknown_unlocked++;
      }
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, counts]) => ({ date, ...counts }));
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
        lat: c.hexLatitude || c.latitude,
        lng: c.hexLongitude || c.longitude,
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
