"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteService = void 0;
const pg_1 = require("pg");
const env_1 = require("../../config/env");
class RouteService {
    static instance;
    pool = null;
    status = 'disconnected';
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new RouteService();
        }
        return this.instance;
    }
    async connect() {
        try {
            this.pool = new pg_1.Pool({ connectionString: env_1.env.PG_DATABASE_URL, max: 10 });
            // Test connection
            const client = await this.pool.connect();
            await this.createTables(client);
            client.release();
            this.status = 'connected';
            console.log('🟢 PostgreSQL/TimescaleDB connected');
            return true;
        }
        catch (err) {
            this.status = 'error';
            console.warn('🟡 PostgreSQL/TimescaleDB unavailable — route storage disabled');
            this.pool = null;
            return false;
        }
    }
    async createTables(client) {
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
        }
        catch { /* not TimescaleDB, skip */ }
        // Indexes
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_route_points_user_hex
      ON route_points (user_id, hex_id, recorded_at DESC);
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_route_points_hex_time
      ON route_points (hex_id, recorded_at DESC);
    `);
        // Auto-drop retention policy (TimescaleDB)
        try {
            await client.query(`SELECT add_retention_policy('route_points', INTERVAL '24 hours', if_not_exists => TRUE);`);
        }
        catch { /* not TimescaleDB, skip */ }
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
        }
        catch { /* skip */ }
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_crossing_routes_users
      ON crossing_routes (user1_id, user2_id, crossed_at DESC);
    `);
        try {
            await client.query(`SELECT add_retention_policy('crossing_routes', INTERVAL '30 days', if_not_exists => TRUE);`);
        }
        catch { /* skip */ }
        // Cleanup old route_points (non-TimescaleDB fallback)
        try {
            await client.query(`DELETE FROM route_points WHERE recorded_at < NOW() - INTERVAL '24 hours';`);
        }
        catch { /* skip */ }
    }
    isAvailable() {
        return this.status === 'connected' && this.pool !== null;
    }
    getStatus() {
        return this.status;
    }
    async insertRoutePoint(point) {
        if (!this.isAvailable())
            return;
        try {
            await this.pool.query(`INSERT INTO route_points (user_id, latitude, longitude, hex_id, recorded_at) VALUES ($1, $2, $3, $4, $5)`, [point.userId, point.latitude, point.longitude, point.hexId, point.recordedAt]);
        }
        catch (err) {
            console.error('RouteService insertRoutePoint error:', err);
        }
    }
    async insertCrossingRoute(crossing) {
        if (!this.isAvailable())
            return;
        try {
            await this.pool.query(`INSERT INTO crossing_routes (user1_id, user2_id, hex_id, lat1, lng1, lat2, lng2, crossed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [crossing.user1Id, crossing.user2Id, crossing.hexId, crossing.lat1, crossing.lng1, crossing.lat2, crossing.lng2, crossing.crossedAt]);
        }
        catch (err) {
            console.error('RouteService insertCrossingRoute error:', err);
        }
    }
    async getUserRoute(userId, since = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
        if (!this.isAvailable())
            return [];
        try {
            const result = await this.pool.query(`SELECT user_id, latitude, longitude, hex_id, recorded_at FROM route_points WHERE user_id = $1 AND recorded_at >= $2 ORDER BY recorded_at ASC`, [userId, since]);
            return result.rows.map(r => ({
                userId: r.user_id,
                latitude: r.latitude,
                longitude: r.longitude,
                hexId: r.hex_id,
                recordedAt: r.recorded_at,
            }));
        }
        catch (err) {
            console.error('RouteService getUserRoute error:', err);
            return [];
        }
    }
    async getCrossingRouteHistory(userId, limit = 50) {
        if (!this.isAvailable())
            return [];
        try {
            const result = await this.pool.query(`SELECT user1_id, user2_id, hex_id, lat1, lng1, lat2, lng2, crossed_at FROM crossing_routes WHERE user1_id = $1 OR user2_id = $1 ORDER BY crossed_at DESC LIMIT $2`, [userId, limit]);
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
        }
        catch (err) {
            console.error('RouteService getCrossingRouteHistory error:', err);
            return [];
        }
    }
    async getHexAtTime(userId, timestamp) {
        if (!this.isAvailable())
            return null;
        try {
            const result = await this.pool.query(`SELECT hex_id FROM route_points WHERE user_id = $1 AND recorded_at <= $2 ORDER BY recorded_at DESC LIMIT 1`, [userId, timestamp]);
            return result.rows.length > 0 ? result.rows[0].hex_id : null;
        }
        catch (err) {
            console.error('RouteService getHexAtTime error:', err);
            return null;
        }
    }
    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
        this.status = 'disconnected';
    }
    async cleanupOldRoutes() {
        if (!this.isAvailable())
            return;
        try {
            await this.pool.query(`DELETE FROM route_points WHERE recorded_at < NOW() - INTERVAL '24 hours'`);
        }
        catch (err) {
            console.error('RouteService cleanupOldRoutes error:', err);
        }
    }
}
exports.RouteService = RouteService;
//# sourceMappingURL=RouteService.js.map