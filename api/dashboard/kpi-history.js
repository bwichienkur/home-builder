import {
  listKpiHistory,
  metricsFromKpis,
  upsertKpiHistoryDay,
} from '../../server/dashboardKpiHistoryStore.js';

export const config = { maxDuration: 30 };

function readJsonBody(req) {
  if (req.body == null) return {};
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  }
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    return raw ? JSON.parse(raw) : {};
  }
  return req.body;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'http://localhost');
      const from = url.searchParams.get('from') || undefined;
      const to = url.searchParams.get('to') || undefined;
      const limit = Number(url.searchParams.get('limit') || 400);
      const result = await listKpiHistory({ from, to, limit });
      return res.json({ ok: true, ...result });
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = readJsonBody(req);
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
      }
      const metrics =
        body?.metrics && typeof body.metrics === 'object'
          ? body.metrics
          : metricsFromKpis(body?.kpis);
      if (!Object.keys(metrics).length) {
        return res.status(400).json({ ok: false, error: 'Provide metrics or kpis.' });
      }
      const result = await upsertKpiHistoryDay(metrics, {
        day: body?.day,
        source: body?.source || 'live',
      });
      return res.json({ ok: true, ...result });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Use GET or POST.' });
  } catch (err) {
    console.error('dashboard kpi-history fatal', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'KPI history failed.',
      });
    }
  }
}
