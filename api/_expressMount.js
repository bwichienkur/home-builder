/**
 * Run an Express mount helper as a Vercel serverless request listener.
 * Used for auth/admin and designs/drawing-packages path trees.
 */
import express from 'express';

const apps = new Map();

export function vercelExpress(key, mountFn, { jsonLimit = '8mb' } = {}) {
  let app = apps.get(key);
  if (!app) {
    app = express();
    app.use(express.json({ limit: jsonLimit }));
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-api-key');
      if (req.method === 'OPTIONS') return res.status(204).end();
      next();
    });
    mountFn(app);
    apps.set(key, app);
  }
  return (req, res) => {
    app(req, res);
  };
}
