/**
 * Vercel serverless: GET/PUT /api/org-config
 */
import { loadOrgConfigPayload, saveOrgConfigPayload } from '../server/orgConfigRoutes.js';
import { applyCors, hasDatabaseUrl } from '../server/vercelCors.js';

export default async function handler(req, res) {
  applyCors(res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          error: 'Org config API needs DATABASE_URL (Neon). Link the integration and redeploy.',
        });
      }
      const { config, backend } = await loadOrgConfigPayload();
      return res.status(200).json({ config, backend, empty: !config });
    }

    if (req.method === 'PUT') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({ error: 'Org config API needs DATABASE_URL (Neon).' });
      }
      const config = req.body?.config ?? req.body;
      const { backend } = await saveOrgConfigPayload(config);
      return res.status(200).json({ ok: true, backend });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || 'Org config API error' });
  }
}
