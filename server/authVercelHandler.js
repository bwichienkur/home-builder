/** Shared thin Vercel auth endpoint helper (kept outside api/ so it is not deployed as a function). */
import { applyCors } from './vercelCors.js';
import { handleAuthRequest } from './authRoutes.js';

export async function runAuthPath(req, res, path) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
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
