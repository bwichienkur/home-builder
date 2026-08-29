/**
 * Operations snapshot API — Postgres when DATABASE_URL is set, else data/ops-store.json.
 * Mirrors CRM's file-store path so local `npm run server` works without a database.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/ops-store.json');

const EMPTY = {
  version: 1,
  settings: {
    targetMarginPct: 15,
    projectedMarginPct: 0,
    rollingRevenue12Mo: 0,
    refreshedAt: new Date().toISOString(),
  },
  jobs: [],
  logs: [],
  tasks: [],
  selections: [],
  deals: [],
  people: [],
};

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ops_snapshots (
      id text PRIMARY KEY DEFAULT 'default',
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function readFileStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return null;
  }
}

function writeFileStore(payload) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(payload, null, 2));
}

export async function loadOpsPayload() {
  const db = getPool();
  if (db) {
    await ensureTable(db);
    const { rows } = await db.query(`SELECT payload FROM ops_snapshots WHERE id = 'default'`);
    if (rows[0]?.payload) return { snapshot: rows[0].payload, backend: 'postgres' };
    return { snapshot: null, backend: 'postgres' };
  }
  const file = readFileStore();
  return { snapshot: file, backend: 'file' };
}

export async function saveOpsPayload(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.jobs)) {
    const err = new Error('Invalid OpsSnapshot');
    err.status = 400;
    throw err;
  }
  const db = getPool();
  if (db) {
    await ensureTable(db);
    await db.query(
      `INSERT INTO ops_snapshots (id, payload, updated_at) VALUES ('default', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()`,
      [JSON.stringify(snapshot)],
    );
    return { backend: 'postgres' };
  }
  writeFileStore(snapshot);
  return { backend: 'file' };
}

export function emptyOpsPayload() {
  return structuredClone(EMPTY);
}

export function mountOpsRoutes(app) {
  app.get('/api/ops', async (_req, res) => {
    try {
      const { snapshot, backend } = await loadOpsPayload();
      res.json({ snapshot: snapshot ?? emptyOpsPayload(), backend, empty: !snapshot });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load operations snapshot' });
    }
  });

  app.put('/api/ops', async (req, res) => {
    try {
      const snapshot = req.body?.snapshot ?? req.body;
      const { backend } = await saveOpsPayload(snapshot);
      res.json({
        ok: true,
        backend,
        counts: {
          jobs: snapshot.jobs?.length ?? 0,
          logs: snapshot.logs?.length ?? 0,
          tasks: snapshot.tasks?.length ?? 0,
          selections: snapshot.selections?.length ?? 0,
          deals: snapshot.deals?.length ?? 0,
          people: snapshot.people?.length ?? 0,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || 'Failed to save operations snapshot' });
    }
  });
}
