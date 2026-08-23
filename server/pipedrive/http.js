import { pullPipedrive, readCache } from './pull.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({
    ok: false,
    error: err?.message || 'Pipedrive refresh failed',
    code: err?.code || 'refresh_failed',
  });
}

export async function handleRefresh(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
  }
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
    const payload = await pullPipedrive({ token });
    res.json({
      ok: true,
      pulledAt: payload.pulledAt,
      company: payload.reports.company,
      openDealCount: payload.reports.openDeals?.length ?? 0,
      wonDealCount: payload.reports.wonDeals?.length ?? 0,
    });
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
  if (!cache) return res.status(404).json({ ok: false, error: 'No live Pipedrive pull yet.' });
  res.json({ ok: true, ...cache });
}

export function mountPipedriveRoutes(app) {
  app.all('/api/pipedrive/refresh', (req, res) => {
    if (req.method === 'POST') return void handleRefresh(req, res);
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.' });
  });
  app.all('/api/pipedrive/dashboard', (req, res) => {
    if (req.method === 'GET') return void handleDashboard(req, res);
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Use GET.' });
  });
}
