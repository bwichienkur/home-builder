/**
 * Vercel serverless for /api/drawing-packages/:id
 */
import { mountDrawingPackageRoutes } from '../server/drawingPackageRoutes.js';
import { vercelExpress } from '../server/vercelExpressMount.js';

const handler = vercelExpress('drawing-packages', mountDrawingPackageRoutes, { jsonLimit: '32mb' });

function restorePath(req) {
  const id = req.query?.__id;
  if (id == null || id === '') return;
  const resolved = Array.isArray(id) ? id[0] : String(id);
  req.url = `/api/drawing-packages/${resolved}`;
}

export default function drawingPackagesHandler(req, res) {
  restorePath(req);
  return handler(req, res);
}
