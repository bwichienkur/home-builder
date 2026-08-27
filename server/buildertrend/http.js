import { pullBuildertrend, readCache } from './pull.js';
import { estimateJsonBytes, MAX_CLIENT_PAYLOAD_BYTES, slimReportsForClient } from './slim.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  const message =
    typeof err?.message === 'string' && err.message.trim()
      ? err.message
      : typeof err === 'string'
        ? err
        : err?.message != null
          ? JSON.stringify(err.message)
          : 'Buildertrend refresh failed';
  res.status(status).json({
    ok: false,
    error: message,
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

function clientPayload(payload) {
  const slimmed = {
    ...payload,
    reports: slimReportsForClient(payload.reports),
  };
  const bytes = estimateJsonBytes({ ok: true, ...slimmed });
  if (bytes > MAX_CLIENT_PAYLOAD_BYTES) {
    throw Object.assign(
      new Error(
        `Buildertrend refresh payload is too large for this host (${Math.round(bytes / 1_000_000)}MB). Use a local pull + snapshot bake, or contact support.`,
      ),
      { status: 413, code: 'payload_too_large' },
    );
  }
  return slimmed;
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
    res.json({ ok: true, ...clientPayload(payload) });
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
  try {
    res.json({ ok: true, ...clientPayload(cache) });
  } catch (err) {
    sendError(res, err);
  }
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
