import { SafeZone } from '../../models/SafeZone';

export class SafeZoneService {
  private static instance: SafeZoneService;

  static getInstance(): SafeZoneService {
    if (!this.instance) {
      this.instance = new SafeZoneService();
    }
    return this.instance;
  }

  /**
   * Check if a given location falls within any of the user's active safe zones.
   * Uses the haversine formula to compute distance from zone center.
   */
  async isInSafeZone(userId: number, latitude: number, longitude: number): Promise<boolean> {
    try {
      const zones = await SafeZone.findAll({
        where: { userId, isActive: true },
      });

      for (const zone of zones) {
        const distance = this.haversineKm(
          latitude, longitude,
          zone.latitude, zone.longitude,
        );
        if (distance <= zone.radiusKm) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async getUserSafeZones(userId: number): Promise<SafeZone[]> {
    return SafeZone.findAll({
      where: { userId },
      order: [['created_at', 'DESC']],
    });
  }

  async createSafeZone(
    userId: number,
    latitude: number,
    longitude: number,
    radiusKm: number = 5,
    label: string = '',
  ): Promise<SafeZone> {
    return SafeZone.create({
      userId,
      latitude,
      longitude,
      radiusKm,
      label,
      isActive: true,
    } as any);
  }

  async updateSafeZone(
    id: number,
    userId: number,
    updates: Partial<{ latitude: number; longitude: number; radiusKm: number; label: string; isActive: boolean }>,
  ): Promise<SafeZone | null> {
    const zone = await SafeZone.findOne({ where: { id, userId } });
    if (!zone) return null;
    return zone.update(updates as any);
  }

  async deleteSafeZone(id: number, userId: number): Promise<boolean> {
    const deleted = await SafeZone.destroy({ where: { id, userId } });
    return deleted > 0;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
