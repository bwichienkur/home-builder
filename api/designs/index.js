/**
 * Vercel serverless: GET /api/designs
 */
import { mountDesignRoutes } from '../../server/designRoutes.js';
import { vercelExpress } from '../_expressMount.js';

const handler = vercelExpress('designs', mountDesignRoutes, { jsonLimit: '8mb' });

export default function designsIndex(req, res) {
  return handler(req, res);
}
