/**
 * Optional CRM file-store API (used when DATABASE_URL is unset).
 * Browser still uses localStorage via Zustand; these routes enable future sync.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../../data/crm-store.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return { clients: [], vendors: [], inventory: [], customFields: [], housePlans: [] };
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

export function mountCrmRoutes(app) {
  app.get('/api/crm/:collection', (req, res) => {
    const store = readStore();
    const key = req.params.collection;
    if (!(key in store)) return res.status(404).json({ error: 'Unknown collection' });
    res.json({ items: store[key] });
  });

  app.put('/api/crm/:collection', (req, res) => {
    const store = readStore();
    const key = req.params.collection;
    if (!(key in store)) return res.status(404).json({ error: 'Unknown collection' });
    if (!Array.isArray(req.body?.items)) return res.status(400).json({ error: 'items array required' });
    store[key] = req.body.items;
    writeStore(store);
    res.json({ ok: true, count: store[key].length });
  });
}
