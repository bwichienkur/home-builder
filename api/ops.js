/**
 * Vercel serverless: GET/PUT /api/ops
 * Requires Neon/Postgres via DATABASE_URL (set by Vercel ↔ Neon integration).
 */
import { loadOpsPayload, saveOpsPayload, emptyOpsPayload } from '../server/opsRoutes.js';

function hasDatabaseUrl() {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING,
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          error:
            'Operations API needs DATABASE_URL from the Neon Vercel integration. Confirm it under Project → Settings → Environment Variables, then redeploy.',
        });
      }
      const { snapshot, backend } = await loadOpsPayload();
      return res.status(200).json({ snapshot: snapshot ?? emptyOpsPayload(), backend, empty: !snapshot });
    }

    if (req.method === 'PUT') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          error: 'Operations API needs DATABASE_URL (Neon). Redeploy after the integration is linked.',
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
