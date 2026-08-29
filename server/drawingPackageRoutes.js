/**
 * Drawing packages API — Neon drawing_packages, else data/drawing-packages-store.json.
 * PDF stored as base64 text for simple JSON transport.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './dbPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data/drawing-packages-store.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return {};
  }
}

function writeFile(map) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(map));
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS drawing_packages (
      id text PRIMARY KEY,
      user_id text,
      meta jsonb NOT NULL,
      sheet_svgs jsonb NOT NULL DEFAULT '{}'::jsonb,
      plan_json jsonb,
      pdf_base64 text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export function mountDrawingPackageRoutes(app) {
  app.get('/api/drawing-packages/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const db = getPool();
      if (db) {
        await ensureTable(db);
        const { rows } = await db.query(
          `SELECT id, meta, sheet_svgs AS "sheetSvgs", plan_json AS plan, pdf_base64 AS "pdfBase64",
                  user_id AS "userId", updated_at AS "updatedAt"
           FROM drawing_packages WHERE id = $1`,
          [id],
        );
        if (!rows[0]) return res.sendStatus(404);
        return res.json({ ...rows[0], backend: 'postgres' });
      }
      const entry = readFile()[id];
      if (!entry) return res.sendStatus(404);
      res.json({ ...entry, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load drawing package' });
    }
  });

  app.put('/api/drawing-packages/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      const meta = req.body?.meta;
      if (!meta || typeof meta !== 'object') return res.status(400).json({ error: 'meta object required' });
      const sheetSvgs = req.body?.sheetSvgs ?? {};
      const plan = req.body?.plan ?? null;
      const pdfBase64 = typeof req.body?.pdfBase64 === 'string' ? req.body.pdfBase64 : null;
      const userId = req.header('x-user-id') || null;
      const db = getPool();
      if (db) {
        await ensureTable(db);
        await db.query(
          `INSERT INTO drawing_packages (id, user_id, meta, sheet_svgs, plan_json, pdf_base64, updated_at)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, now())
           ON CONFLICT (id) DO UPDATE SET
             meta = excluded.meta,
             sheet_svgs = excluded.sheet_svgs,
             plan_json = excluded.plan_json,
             pdf_base64 = excluded.pdf_base64,
             user_id = COALESCE(excluded.user_id, drawing_packages.user_id),
             updated_at = now()`,
          [id, userId, JSON.stringify(meta), JSON.stringify(sheetSvgs), plan ? JSON.stringify(plan) : null, pdfBase64],
        );
        return res.json({ ok: true, id, backend: 'postgres' });
      }
      const map = readFile();
      map[id] = { id, meta, sheetSvgs, plan, pdfBase64, userId };
      writeFile(map);
      res.json({ ok: true, id, backend: 'file' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save drawing package' });
    }
  });
}
