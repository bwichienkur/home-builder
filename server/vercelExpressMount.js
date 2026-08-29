/**
 * Run an Express mount helper as a Vercel serverless request listener.
 * Vercel already parses JSON into req.body — never block on the body stream.
 */
import express from 'express';

const apps = new Map();

function ensureReqHelpers(req) {
  if (typeof req.header !== 'function') {
    req.header = function header(name) {
      const key = String(name || '').toLowerCase();
      const headers = this.headers || {};
      const raw = headers[key] ?? headers[name];
      return Array.isArray(raw) ? raw[0] : raw;
    };
  }
  if (!req.params) req.params = {};
  if (!req.query) {
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      req.query = Object.fromEntries(u.searchParams.entries());
    } catch {
      req.query = {};
    }
  }
}

export function vercelExpress(key, mountFn, { jsonLimit = '8mb' } = {}) {
  let app = apps.get(key);
  if (!app) {
    app = express();
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-api-key');
      if (req.method === 'OPTIONS') return res.status(204).end();
      next();
    });
    // Vercel Node runtime parses JSON before invoking the handler. Reading the
    // stream again with express.json() hangs until the function times out.
    app.use((req, res, next) => {
      if (req.body !== undefined) return next();
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.method === 'DELETE') {
        return next();
      }
      return express.json({ limit: jsonLimit })(req, res, next);
    });
    mountFn(app);
    apps.set(key, app);
  }
  return (req, res) => {
    ensureReqHelpers(req);
    app(req, res);
  };
}
