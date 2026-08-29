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

export function getPool() {
  const url = databaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: url.includes('neon') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}
