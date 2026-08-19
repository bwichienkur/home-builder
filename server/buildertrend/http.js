import { pullBuildertrend, readCache } from './pull.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({
    ok: false,
    error: err?.message || 'Buildertrend refresh failed',
    code: err?.code || 'refresh_failed',
  });
}

export async function handleRefresh(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
  }
  try {
    const cookie = typeof req.body?.cookie === 'string' ? req.body.cookie : undefined;
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
