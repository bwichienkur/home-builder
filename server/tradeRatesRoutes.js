/**
 * Trade rates API — Neon trade_rates, else data/trade-rates-store.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';
import { ensureSnapshotTable, loadSnapshot, saveSnapshot } from './snapshotStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/trade-rates-store.json');

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

export async function loadTradeRatesPayload() {
  const db = getPool();
  if (db) {
    await ensureSnapshotTable(db, 'trade_rates');
    const { payload, backend } = await loadSnapshot('trade_rates');
    return { rates: payload, backend };
  }
  return { rates: readFile(), backend: 'file' };
}

export async function saveTradeRatesPayload(rates) {
  if (!rates || typeof rates !== 'object') {
    const err = new Error('Invalid trade rates');
    err.status = 400;
    throw err;
  }
  const db = getPool();
  if (db) {
    await saveSnapshot('trade_rates', rates);
    return { backend: 'postgres' };
  }
  writeFile(rates);
  return { backend: 'file' };
}

export function mountTradeRatesRoutes(app) {
  app.get('/api/trade-rates', async (_req, res) => {
    try {
      const { rates, backend } = await loadTradeRatesPayload();
      res.json({ rates, backend, empty: !rates });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load trade rates' });
    }
  });

  app.put('/api/trade-rates', async (req, res) => {
    try {
      const rates = req.body?.rates ?? req.body;
      const { backend } = await saveTradeRatesPayload(rates);
      res.json({ ok: true, backend });
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || 'Failed to save trade rates' });
    }
  });
}
