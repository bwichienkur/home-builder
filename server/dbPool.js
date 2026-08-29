/**
 * Shared DB client for Express and Vercel.
 * Uses Neon HTTP (`neon()`) everywhere — works in serverless without TCP/`pg`.
 */
import { neon } from '@neondatabase/serverless';

let client = null;

function resolveConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ''
  );
}

/** pg-compatible wrapper: `{ rows } = await db.query(text, params)`. */
function createNeonHttpClient(connectionString) {
  const sql = neon(connectionString, { fullResults: true });
  return {
    async query(text, params = []) {
      const result = await sql.query(text, params);
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
      /* no-op */
    },
    end() {
      return Promise.resolve();
    },
  };
}

export function getPool() {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;
  if (!client) {
    try {
      client = createNeonHttpClient(connectionString);
    } catch (err) {
      console.error('[dbPool] failed to create client', err?.message || err);
      client = null;
    }
  }
  return client;
}
