import { latLngToCell, cellToBoundary, gridDisk, cellToLatLng } from 'h3-js';
import { env } from '../../config/env';

const RESOLUTION = env.H3_RESOLUTION;

export class H3Service {
  static latLngToHex(lat: number, lng: number): string {
    return latLngToCell(lat, lng, RESOLUTION);
  }

  static hexToBoundary(hex: string): [number, number][] {
    return cellToBoundary(hex) as [number, number][];
  }

  static hexToCenter(hex: string): { lat: number; lng: number } {
    const [lat, lng] = cellToLatLng(hex);
    return { lat, lng };
  }

  static getNeighborHexes(hex: string, radius: number = 1): string[] {
    return gridDisk(hex, radius);
  }

  static areInSameHex(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
    return this.latLngToHex(lat1, lng1) === this.latLngToHex(lat2, lng2);
  }
}
