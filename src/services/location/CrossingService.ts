import { H3Service } from './H3Service';
import { RedisService } from './RedisService';
import { RouteService } from './RouteService';
import { ProximityService } from './ProximityService';
import { CrossEvent } from '../../models/CrossEvent';
import { CrossSettings } from '../../models/CrossSettings';
import { Recap } from '../../models/Recap';
import { User } from '../../models/User';
import { Friend } from '../../models/Friend';
import { Op } from 'sequelize';
import { Server as SocketIOServer } from 'socket.io';
import { getDatePartsInIST, istDateStr, createDateFromIST } from '../../utils/timezone';
import { getNotificationQueue } from './NotificationQueue';

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
      delayMinutes: settings.revealDelayMinutes ?? 30,
    };
  }

  private computeSlotUnlockTime(crossedAt: Date): Date {
    const parts = getDatePartsInIST(crossedAt);
    const crossedMinutes = parts.hour * 60 + parts.minute;
    if (crossedMinutes >= 9 * 60 && crossedMinutes < 21 * 60) {
      return createDateFromIST(parts.year, parts.month, parts.day, 21, 0, 0);
    }
    const tomorrow = new Date(crossedAt.getTime() + 86400000);
    const tp = getDatePartsInIST(tomorrow);
    return createDateFromIST(tp.year, tp.month, tp.day, 9, 0, 0);
  }

  private computeUnlockTime(crossedAt: Date, crosserDelayMinutes: number): Date {
    const slotTime = this.computeSlotUnlockTime(crossedAt);
    const delayTime = new Date(crossedAt.getTime() + crosserDelayMinutes * 60000);
    return slotTime > delayTime ? slotTime : delayTime;
  }

  async isCrossUnlocked(userId: number, event: CrossEvent): Promise<boolean> {
    const isUserA = userId === event.user1Id;
    const storedUnlock = isUserA ? event.userBUnlockTime : event.userAUnlockTime;
    if (storedUnlock) {
      return new Date() >= storedUnlock;
    }
    const crosserDelay = isUserA
      ? await this.getUserDelay(event.user2Id)
      : await this.getUserDelay(event.user1Id);
    const unlockTime = this.computeUnlockTime(event.crossedAt, crosserDelay);
    return new Date() >= unlockTime;
  }

  private async getUserDelay(userId: number): Promise<number> {
    const s = await CrossSettings.findOne({ where: { userId }, attributes: ['revealDelayMinutes'] });
    return s?.revealDelayMinutes ?? 30;
  }

  async isProfileAccessible(userId: number, crossedAt?: Date): Promise<boolean> {
    if (!crossedAt) return false;
    const settings = await this.getUserSettings(userId);
    const unlockTime = this.computeUnlockTime(crossedAt, settings.delayMinutes);
    return new Date() >= unlockTime;
  }

  async getNextProfileUnlock(userId: number): Promise<Date> {
    const now = new Date();
    const nowParts = getDatePartsInIST(now);
    const currentMinutes = nowParts.hour * 60 + nowParts.minute;

    if (currentMinutes < 9 * 60) {
      return createDateFromIST(nowParts.year, nowParts.month, nowParts.day, 9, 0, 0);
    }
    if (currentMinutes < 21 * 60) {
      return createDateFromIST(nowParts.year, nowParts.month, nowParts.day, 21, 0, 0);
    }
    const tomorrow = new Date(createDateFromIST(nowParts.year, nowParts.month, nowParts.day, 21, 0, 0).getTime() + 1);
    const nextParts = getDatePartsInIST(tomorrow);
    return createDateFromIST(nextParts.year, nextParts.month, nextParts.day, 9, 0, 0);
  }

  async updateLocationBatch(
    userId: number,
    points: { latitude: number; longitude: number; recorded_at: string }[]
  ): Promise<{ inserted: number }> {
    const route = RouteService.getInstance();
    if (!route.isAvailable()) return { inserted: 0 };
    const redis = RedisService.getInstance();
    if (redis.isAvailable()) {
      await redis.setRoutePoints(userId, points).catch(() => {});
    }

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
  ): Promise<{ crossingDetected: boolean; crossedWith: number[]; hexId: string; }> {
    const result = { crossingDetected: false, crossedWith: [] as number[], hexId: '' };
    const hexId = H3Service.latLngToHex(latitude, longitude);
    result.hexId = hexId;
    const redis = RedisService.getInstance();
    const route = RouteService.getInstance();

    if (redis.isAvailable()) {
      await redis.setRoutePoints(userId, [{ latitude, longitude, recorded_at: new Date().toISOString() }]).catch(() => {});
    }
    if (route.isAvailable()) {
      await route.insertRoutePoint({ userId, latitude, longitude, hexId, recordedAt: new Date() }).catch(() => {});
    }
    if (redis.isAvailable()) {
      await redis.setUserLocation(userId, hexId);
    }

    const proximity = ProximityService.getInstance();
    const timestamp = new Date();
    const { newEncounters } = await proximity.enterHexagon(userId, hexId, latitude, longitude, timestamp);
    const hexCenter = H3Service.hexToCenter(hexId);

    for (const enc of newEncounters) {
      const otherId = enc.userA === userId ? enc.userB : enc.userA;
      result.crossedWith.push(otherId);
      result.crossingDetected = true;

      const userA = Math.min(userId, otherId);
      const userB = Math.max(userId, otherId);
      const cDate = istDateStr(timestamp);
      const userADelay = await this.getUserDelay(userA);
      const userBDelay = await this.getUserDelay(userB);
      const userAUnlock = this.computeUnlockTime(timestamp, userADelay);
      const userBUnlock = this.computeUnlockTime(timestamp, userBDelay);

      try {
        const [evt, created] = await CrossEvent.findOrCreate({
          where: { user1Id: userA, user2Id: userB, crossDateIst: cDate },
          defaults: {
            user1Id: userA,
            user2Id: userB,
            latitude,
            longitude,
            hexId,
            hexLatitude: hexCenter.lat,
            hexLongitude: hexCenter.lng,
            crossDateIst: cDate,
            userAUnlockTime: userAUnlock,
            userBUnlockTime: userBUnlock,
            crossedAt: timestamp,
            revealDelayMinutes: userBDelay,
            revealedAt: userBUnlock,
            lastSeenAt: timestamp,
            published: false,
          } as any,
        });
        if (!created) {
          await evt.update({ lastSeenAt: timestamp }).catch(() => {});
          continue;
        }
      } catch {}

      if (route.isAvailable()) {
        await route.insertCrossingRoute({
          user1Id: userA,
          user2Id: userB,
          hexId,
          lat1: userId === userA ? latitude : hexCenter.lat,
          lng1: userId === userA ? longitude : hexCenter.lng,
          lat2: userId === userB ? latitude : hexCenter.lat,
          lng2: userId === userB ? longitude : hexCenter.lng,
          crossedAt: timestamp,
        }).catch(() => {});
      }

      try {
        const q = getNotificationQueue();
        await q.add('unlock-profile', { userId: userB, otherUserId: userA }, { delay: Math.max(0, userAUnlock.getTime() - Date.now()), jobId: `unlock-${userB}-${userA}-${cDate}`, removeOnComplete: true });
        await q.add('unlock-profile', { userId: userA, otherUserId: userB }, { delay: Math.max(0, userBUnlock.getTime() - Date.now()), jobId: `unlock-${userA}-${userB}-${cDate}`, removeOnComplete: true });
      } catch {}

      for (const cb of this.onCrossingCallbacks) {
        cb({ user1Id: userA, user2Id: userB, hexId, lat: latitude, lng: longitude, timestamp });
      }
    }
    return result;
  }

  private async enrichCrossEvent(userId: number, e: CrossEvent): Promise<any> {
    const isMeUserA = userId === e.user1Id;
    const crosserId = isMeUserA ? e.user2Id : e.user1Id;
    const crosserDelay = await this.getUserDelay(crosserId);
    
    const nowTime = Date.now();
    
    // Stage 0: If the delay hasn't passed, event is completely invisible
    const partialRevealTime = new Date(e.crossedAt.getTime() + crosserDelay * 60000).getTime();
    if (nowTime < partialRevealTime) {
      return null;
    }

    // Stage 2: Full unlock time (slot-based: 9AM/9PM IST)
    const storedUnlock = isMeUserA ? e.userBUnlockTime : e.userAUnlockTime;
    let fullUnlockTime: Date;
    if (storedUnlock) {
      fullUnlockTime = storedUnlock;
    } else {
      fullUnlockTime = this.computeUnlockTime(e.crossedAt, crosserDelay);
    }
    
    const isFullyRevealed = nowTime >= fullUnlockTime.getTime();
    const isPartiallyRevealed = !isFullyRevealed;

    const other = await User.findByPk(crosserId, {
      attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture', 'location'],
    });

    const isFriend = !!(await Friend.findOne({
      where: {
        [Op.or]: [
          { userId, friendId: crosserId },
          { userId: crosserId, friendId: userId },
        ],
      },
    }));

    // Stage 1: Partially revealed — last name visible, blurred photo
    const maskedFirstName = other?.firstName ? `${other.firstName.charAt(0)}*` : 'Unknown';
    
    const fuzzedTime = new Date(e.crossedAt);
    fuzzedTime.setMinutes(0, 0, 0);
    const fuzzedTimeStr = `Around ${fuzzedTime.getHours() % 12 || 12} ${fuzzedTime.getHours() >= 12 ? 'PM' : 'AM'}`;

    return {
      id: e.id,
      other_user: other
        ? {
            id: isFullyRevealed ? other.id : null,
            username: isFullyRevealed ? other.username : null,
            first_name: isFullyRevealed ? other.firstName : maskedFirstName,
            last_name: isFullyRevealed ? other.lastName : other.lastName,
            profile_picture: isFullyRevealed
              ? other.profilePicture
              : other.profilePicture, // Return URL but frontend applies blur
            blurred: isPartiallyRevealed,
            location: isFullyRevealed ? other.location : 'General Area',
          }
        : null,
      hex_id: e.hexId,
      latitude: isFullyRevealed ? (e.latitude || e.hexLatitude) : e.hexLatitude,
      longitude: isFullyRevealed ? (e.longitude || e.hexLongitude) : e.hexLongitude,
      crossed_at: isFullyRevealed ? e.crossedAt : fuzzedTime,
      fuzzed_time_str: isPartiallyRevealed ? fuzzedTimeStr : null,
      cross_date_ist: e.crossDateIst,
      published: e.published,
      is_friend: isFriend,
      reveal_stage: isFullyRevealed ? 2 : 1,
      is_unlocked: isFullyRevealed,
      profile_accessible: isFullyRevealed,
      next_profile_unlock: isFullyRevealed ? null : fullUnlockTime.toISOString(),
      reveal_schedule_hour_1: 9,
      reveal_schedule_hour_2: 21,
      reveal_delay_minutes: crosserDelay,
      revealed_at: fullUnlockTime.toISOString(),
      slot_unlock_at: fullUnlockTime.toISOString(),
    };
  }

  async getRecentCrosses(userId: number, limit: number = 50, hoursBack: number = 24): Promise<any[]> {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossedAt: { [Op.gte]: new Date(Date.now() - hoursBack * 60 * 60 * 1000) },
      },
      order: [['crossed_at', 'DESC']],
      limit,
    });
    const enriched = await Promise.all(events.map((e) => this.enrichCrossEvent(userId, e)));
    return enriched.filter(Boolean); // Will silently drop Level 0 items
  }

  async getEventsByDate(userId: number, dateStr: string): Promise<any[]> {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossDateIst: dateStr,
      },
      order: [['crossed_at', 'DESC']],
    });
    const enriched = await Promise.all(events.map((e) => this.enrichCrossEvent(userId, e)));
    return enriched.filter(Boolean);
  }

  async generateAndStoreRecap(userId: number, date: string, period: 'am' | 'pm'): Promise<void> {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        crossDateIst: date,
      },
    });

    let total = 0;
    let unlocked = 0;
    for (const e of events) {
      total++;
      if (await this.isCrossUnlocked(userId, e)) {
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
        crossDateIst: { [Op.between]: [minDate, maxDate] },
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
        crossDateIst: istDateStr(new Date()),
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