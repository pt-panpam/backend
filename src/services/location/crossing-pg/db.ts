import { Pool } from 'pg';
import { env } from '../../../config/env';

/**
 * Dedicated PostgreSQL pool for the crossing system.
 * Uses a separate connection pool to avoid mixing raw SQL with Sequelize.
 */
const pgUrl = env.PG_DATABASE_URL;
const needsSsl = !pgUrl.includes('localhost') && !pgUrl.includes('127.0.0.1');

export const crossingPool = new Pool({
  connectionString: pgUrl,
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

crossingPool.on('error', (err) => {
  console.error('❌ Crossing PG pool error:', err.message);
});

/**
 * Acquire a client from the pool for transactional work.
 * Caller MUST release via client.release() or pool.releaseClient(client).
 */
export async function getClient() {
  return crossingPool.connect();
}

/**
 * Run a one-off query (non-transactional).
 */
export async function query(text: string, params?: any[]) {
  return crossingPool.query(text, params);
}

export default crossingPool;