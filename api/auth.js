/**
 * Vercel serverless for /api/auth/* and /api/admin/* — no Express body parser.
 * Path restored from rewrite query (?__path=…) so route dispatch works.
 */
import { applyCors } from '../server/vercelCors.js';
import { handleAuthRequest } from '../server/authRoutes.js';

function resolvePath(req) {
  const q = req.query || {};
  if (q.__path != null && q.__path !== '') {
    const segments = Array.isArray(q.__path) ? q.__path.join('/') : String(q.__path);
    return q.__admin ? `/api/admin/${segments}` : `/api/auth/${segments}`;
  }
  const raw = String(req.url || '').split('?')[0];
  if (raw.startsWith('/api/auth') || raw.startsWith('/api/admin')) return raw;
  const matched = req.headers?.['x-matched-path'] || req.headers?.['x-invoke-path'];
  if (matched) return String(matched).split('?')[0];
  return raw || '/api/auth';
}

export default async function authHandler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const path = resolvePath(req);
    const result = await handleAuthRequest({
      method: req.method,
      path,
      query: req.query || {},
      body: req.body,
      headers: req.headers || {},
    });
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Auth API error' });
  }
}
