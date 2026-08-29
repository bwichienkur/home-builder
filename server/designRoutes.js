/**
 * Design library API — Neon designs table, else data/designs-store.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/designs-store.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(map) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(map, null, 2));
}

async function ensureDesignsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS designs (
      code text PRIMARY KEY,
      user_id text,
      name text NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export function mountDesignRoutes(app) {
  app.get('/api/designs', async (req, res) => {
    try {
      const db = getPool();
      const userId = req.header('x-user-id') || null;
      if (db) {
        await ensureDesignsTable(db);
        const { rows } = userId
          ? await db.query(
              `SELECT code, name, payload, created_at AS "createdAt", updated_at AS "updatedAt", user_id AS "userId"
               FROM designs WHERE user_id = $1 OR user_id IS NULL ORDER BY updated_at DESC LIMIT 200`,
              [userId],
            )
          : await db.query(
              `SELECT code, name, payload, created_at AS "createdAt", updated_at AS "updatedAt", user_id AS "userId"
               FROM designs ORDER BY updated_at DESC LIMIT 200`,
            );
        return res.json({ items: rows, backend: 'postgres' });
      }
      const map = readFile();
      const items = Object.values(map).sort((a, b) =>
        String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)),
      );
      res.json({ items, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list designs' });
    }
  });

  app.get('/api/designs/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      const db = getPool();
      if (db) {
        await ensureDesignsTable(db);
        const { rows } = await db.query(
          `SELECT code, name, payload, created_at AS "createdAt", updated_at AS "updatedAt"
           FROM designs WHERE code = $1`,
          [code],
        );
        if (!rows[0]) return res.sendStatus(404);
        return res.json({ ...rows[0], backend: 'postgres' });
      }
      const entry = readFile()[code];
      if (!entry) return res.sendStatus(404);
      res.json({ ...entry, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load design' });
    }
  });

  app.put('/api/designs/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      const name = String(req.body?.name || 'Untitled design');
      const payload = req.body?.payload;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'payload object required' });
      }
      const userId = req.header('x-user-id') || null;
      const now = new Date().toISOString();
      const db = getPool();
      if (db) {
        await ensureDesignsTable(db);
        await db.query(
          `INSERT INTO designs (code, user_id, name, payload, created_at, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, COALESCE((SELECT created_at FROM designs WHERE code = $1), $5::timestamptz), $5::timestamptz)
           ON CONFLICT (code) DO UPDATE SET
             name = excluded.name,
             payload = excluded.payload,
             user_id = COALESCE(excluded.user_id, designs.user_id),
             updated_at = excluded.updated_at`,
          [code, userId, name, JSON.stringify(payload), now],
        );
        return res.json({ ok: true, code, backend: 'postgres' });
      }
      const map = readFile();
      const existing = map[code];
      map[code] = {
        code,
        name,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        payload,
      };
      writeFile(map);
      res.json({ ok: true, code, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save design' });
    }
  });

  app.delete('/api/designs/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      const db = getPool();
      if (db) {
        await ensureDesignsTable(db);
        await db.query(`DELETE FROM designs WHERE code = $1`, [code]);
        return res.json({ ok: true, backend: 'postgres' });
      }
      const map = readFile();
      delete map[code];
      writeFile(map);
      res.json({ ok: true, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete design' });
    }
  });
}
