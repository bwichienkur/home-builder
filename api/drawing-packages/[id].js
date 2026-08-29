/**
 * Vercel serverless: GET/PUT /api/drawing-packages/:id
 */
import { mountDrawingPackageRoutes } from '../../server/drawingPackageRoutes.js';
import { vercelExpress } from '../_expressMount.js';

const handler = vercelExpress('drawing-packages', mountDrawingPackageRoutes, { jsonLimit: '32mb' });

export default function drawingPackageHandler(req, res) {
  return handler(req, res);
}
