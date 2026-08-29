/**
 * Shared Postgres pool for Express and Vercel.
 * On Vercel, classic `pg` TCP often fails in serverless isolates — use
 * @neondatabase/serverless (WebSocket) instead.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let pool = null;

function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function resolveConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  );
}

function createPool() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  if (isVercelRuntime()) {
    const { Pool, neonConfig } = require('@neondatabase/serverless');
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws;
    const p = new Pool({ connectionString });
    p.on('error', (err) => {
      console.error('[dbPool] idle client error', err?.message || err);
    });
    return p;
  }

  const { Pool } = require('pg');
  const needsSsl =
    process.env.PGSSLMODE === 'require' ||
    /neon\.tech|sslmode=require/i.test(connectionString);
  const p = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  p.on('error', (err) => {
    console.error('[dbPool] idle client error', err?.message || err);
  });
  return p;
}

export function getPool() {
  if (!resolveConnectionString()) return null;
  if (!pool) {
    try {
      pool = createPool();
    } catch (err) {
      console.error('[dbPool] failed to create pool', err?.message || err);
      pool = null;
    }
  }
  return pool;
}
