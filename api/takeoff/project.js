import { handleTakeoffProject } from '../../server/takeoffHttp.js';

export const config = { maxDuration: 30 };

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

export default async function handler(req, res) {
  try {
    try {
      normalizeBody(req);
    } catch {
      return res.status(400).json({ ok: false, error: 'Bad JSON body.' });
    }
    await handleTakeoffProject(req, res);
  } catch (err) {
    console.error('takeoff project fatal', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err?.message || 'Project failed' });
    }
  }
}
