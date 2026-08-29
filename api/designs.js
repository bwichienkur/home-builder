/**
 * Vercel serverless for /api/designs and /api/designs/:code
 */
import { mountDesignRoutes } from '../server/designRoutes.js';
import { vercelExpress } from '../server/vercelExpressMount.js';

const handler = vercelExpress('designs', mountDesignRoutes, { jsonLimit: '8mb' });

function restorePath(req) {
  const code = req.query?.__code;
  if (code == null || code === '') {
    if (!req.url || req.url === '/' || !String(req.url).startsWith('/api/')) {
      req.url = '/api/designs';
    }
    return;
  }
  const resolved = Array.isArray(code) ? code[0] : String(code);
  req.url = `/api/designs/${resolved}`;
}

export default function designsHandler(req, res) {
  restorePath(req);
  return handler(req, res);
}
