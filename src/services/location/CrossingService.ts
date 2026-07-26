import { Server } from 'socket.io';
import { CrossEvent } from '../../models/CrossEvent';
import { CrossSettings } from '../../models/CrossSettings';
import { User } from '../../models/User';
import { Friend } from '../../models/Friend';
import { Op } from 'sequelize';
import { getDatePartsInIST, istDateStr } from '../../utils/timezone';
import { getNotificationQueue } from './NotificationQueue';
import { ProximityService, ValidEncounter } from './ProximityService';
import { H3Service } from './H3Service';
import { RouteService } from './RouteService';

export class CrossingService {
  private static instance: CrossingService;
  private io: Server | null = null;

  private constructor() {}

  static getInstance(): CrossingService {
    if (!this.instance) {
      this.instance = new CrossingService();
    }
    return this.instance;
  }

  setIO(io: Server): void {
    this.io = io;
  }

  private async getUserDelay(userId: number): Promise<number> {
    const s = await CrossSettings.findOne({ where: { userId }, attributes: ['revealDelayMinutes'] });
    return s?.revealDelayMinutes ?? 45;
  }

  private async getUserSettings(userId: number) {
    const s = await CrossSettings.findOne({ where: { userId } });
    return {
      hour1: s?.revealScheduleHour1 ?? 9,
      hour2: s?.revealScheduleHour2 ?? 21,
    };
  }

  private computeRecapSlotTime(crossedAt: Date, hour1: number, hour2: number): Date {
    const parts = getDatePartsInIST(crossedAt);
    const crossedMinutes = parts.hour * 60 + parts.minute;

    if (crossedMinutes < hour1 * 60) {
      return new Date(parts.year, parts.month - 1, parts.day, hour1, 0, 0);
    }
    if (crossedMinutes >= hour1 * 60 && crossedMinutes < hour2 * 60) {
      return new Date(parts.year, parts.month - 1, parts.day, hour2, 0, 0);
    }
    return new Date(parts.year, parts.month - 1, parts.day + 1, hour1, 0, 0);
  }

  static getFuzzedTimeStr(date: Date): string {
    const parts = getDatePartsInIST(date);
    if (parts.hour >= 5 && parts.hour < 12) return 'Today Morning';
    if (parts.hour >= 12 && parts.hour < 17) return 'Today Afternoon';
    if (parts.hour >= 17 && parts.hour < 21) return 'Today Evening';
    return 'Tonight';
  }

  async updateLocation(userId: number, latitude: number, longitude: number) {
    const timestamp = new Date();
    const hexId = H3Service.latLngToHex(latitude, longitude);
    const proximity = ProximityService.getInstance();
    const { newEncounters } = await proximity.enterHexagon(userId, latitude, longitude, timestamp);

    if (newEncounters.length > 0) {
      await this.processValidEncounters(newEncounters, timestamp);
    }

    return { hex_id: hexId, encounters: newEncounters.length };
  }

  async updateLocationBatch(userId: number, points: { latitude: number; longitude: number; recorded_at: string }[]) {
    const routeService = RouteService.getInstance();
    const proximity = ProximityService.getInstance();
    let totalEncounters = 0;

    const routePoints = points.map(p => ({
      userId,
      latitude: p.latitude,
      longitude: p.longitude,
      hexId: H3Service.latLngToHex(p.latitude, p.longitude),
      recordedAt: new Date(p.recorded_at),
    }));

    await routeService.insertRoutePointsBatch(routePoints);

    for (const p of points) {
      const timestamp = new Date(p.recorded_at);
      const { newEncounters } = await proximity.enterHexagon(userId, p.latitude, p.longitude, timestamp);
      if (newEncounters.length > 0) {
        await this.processValidEncounters(newEncounters, timestamp);
        totalEncounters += newEncounters.length;
      }
    }

    return { points_processed: points.length, encounters: totalEncounters };
  }

  async processValidEncounters(encounters: ValidEncounter[], timestamp: Date) {
    const cDate = istDateStr(timestamp);

    for (const enc of encounters) {
      const delayA = await this.getUserDelay(enc.userA);
      const delayB = await this.getUserDelay(enc.userB);

      const revealTimeA = new Date(timestamp.getTime() + delayA * 60000);
      const revealTimeB = new Date(timestamp.getTime() + delayB * 60000);

      const notificationTime = revealTimeA > revealTimeB ? revealTimeA : revealTimeB;

      const settingsB = await this.getUserSettings(enc.userB);
      const recapSlot = this.computeRecapSlotTime(timestamp, settingsB.hour1, settingsB.hour2);

      try {
        const [event, created] = await CrossEvent.findOrCreate({
          where: { user1Id: enc.userA, user2Id: enc.userB, crossDateIst: cDate },
          defaults: {
            user1Id: enc.userA,
            user2Id: enc.userB,
            hexId: enc.hexId,
            crossDateIst: cDate,
            crossedAt: timestamp,
            revealTimeA,
            revealTimeB,
            notificationTime,
            recapSlotTime: recapSlot,
            notified: false,
            published: true,
          } as any
        });

        if (created) {
          const q = getNotificationQueue();
          const delayMs = Math.max(0, notificationTime.getTime() - Date.now());

          await q.add('send-crossing-push',
            { eventId: event.id, userA: enc.userA, userB: enc.userB },
            {
              delay: delayMs,
              jobId: `cross-push-${event.id}`,
              removeOnComplete: true
            }
          );
        }
      } catch (e) {
        // Silently catch race conditions (duplicate entry constraint)
      }
    }
  }

  async getRecentCrosses(userId: number, limit: number = 50, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
        crossedAt: { [Op.gte]: since },
      },
      order: [['crossedAt', 'DESC']],
      limit,
    });

    return Promise.all(events.map(e => this.enrichEventForUI(userId, e)));
  }

  async getEventsByDate(userId: number, date: string) {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
        crossDateIst: date,
      },
      order: [['crossedAt', 'DESC']],
    });

    return Promise.all(events.map(e => this.enrichEventForUI(userId, e)));
  }

  async getEnrichedCrossEvents(userId: number, limit: number = 50) {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
      },
      order: [['notificationTime', 'DESC']],
      limit,
    });

    return Promise.all(events.map(e => this.enrichEventForUI(userId, e)));
  }

  async getRecapHistory(userId: number) {
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
      },
      order: [['crossedAt', 'DESC']],
      limit: 200,
    });

    const grouped: Record<string, { date: string; total: number; unlocked: number; friend_total: number; friend_unlocked: number; unknown_total: number; unknown_unlocked: number }> = {};
    const now = new Date();

    for (const e of events) {
      const date = e.crossDateIst;
      if (!grouped[date]) {
        grouped[date] = { date, total: 0, unlocked: 0, friend_total: 0, friend_unlocked: 0, unknown_total: 0, unknown_unlocked: 0 };
      }
      const g = grouped[date];
      g.total++;
      const isUnlocked = now >= e.recapSlotTime;
      if (isUnlocked) g.unlocked++;

      const otherId = userId === e.user1Id ? e.user2Id : e.user1Id;
      const friendship = await Friend.findOne({
        where: {
          [Op.or]: [
            { requesterId: userId, addresseeId: otherId },
            { requesterId: otherId, addresseeId: userId },
          ],
          status: 'accepted',
        },
      });

      if (friendship) {
        g.friend_total++;
        if (isUnlocked) g.friend_unlocked++;
      } else {
        g.unknown_total++;
        if (isUnlocked) g.unknown_unlocked++;
      }
    }

    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }

  async getRouteTimeline(userId: number) {
    const routeService = RouteService.getInstance();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const points = await routeService.getUserRoute(userId, since);

    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
        crossedAt: { [Op.gte]: since },
      },
      order: [['crossedAt', 'ASC']],
    });

    const timeline: { type: string; time: string; latitude: number; longitude: number; hex_id: string | null; label: string | null }[] = [];

    for (const p of points) {
      timeline.push({
        type: 'route',
        time: p.recordedAt.toISOString(),
        latitude: p.latitude,
        longitude: p.longitude,
        hex_id: p.hexId,
        label: null,
      });
    }

    for (const e of events) {
      const otherId = userId === e.user1Id ? e.user2Id : e.user1Id;
      const other = await User.findByPk(otherId, { attributes: ['firstName', 'lastName'] });
      const center = H3Service.hexToCenter(e.hexId);
      timeline.push({
        type: 'cross',
        time: e.crossedAt.toISOString(),
        latitude: center.lat,
        longitude: center.lng,
        hex_id: e.hexId,
        label: other ? `${other.firstName} ${other.lastName}` : 'Someone',
      });
    }

    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return timeline;
  }

  async getDashboardStats(userId: number) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayCount = await CrossEvent.count({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
        crossedAt: { [Op.gte]: todayStart },
      },
    });

    const totalCount = await CrossEvent.count({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
      },
    });

    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
      },
      attributes: ['user1Id', 'user2Id'],
    });

    const uniqueIds = new Set<number>();
    for (const e of events) {
      uniqueIds.add(e.user1Id === userId ? e.user2Id : e.user1Id);
    }

    return {
      crosses_today: todayCount,
      total_crosses: totalCount,
      unique_people: uniqueIds.size,
    };
  }

  async generateAndStoreRecap(userId: number, _dateStr: string, _period: 'am' | 'pm') {
    const now = new Date();
    const events = await CrossEvent.findAll({
      where: {
        [Op.or]: [{ user1Id: userId }, { user2Id: userId }],
        notified: true,
        published: false,
        recapSlotTime: { [Op.lte]: now },
      },
    });

    for (const e of events) {
      await e.update({ published: true });
    }

    return { events_processed: events.length };
  }

  private async enrichEventForUI(userId: number, e: CrossEvent) {
    const otherId = userId === e.user1Id ? e.user2Id : e.user1Id;
    const now = new Date();

    const isFullyRevealed = now >= e.recapSlotTime;

    const other = await User.findByPk(otherId, {
      attributes: ['id', 'firstName', 'lastName', 'profilePicture'],
    });

    const friendship = await Friend.findOne({
      where: {
        [Op.or]: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
        status: 'accepted',
      },
    });

    return {
      id: e.id,
      other_user: other ? {
        id: isFullyRevealed ? other.id : null,
        first_name: isFullyRevealed ? other.firstName : `${other.firstName.charAt(0)}*`,
        last_name: other.lastName,
        profile_picture: other.profilePicture,
        blurred: !isFullyRevealed,
      } : null,
      fuzzed_time_str: CrossingService.getFuzzedTimeStr(e.crossedAt),
      cross_date_ist: e.crossDateIst,
      is_unlocked: isFullyRevealed,
      is_friend: !!friendship,
      profile_accessible: isFullyRevealed,
      reveal_stage: isFullyRevealed ? 2 : 1,
      recap_slot_time: e.recapSlotTime.toISOString(),
      slot_unlock_at: e.recapSlotTime.toISOString(),
      crossed_at: e.crossedAt.toISOString(),
    };
  }
}
