/**
 * Shared Postgres pool for Express and Vercel.
 * On Vercel use Neon HTTP (`neon()`) — no TCP/WebSocket, works in serverless.
 * Local Express keeps classic `pg` Pool.
 */
import pg from 'pg';
import { neon } from '@neondatabase/serverless';

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

/** pg-compatible wrapper around Neon HTTP so callers can use `{ rows } = await db.query(...)`. */
function createNeonHttpClient(connectionString) {
  const sql = neon(connectionString, { fullResults: true });
  return {
    async query(text, params = []) {
      const result = await sql.query(text, params);
      // fullResults → { rows, fields, ... }; without it neon returns row array.
      if (Array.isArray(result)) {
        return { rows: result, rowCount: result.length };
      }
      return {
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
        fields: result.fields,
        command: result.command,
      };
    },
    on() {
      /* no-op — HTTP client has no idle socket events */
    },
    end() {
      return Promise.resolve();
    },
  };
}

function createPool() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  if (isVercelRuntime()) {
    return createNeonHttpClient(connectionString);
  }

  const needsSsl =
    process.env.PGSSLMODE === 'require' ||
    /neon\.tech|sslmode=require/i.test(connectionString);
  const p = new pg.Pool({
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
