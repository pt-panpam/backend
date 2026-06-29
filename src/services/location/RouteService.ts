import { Pool, QueryResult } from 'pg';
import { env } from '../../config/env';

export interface RoutePoint {
  userId: number;
  latitude: number;
  longitude: number;
  hexId: string;
  recordedAt: Date;
}

export interface CrossingRoute {
  user1Id: number;
  user2Id: number;
  hexId: string;
  lat1: number;
  lng1: number;
  lat2: number;
  lng2: number;
  crossedAt: Date;
}

export type RouteStorageStatus = 'connected' | 'disconnected' | 'error';

export class RouteService {
  private static instance: RouteService;
  private pool: Pool | null = null;
  private status: RouteStorageStatus = 'disconnected';

  private constructor() {}

  static getInstance(): RouteService {
    if (!this.instance) {
      this.instance = new RouteService();
    }
    return this.instance;
  }

  async connect(): Promise<boolean> {
    try {
      const pgUrl = env.PG_DATABASE_URL;
      const needsSsl = !pgUrl.includes('localhost') && !pgUrl.includes('127.0.0.1');
      this.pool = new Pool({
        connectionString: pgUrl,
        max: 10,
        ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      });

      // Test connection
      const client = await this.pool.connect();
      await this.createTables(client);
      client.release();

      this.status = 'connected';
      console.log('🟢 PostgreSQL/TimescaleDB connected');
      return true;
    } catch (err: any) {
      this.status = 'error';
      console.warn('🟡 PostgreSQL/TimescaleDB unavailable —', err.message || err);
      this.pool = null;
      return false;
    }
  }

  private async createTables(client: any): Promise<void> {
    // Route points table (TimescaleDB hypertable)
    await client.query(`
      CREATE TABLE IF NOT EXISTS route_points (
        user_id INTEGER NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        hex_id TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Convert to hypertable (TimescaleDB) — safe if not available
    try {
      await client.query(`SELECT create_hypertable('route_points', 'recorded_at', if_not_exists => TRUE);`);
    } catch { /* not TimescaleDB, skip */ }

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_route_points_user_hex
      ON route_points (user_id, hex_id, recorded_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_route_points_hex_time
      ON route_points (hex_id, recorded_at DESC);
    `);

    // Auto-drop retention policy (TimescaleDB) — 3 days
    try {
      await client.query(`SELECT add_retention_policy('route_points', INTERVAL '3 days', if_not_exists => TRUE);`);
    } catch { /* not TimescaleDB, skip */ }

    // Crossing routes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS crossing_routes (
        id BIGSERIAL PRIMARY KEY,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        hex_id TEXT NOT NULL,
        lat1 DOUBLE PRECISION NOT NULL,
        lng1 DOUBLE PRECISION NOT NULL,
        lat2 DOUBLE PRECISION NOT NULL,
        lng2 DOUBLE PRECISION NOT NULL,
        crossed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    try {
      await client.query(`SELECT create_hypertable('crossing_routes', 'crossed_at', if_not_exists => TRUE);`);
    } catch { /* skip */ }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crossing_routes_users
      ON crossing_routes (user1_id, user2_id, crossed_at DESC);
    `);

    try {
      await client.query(`SELECT add_retention_policy('crossing_routes', INTERVAL '30 days', if_not_exists => TRUE);`);
    } catch { /* skip */ }

    // Cleanup old route_points (non-TimescaleDB fallback) — 3 days
    try {
      await client.query(`DELETE FROM route_points WHERE recorded_at < NOW() - INTERVAL '3 days';`);
    } catch { /* skip */ }
  }

  isAvailable(): boolean {
    return this.status === 'connected' && this.pool !== null;
  }

  getStatus(): RouteStorageStatus {
    return this.status;
  }

  async insertRoutePoint(point: RoutePoint): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.pool!.query(
        `INSERT INTO route_points (user_id, latitude, longitude, hex_id, recorded_at) VALUES ($1, $2, $3, $4, $5)`,
        [point.userId, point.latitude, point.longitude, point.hexId, point.recordedAt]
      );
    } catch (err) {
      console.error('RouteService insertRoutePoint error:', err);
    }
  }

  async insertRoutePointsBatch(points: RoutePoint[]): Promise<void> {
    if (!this.isAvailable() || points.length === 0) return;
    try {
      // Build a batch insert with VALUES (...), (...), ...
      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const p of points) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        values.push(p.userId, p.latitude, p.longitude, p.hexId, p.recordedAt);
        idx += 5;
      }
      await this.pool!.query(
        `INSERT INTO route_points (user_id, latitude, longitude, hex_id, recorded_at) VALUES ${placeholders.join(', ')}`,
        values
      );
    } catch (err) {
      console.error('RouteService insertRoutePointsBatch error:', err);
    }
  }

  async insertCrossingRoute(crossing: CrossingRoute): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.pool!.query(
        `INSERT INTO crossing_routes (user1_id, user2_id, hex_id, lat1, lng1, lat2, lng2, crossed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [crossing.user1Id, crossing.user2Id, crossing.hexId, crossing.lat1, crossing.lng1, crossing.lat2, crossing.lng2, crossing.crossedAt]
      );
    } catch (err) {
      console.error('RouteService insertCrossingRoute error:', err);
    }
  }

  async getUserRoute(userId: number, since: Date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)): Promise<RoutePoint[]> {
    if (!this.isAvailable()) return [];
    try {
      const result: QueryResult = await this.pool!.query(
        `SELECT user_id, latitude, longitude, hex_id, recorded_at FROM route_points WHERE user_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC`,
        [userId, since]
      );
      return result.rows.map(r => ({
        userId: r.user_id,
        latitude: r.latitude,
        longitude: r.longitude,
        hexId: r.hex_id,
        recordedAt: r.recorded_at,
      }));
    } catch (err) {
      console.error('RouteService getUserRoute error:', err);
      return [];
    }
  }

  async getCrossingRouteHistory(userId: number, limit: number = 50): Promise<CrossingRoute[]> {
    if (!this.isAvailable()) return [];
    try {
      const result: QueryResult = await this.pool!.query(
        `SELECT user1_id, user2_id, hex_id, lat1, lng1, lat2, lng2, crossed_at FROM crossing_routes WHERE user1_id = $1 OR user2_id = $1 ORDER BY crossed_at DESC LIMIT $2`,
        [userId, limit]
      );
      return result.rows.map(r => ({
        user1Id: r.user1_id,
        user2Id: r.user2_id,
        hexId: r.hex_id,
        lat1: r.lat1,
        lng1: r.lng1,
        lat2: r.lat2,
        lng2: r.lng2,
        crossedAt: r.crossed_at,
      }));
    } catch (err) {
      console.error('RouteService getCrossingRouteHistory error:', err);
      return [];
    }
  }

  async getHexAtTime(userId: number, timestamp: Date): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      const result: QueryResult = await this.pool!.query(
        `SELECT hex_id FROM route_points WHERE user_id = $1 AND recorded_at <= $2 ORDER BY recorded_at DESC LIMIT 1`,
        [userId, timestamp]
      );
      return result.rows.length > 0 ? result.rows[0].hex_id : null;
    } catch (err) {
      console.error('RouteService getHexAtTime error:', err);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) { await this.pool.end(); this.pool = null; }
    this.status = 'disconnected';
  }

  async cleanupOldRoutes(days: number = 3): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.pool!.query(`DELETE FROM route_points WHERE recorded_at < NOW() - INTERVAL '${days} days'`);
    } catch (err) {
      console.error('RouteService cleanupOldRoutes error:', err);
    }
  }
}
