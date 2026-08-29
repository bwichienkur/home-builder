/**
 * Generic jsonb snapshot helpers (ops_snapshots pattern).
 */
import { getPool } from './dbPool.js';

export async function ensureSnapshotTable(db, table) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id text PRIMARY KEY DEFAULT 'default',
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function loadSnapshot(table, id = 'default') {
  const db = getPool();
  if (!db) return { payload: null, backend: 'none' };
  await ensureSnapshotTable(db, table);
  const { rows } = await db.query(`SELECT payload FROM ${table} WHERE id = $1`, [id]);
  return { payload: rows[0]?.payload ?? null, backend: 'postgres' };
}

export async function saveSnapshot(table, payload, id = 'default') {
  const db = getPool();
  if (!db) {
    const err = new Error('DATABASE_URL is not configured');
    err.status = 503;
    throw err;
  }
  await ensureSnapshotTable(db, table);
  await db.query(
    `INSERT INTO ${table} (id, payload, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()`,
    [id, JSON.stringify(payload)],
  );
  return { backend: 'postgres' };
}
