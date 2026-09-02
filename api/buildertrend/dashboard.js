import { handleDashboard } from '../../server/buildertrend/http.js';

/**
 * Ping is folded into this function so Hobby stays at ≤12 serverless entries
 * (formerly api/buildertrend/ping.js). Rewrite: /api/buildertrend/ping → ?__ping=1
 */
export default async function handler(req, res) {
  try {
    if (req.query?.__ping === '1' || req.query?.__ping === 'true') {
      return res.status(200).json({
        ok: true,
        service: 'buildertrend',
        ping: true,
        at: new Date().toISOString(),
      });
    }
    await handleDashboard(req, res);
  } catch (err) {
    console.error('buildertrend dashboard handler error', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : 'Buildertrend dashboard read failed on the server.',
        code: 'refresh_failed',
      });
    }
  }
}
