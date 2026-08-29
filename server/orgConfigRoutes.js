/**
 * Org Build Config API — Neon org_configs, else data/org-config-store.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';
import { ensureSnapshotTable, loadSnapshot, saveSnapshot } from './snapshotStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/org-config-store.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return null;
  }
}

function writeFile(payload) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(payload, null, 2));
}

export async function loadOrgConfigPayload() {
  const db = getPool();
  if (db) {
    await ensureSnapshotTable(db, 'org_configs');
    const { payload, backend } = await loadSnapshot('org_configs');
    return { config: payload, backend };
  }
  return { config: readFile(), backend: 'file' };
}

export async function saveOrgConfigPayload(config) {
  if (!config || typeof config !== 'object') {
    const err = new Error('Invalid org config');
    err.status = 400;
    throw err;
  }
  const db = getPool();
  if (db) {
    await saveSnapshot('org_configs', config);
    return { backend: 'postgres' };
  }
  writeFile(config);
  return { backend: 'file' };
}

export function mountOrgConfigRoutes(app) {
  app.get('/api/org-config', async (_req, res) => {
    try {
      const { config, backend } = await loadOrgConfigPayload();
      res.json({ config, backend, empty: !config });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load org config' });
    }
  });

  app.put('/api/org-config', async (req, res) => {
    try {
      const config = req.body?.config ?? req.body;
      const { backend } = await saveOrgConfigPayload(config);
      res.json({ ok: true, backend });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || 'Failed to save org config' });
    }
  });
}
