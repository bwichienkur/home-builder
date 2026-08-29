/**
 * Vercel serverless catch-all for /api/admin/*
 * Auth routes also register /api/admin/users… on the same Express mount.
 */
import { mountAuthRoutes } from '../../server/authRoutes.js';
import { vercelExpress } from '../_expressMount.js';

const handler = vercelExpress('admin', mountAuthRoutes);

export default function adminHandler(req, res) {
  return handler(req, res);
}
