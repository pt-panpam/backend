import { RedisService } from './RedisService';
import { H3Service } from './H3Service';

interface HeatmapCell {
  hex_id: string;
  count: number;
  boundary: [number, number][];
}

export class HeatmapService {
  static async getHeatmap(): Promise<HeatmapCell[]> {
    const redis = RedisService.getInstance();
    if (!redis.isAvailable()) return [];

    try {
      const keys = await redis.scanHexKeys();
      const cells: HeatmapCell[] = [];

      for (const key of keys) {
        const hexId = key.replace('hex:', '');
        const members = await redis.getHexOccupants(hexId);
        if (members.length === 0) continue;

        try {
          const boundary = H3Service.hexToBoundary(hexId);
          cells.push({ hex_id: hexId, count: members.length, boundary });
        } catch {
          // skip invalid hex
        }
      }

      return cells;
    } catch (err) {
      console.error('HeatmapService error:', err);
      return [];
    }
  }
}
