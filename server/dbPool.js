'use strict';

/**
 * Shared Postgres pool for Express and Vercel.
 * On Vercel, classic `pg` TCP often fails in serverless isolates — use
 * @neondatabase/serverless (WebSocket) instead.
 */

let pool = null;

function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (isVercelRuntime()) {
    // eslint-disable-next-line global-require
    const { Pool, neonConfig } = require('@neondatabase/serverless');
    // eslint-disable-next-line global-require
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws;
    const p = new Pool({ connectionString });
    p.on('error', (err) => {
      console.error('[dbPool] idle client error', err?.message || err);
    });
    return p;
  }

  // eslint-disable-next-line global-require
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

function getPool() {
  if (!process.env.DATABASE_URL) return null;
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

module.exports = { getPool };
