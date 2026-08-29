/**
 * Vercel serverless for /api/auth/* and /api/admin/*
 * Path restored from rewrite query so Express route matchers still work.
 */
import { mountAuthRoutes } from '../server/authRoutes.js';
import { vercelExpress } from '../server/vercelExpressMount.js';

const handler = vercelExpress('auth', mountAuthRoutes);

function restorePath(req) {
  const path = req.query?.__path;
  if (path == null || path === '') return;
  const segments = Array.isArray(path) ? path.join('/') : String(path);
  const base = req.query?.__admin ? '/api/admin' : '/api/auth';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === '__path' || k === '__admin') continue;
    if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
    else if (v != null) q.set(k, String(v));
  }
  const qs = q.toString();
  req.url = `${base}/${segments}${qs ? `?${qs}` : ''}`;
}

export default function authHandler(req, res) {
  restorePath(req);
  return handler(req, res);
}
