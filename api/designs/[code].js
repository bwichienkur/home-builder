/**
 * Vercel serverless: GET/PUT/DELETE /api/designs/:code
 */
import { mountDesignRoutes } from '../../server/designRoutes.js';
import { vercelExpress } from '../_expressMount.js';

const handler = vercelExpress('designs-code', mountDesignRoutes, { jsonLimit: '8mb' });

export default function designsCode(req, res) {
  return handler(req, res);
}
