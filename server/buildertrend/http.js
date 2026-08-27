import { pullBuildertrend, readCache } from './pull.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({
    ok: false,
    error: err?.message || 'Buildertrend refresh failed',
    code: err?.code || 'refresh_failed',
  });
}

/** Vercel may leave JSON bodies as strings; Express already parses objects. */
export async function readJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  // Raw stream (some serverless adapters)
  if (req.readable && !req.readableEnded) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8');
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

export async function handleRefresh(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
  }
  try {
    const body = await readJsonBody(req);
    const cookie = typeof body?.cookie === 'string' ? body.cookie : undefined;
    const payload = await pullBuildertrend({ cookie });
    res.json({ ok: true, ...payload });
  } catch (err) {
    sendError(res, err);
  }
}

export async function handleDashboard(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Use GET.' });
  }
  const cache = readCache();
  if (!cache) return res.status(404).json({ ok: false, error: 'No live Buildertrend pull yet.' });
  res.json({ ok: true, ...cache });
}

export function mountBuildertrendRoutes(app) {
  app.all('/api/buildertrend/refresh', (req, res) => {
    if (req.method === 'POST') return void handleRefresh(req, res);
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
  });
  app.all('/api/buildertrend/dashboard', (req, res) => {
    if (req.method === 'GET') return void handleDashboard(req, res);
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Use GET.' });
  });
}
