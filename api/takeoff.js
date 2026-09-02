/**
 * Single takeoff serverless entry (Hobby plan ≤12 functions).
 * Routes: /api/takeoff/ai and /api/takeoff/project via vercel.json rewrites → ?__path=
 */
import { handleTakeoffAi, handleTakeoffProject } from '../server/takeoffHttp.js';

export const config = { maxDuration: 60 };

function normalizeBody(req) {
  if (req.body == null) return;
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8').trim();
    req.body = raw ? JSON.parse(raw) : {};
    return;
  }
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    req.body = raw ? JSON.parse(raw) : {};
  }
}

function pathKey(req) {
  const q = req.query?.__path;
  if (typeof q === 'string' && q.trim()) return q.trim().toLowerCase();
  const url = String(req.url || '');
  if (url.includes('/ai')) return 'ai';
  if (url.includes('/project')) return 'project';
  return '';
}

export default async function handler(req, res) {
  try {
    try {
      normalizeBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: 'Bad JSON body.' });
    }
    const key = pathKey(req);
    if (key === 'ai') return await handleTakeoffAi(req, res);
    if (key === 'project') return await handleTakeoffProject(req, res);
    return res.status(404).json({
      ok: false,
      error: 'Use /api/takeoff/ai or /api/takeoff/project',
      code: 'unknown_takeoff_path',
    });
  } catch (err) {
    console.error('takeoff fatal', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err?.message || 'Takeoff failed' });
    }
  }
}
