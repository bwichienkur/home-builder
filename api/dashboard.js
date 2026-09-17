/**
 * Owner Dashboard API (single Hobby serverless entry — keep ≤12 functions).
 *
 * - Daily pull / Vercel Cron: GET|POST /api/dashboard
 * - KPI history: GET|POST /api/dashboard?__history=1
 *   Rewrites keep /api/dashboard/kpi-history and /api/dashboard/daily-pull working.
 */
import { pullPipedrive } from '../server/pipedrive/pull.js';
import { pullBuildertrend } from '../server/buildertrend/pull.js';
import { loadDashboardLivePull, DASHBOARD_PULL_IDS } from '../server/dashboardLivePullStore.js';
import {
  listKpiHistory,
  metricsFromKpis,
  upsertKpiHistoryDay,
} from '../server/dashboardKpiHistoryStore.js';

export const config = { maxDuration: 300 };

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

function queryFlag(req, name) {
  const v = req.query?.[name];
  return v === '1' || v === 'true' || v === true;
}

function isHistoryRequest(req) {
  return queryFlag(req, '__history');
}

function isVercelCron(req) {
  const h = req.headers?.['x-vercel-cron'];
  return h === '1' || h === 'true';
}

function authorizedCron(req) {
  if (isVercelCron(req)) return true;
  const secret = process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET;
  if (!secret) {
    return !(process.env.NODE_ENV === 'production' || process.env.VERCEL);
  }
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const query = typeof req.query?.secret === 'string' ? req.query.secret : '';
  return bearer === secret || query === secret;
}

function roughMetricsFromPull(btPayload, pdPayload) {
  const metrics = {};
  try {
    const wipRows = Array.isArray(btPayload?.reports?.wip)
      ? btPayload.reports.wip
      : Array.isArray(btPayload?.reports?.wip?.rowData)
        ? btPayload.reports.wip.rowData
        : [];
    let wip = 0;
    let revenue = 0;
    let active = 0;
    for (const row of wipRows) {
      const status = String(row?.jobStatus ?? row?.status ?? '').toLowerCase();
      const contract = Number(row?.revisedClientPrice ?? row?.contractPrice ?? row?.wip ?? 0) || 0;
      const invoiced = Number(row?.amountInvoiced ?? row?.revenueToDate ?? 0) || 0;
      if (!status || status.includes('open') || status === '0') {
        active += 1;
        wip += contract;
      }
      revenue += invoiced;
    }
    if (active) metrics.active = active;
    if (wip) metrics.wip = wip;
    if (revenue) metrics.revenue = revenue;
  } catch {
    /* ignore */
  }
  try {
    const stages = pdPayload?.reports?.pipelineStages || pdPayload?.reports?.stages;
    if (Array.isArray(stages)) {
      let weighted = 0;
      for (const stage of stages) {
        const value = Number(stage?.value ?? stage?.weightedValue ?? 0) || 0;
        const weight = Number(stage?.weight ?? stage?.probability ?? 1) || 1;
        weighted += value * (weight > 1 ? weight / 100 : weight);
      }
      if (weighted) metrics.pipeline = weighted;
    }
  } catch {
    /* ignore */
  }
  return metrics;
}

async function handleHistory(req, res) {
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
}

async function handleDailyPull(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Use GET or POST.' });
  }
  if (!authorizedCron(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized cron request.' });
  }

  const results = { pipedrive: null, buildertrend: null, history: null };

  try {
    results.pipedrive = await pullPipedrive({});
  } catch (err) {
    results.pipedrive = {
      ok: false,
      error: err instanceof Error ? err.message : 'Pipedrive pull failed',
    };
  }

  const cookie = process.env.BUILDERTREND_COOKIE || process.env.BT_COOKIE;
  if (cookie) {
    try {
      results.buildertrend = await pullBuildertrend({ cookie });
    } catch (err) {
      results.buildertrend = {
        ok: false,
        error: err instanceof Error ? err.message : 'Buildertrend pull failed',
      };
    }
  } else {
    results.buildertrend = { ok: false, skipped: true, reason: 'BUILDERTREND_COOKIE not set' };
  }

  const btStored = await loadDashboardLivePull(DASHBOARD_PULL_IDS.buildertrend);
  const pdStored = await loadDashboardLivePull(DASHBOARD_PULL_IDS.pipedrive);
  const metrics = roughMetricsFromPull(btStored.payload, pdStored.payload);
  if (Object.keys(metrics).length) {
    results.history = await upsertKpiHistoryDay(metrics, { source: 'cron' });
  } else {
    results.history = { saved: false, reason: 'no metrics extracted' };
  }

  return res.json({
    ok: true,
    pulledAt: new Date().toISOString(),
    results,
  });
}

export default async function handler(req, res) {
  try {
    if (isHistoryRequest(req)) {
      return await handleHistory(req, res);
    }
    // Default route (and ?__daily=1) runs the scheduled pull.
    return await handleDailyPull(req, res);
  } catch (err) {
    console.error('dashboard api fatal', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'Dashboard API failed.',
      });
    }
  }
}
