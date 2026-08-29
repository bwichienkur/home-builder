/**
 * Vercel serverless: GET/PUT /api/trade-rates
 */
import { loadTradeRatesPayload, saveTradeRatesPayload } from '../server/tradeRatesRoutes.js';
import { applyCors, hasDatabaseUrl } from '../server/vercelCors.js';

export default async function handler(req, res) {
  applyCors(res, 'GET, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({
          error: 'Trade rates API needs DATABASE_URL (Neon). Link the integration and redeploy.',
        });
      }
      const { rates, backend } = await loadTradeRatesPayload();
      return res.status(200).json({ rates, backend, empty: !rates });
    }

    if (req.method === 'PUT') {
      if (!hasDatabaseUrl()) {
        return res.status(503).json({ error: 'Trade rates API needs DATABASE_URL (Neon).' });
      }
      const rates = req.body?.rates ?? req.body;
      const { backend } = await saveTradeRatesPayload(rates);
      return res.status(200).json({ ok: true, backend });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || 'Trade rates API error' });
  }
}
