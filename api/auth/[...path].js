/**
 * Vercel serverless catch-all for /api/auth/*
 */
import { mountAuthRoutes } from '../../server/authRoutes.js';
import { vercelExpress } from '../_expressMount.js';

const handler = vercelExpress('auth', mountAuthRoutes);

export default function authHandler(req, res) {
  return handler(req, res);
}
