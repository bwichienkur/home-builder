import { handleVercelFullRefresh } from '../../server/buildertrend/vercelFullRefresh.js';

export const config = { maxDuration: 300 };

/**
 * Vercel Node body: often a Buffer or already-parsed object. Normalize before handler.
 * Never wait on the raw stream — that hangs and becomes a platform HTTP 500.
 */
function normalizeBody(req) {
  if (req.body == null) return;
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8').trim();
    req.body = raw ? JSON.parse(raw) : {};
    return;
  }
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    req.body = raw ? JSON.parse(raw) : {};
  }
}

export default async function handler(req, res) {
  try {
    try {
      normalizeBody(req);
    } catch {
      return res.status(400).json({
        ok: false,
        error: 'Could not parse JSON body. Send { "cookie": "..." }.',
        code: 'bad_body',
      });
    }
    await handleVercelFullRefresh(req, res);
  } catch (err) {
    console.error('buildertrend refresh fatal', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'Buildertrend refresh failed on the server.',
        code: 'refresh_failed',
      });
    }
  }
}
