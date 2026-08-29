/**
 * Shared Neon / Postgres pool for ops-style snapshot routes.
 */
import pg from 'pg';

let pool = null;

export function databaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  ).trim();
}

function poolSsl(url) {
  // Neon and most hosted Postgres require TLS. Avoid crashing on cert chain mismatches in serverless.
  if (/neon\.tech|sslmode=require|sslmode=verify/i.test(url) || url.includes('ssl=true')) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: poolSsl(url),
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
    // Unhandled pool 'error' crashes the Vercel isolate → FUNCTION_INVOCATION_FAILED.
    pool.on('error', (err) => {
      console.error('pg pool error', err?.message || err);
    });
  }
  return pool;
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}
