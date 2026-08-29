/**
 * CRM API — Neon crm_snapshots when DATABASE_URL is set, else data/crm-store.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';
import { ensureSnapshotTable, loadSnapshot, saveSnapshot } from './snapshotStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/crm-store.json');
const COLLECTIONS = ['clients', 'vendors', 'inventory', 'customFields', 'housePlans'];

function emptyStore() {
  return { clients: [], vendors: [], inventory: [], customFields: [], housePlans: [] };
}

function readFileStore() {
  try {
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(DATA, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function writeFileStore(data) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

export async function loadCrm() {
  const db = getPool();
  if (db) {
    await ensureSnapshotTable(db, 'crm_snapshots');
    const { payload, backend } = await loadSnapshot('crm_snapshots');
    return { store: payload ? { ...emptyStore(), ...payload } : emptyStore(), backend };
  }
  return { store: readFileStore(), backend: 'file' };
}

export async function saveCrm(store) {
  const db = getPool();
  if (db) {
    await saveSnapshot('crm_snapshots', store);
    return { backend: 'postgres' };
  }
  writeFileStore(store);
  return { backend: 'file' };
}

export { COLLECTIONS as CRM_COLLECTIONS, emptyStore as emptyCrmStore };

export function mountCrmRoutes(app) {
  app.get('/api/crm/:collection', async (req, res) => {
    try {
      const key = req.params.collection;
      if (!COLLECTIONS.includes(key)) return res.status(404).json({ error: 'Unknown collection' });
      const { store, backend } = await loadCrm();
      res.json({ items: store[key] ?? [], backend });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load CRM collection' });
    }
  });

  app.put('/api/crm/:collection', async (req, res) => {
    try {
      const key = req.params.collection;
      if (!COLLECTIONS.includes(key)) return res.status(404).json({ error: 'Unknown collection' });
      if (!Array.isArray(req.body?.items)) return res.status(400).json({ error: 'items array required' });
      const { store } = await loadCrm();
      store[key] = req.body.items;
      const { backend } = await saveCrm(store);
      res.json({ ok: true, count: store[key].length, backend });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save CRM collection' });
    }
  });
}
