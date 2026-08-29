/**
 * Vercel serverless: GET/PUT /api/crm/:collection
 */
import { CRM_COLLECTIONS, loadCrm, saveCrm } from '../server/crmRoutes.js';
import { applyCors, hasDatabaseUrl } from '../server/vercelCors.js';

export default async function handler(req, res) {
  applyCors(res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = String(req.query.collection ?? '');
  if (!CRM_COLLECTIONS.includes(key)) {
    return res.status(404).json({ error: 'Unknown collection' });
  }

  try {
    if (!hasDatabaseUrl()) {
      return res.status(503).json({
        error: 'CRM API needs DATABASE_URL (Neon). Link the integration and redeploy.',
      });
    }

    if (req.method === 'GET') {
      const { store, backend } = await loadCrm();
      return res.status(200).json({ items: store[key] ?? [], backend });
    }

    if (req.method === 'PUT') {
      if (!Array.isArray(req.body?.items)) {
        return res.status(400).json({ error: 'items array required' });
      }
      const { store } = await loadCrm();
      store[key] = req.body.items;
      const { backend } = await saveCrm(store);
      return res.status(200).json({ ok: true, count: store[key].length, backend });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'CRM API error' });
  }
}
