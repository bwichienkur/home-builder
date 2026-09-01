import { readJsonBodySync } from '../../server/buildertrend/vercelRefresh.js';
import { pullPipedrive } from '../../server/pipedrive/pull.js';

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

export default async function handler(req, res) {
  try {
    try {
      normalizeBody(req);
    } catch {
      return res.status(400).json({
        ok: false,
        error: 'Could not parse JSON body. Send { "token": "..." }.',
        code: 'bad_body',
      });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
    }
    const body = readJsonBodySync(req);
    const token = typeof body?.token === 'string' ? body.token : undefined;
    const payload = await pullPipedrive({ token });
    res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('pipedrive refresh fatal', err);
    if (!res.headersSent) {
      const status = Number(err?.status) || 500;
      res.status(status).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'Pipedrive refresh failed on the server.',
        code: err?.code || 'refresh_failed',
      });
    }
  }
}
