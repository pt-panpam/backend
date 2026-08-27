import { Server } from 'socket.io';
import { CrossEvent } from '../../models/CrossEvent';
import { User } from '../../models/User';
import { Friend } from '../../models/Friend';
import { Op } from 'sequelize';
import { getDatePartsInIST } from '../../utils/timezone';
import { H3Service } from './H3Service';
import { EncounterService } from './EncounterService';

const CROSS_TITLE_TIERS = [
  { min: 1, max: 5, title: 'Stranger' },
  { min: 6, max: 10, title: 'Passerby' },
  { min: 11, max: 15, title: 'Dude' },
  { min: 16, max: 20, title: 'Familiar' },
  { min: 21, max: 25, title: 'Homie' },
  { min: 26, max: 30, title: 'Buddy' },
  { min: 31, max: 35, title: 'Friend' },
  { min: 36, max: 40, title: 'Close One' },
  { min: 41, max: 45, title: 'Bestie' },
  { min: 46, max: 50, title: 'Close Soul' },
];

const CROSS_RESET_DAYS = 30;
const CROSS_WARNING_DAYS = 5;

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

  static getCrossTitle(crossCount: number): string {
    if (crossCount <= 0) return 'Stranger';
    for (const tier of CROSS_TITLE_TIERS) {
      if (crossCount >= tier.min && crossCount <= tier.max) {
        return tier.title;
      }
    }
    return 'Close Soul';
  }

  static getDaysUntilReset(lastCrossedAt: Date): number {
    const now = new Date();
    const lastCross = new Date(lastCrossedAt);
    const diffMs = now.getTime() - lastCross.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysLeft = CROSS_RESET_DAYS - diffDays;
    return Math.max(0, daysLeft);
  }

  static isResetWarning(daysUntilReset: number): boolean {
    return daysUntilReset > 0 && daysUntilReset <= CROSS_WARNING_DAYS;
  }

  async getCrossCountBetweenUsers(userId1: number, userId2: number): Promise<number> {
    const userA = Math.min(userId1, userId2);
    const userB = Math.max(userId1, userId2);
    return CrossEvent.count({
      where: {
        user1Id: userA,
        user2Id: userB,
        notified: true,
      },
    });
  }

  async getLastCrossTimeBetweenUsers(userId1: number, userId2: number): Promise<Date | null> {
    const userA = Math.min(userId1, userId2);
    const userB = Math.max(userId1, userId2);
    const lastEvent = await CrossEvent.findOne({
      where: {
        user1Id: userA,
        user2Id: userB,
        notified: true,
      },
      order: [['crossedAt', 'DESC']],
      attributes: ['crossedAt'],
    });
    return lastEvent ? lastEvent.crossedAt : null;
  }

  async getCrossTitleInfo(userId1: number, userId2: number): Promise<{
    title: string;
    cross_count: number;
    days_until_reset: number;
    is_reset_warning: boolean;
  }> {
    const crossCount = await this.getCrossCountBetweenUsers(userId1, userId2);
    const title = CrossingService.getCrossTitle(crossCount);
    
    if (crossCount === 0) {
      return {
        title: 'Stranger',
        cross_count: 0,
        days_until_reset: CROSS_RESET_DAYS,
        is_reset_warning: false,
      };
    }

    const lastCrossTime = await this.getLastCrossTimeBetweenUsers(userId1, userId2);
    if (!lastCrossTime) {
      return {
        title,
        cross_count: crossCount,
        days_until_reset: CROSS_RESET_DAYS,
        is_reset_warning: false,
      };
    }

    const daysUntilReset = CrossingService.getDaysUntilReset(lastCrossTime);
    const isResetWarning = CrossingService.isResetWarning(daysUntilReset);

    if (daysUntilReset === 0) {
      return {
        title: 'Stranger',
        cross_count: 0,
        days_until_reset: 0,
        is_reset_warning: false,
      };
    }

    return {
      title,
      cross_count: crossCount,
      days_until_reset: daysUntilReset,
      is_reset_warning: isResetWarning,
    };
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
    const encounter = EncounterService.getInstance();
    const { hexId, newEncounters } = await encounter.onLocationUpdate(userId, latitude, longitude, timestamp);
    return { hex_id: hexId, encounters: newEncounters.length };
  }

  async updateLocationBatch(userId: number, points: { latitude: number; longitude: number; recorded_at: string }[]) {
    const encounter = EncounterService.getInstance();
    const { newEncounters } = await encounter.onLocationBatch(userId, points);
    return { points_processed: points.length, encounters: newEncounters.length };
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

    const grouped: Record<string, { 
      date: string; 
      total: number; 
      unlocked: number; 
      friend_total: number; 
      friend_unlocked: number; 
      unknown_total: number; 
      unknown_unlocked: number;
      user_titles: Record<number, { title: string; cross_count: number; days_until_reset: number; is_reset_warning: boolean }>;
    }> = {};
    const now = new Date();

    for (const e of events) {
      const date = e.crossDateIst;
      if (!grouped[date]) {
        grouped[date] = { 
          date, 
          total: 0, 
          unlocked: 0, 
          friend_total: 0, 
          friend_unlocked: 0, 
          unknown_total: 0, 
          unknown_unlocked: 0,
          user_titles: {}
        };
      }
      const g = grouped[date];
      g.total++;
      const isUnlocked = now >= e.recapSlotTime;
      if (isUnlocked) g.unlocked++;

      const otherId = userId === e.user1Id ? e.user2Id : e.user1Id;
      const friendship = await Friend.findOne({
        where: { userId, friendId: otherId },
      });

      if (friendship) {
        g.friend_total++;
        if (isUnlocked) g.friend_unlocked++;
      } else {
        g.unknown_total++;
        if (isUnlocked) g.unknown_unlocked++;
      }

      if (isUnlocked && !g.user_titles[otherId]) {
        const titleInfo = await this.getCrossTitleInfo(userId, otherId);
        g.user_titles[otherId] = titleInfo;
      }
    }

    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
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
      where: { userId, friendId: otherId },
    });

    const center = H3Service.hexToCenter(e.hexId);

    let crossTitleInfo = null;
    if (isFullyRevealed) {
      crossTitleInfo = await this.getCrossTitleInfo(userId, otherId);
    }

    return {
      id: e.id,
      other_user: other ? {
        id: isFullyRevealed ? other.id : null,
        first_name: isFullyRevealed ? other.firstName : null,
        last_name: isFullyRevealed ? other.lastName : null,
        profile_picture: isFullyRevealed ? other.profilePicture : null,
        blurred: !isFullyRevealed,
      } : null,
      latitude: center.lat,
      longitude: center.lng,
      hex_id: e.hexId,
      fuzzed_time_str: CrossingService.getFuzzedTimeStr(e.crossedAt),
      cross_date_ist: e.crossDateIst,
      is_unlocked: isFullyRevealed,
      is_friend: !!friendship,
      profile_accessible: isFullyRevealed,
      reveal_stage: isFullyRevealed ? 2 : 1,
      recap_slot_time: e.recapSlotTime.toISOString(),
      slot_unlock_at: e.recapSlotTime.toISOString(),
      crossed_at: e.crossedAt.toISOString(),
      cross_title: crossTitleInfo?.title || null,
      cross_count: crossTitleInfo?.cross_count || 0,
      days_until_reset: crossTitleInfo?.days_until_reset ?? null,
      is_reset_warning: crossTitleInfo?.is_reset_warning || false,
    };
  }
}
