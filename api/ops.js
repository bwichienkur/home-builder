/**
 * Vercel serverless: GET/PUT /api/ops
 * Requires DATABASE_URL (Postgres). File store is not durable on Vercel.
 */
import { loadOpsPayload, saveOpsPayload, emptyOpsPayload } from '../server/opsRoutes.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { snapshot, backend } = await loadOpsPayload();
      if (backend === 'file' && !process.env.DATABASE_URL) {
        return res.status(503).json({
          error: 'Operations HTTP API on Vercel requires DATABASE_URL (Postgres). Use local npm run server for file store.',
        });
      }
      return res.status(200).json({ snapshot: snapshot ?? emptyOpsPayload(), backend, empty: !snapshot });
    }

    if (req.method === 'PUT') {
      if (!process.env.DATABASE_URL) {
        return res.status(503).json({
          error: 'Operations HTTP API on Vercel requires DATABASE_URL (Postgres).',
        });
      }
      const snapshot = req.body?.snapshot ?? req.body;
      const { backend } = await saveOpsPayload(snapshot);
      return res.status(200).json({ ok: true, backend });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || 'Operations API error' });
  }
}
