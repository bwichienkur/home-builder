/**
 * Scheduled daily pull of Pipedrive (+ optional Buildertrend) for Owner Dashboard.
 * Secure with CRON_SECRET (Vercel Cron sends Authorization: Bearer <CRON_SECRET>).
 *
 * Env:
 * - CRON_SECRET (required in production)
 * - PIPEDRIVE_API_TOKEN
 * - BUILDERTREND_COOKIE (optional; enables BT pull when set)
 */
import { pullPipedrive } from '../../server/pipedrive/pull.js';
import { pullBuildertrend } from '../../server/buildertrend/pull.js';
import { loadDashboardLivePull, DASHBOARD_PULL_IDS } from '../../server/dashboardLivePullStore.js';
import { upsertKpiHistoryDay } from '../../server/dashboardKpiHistoryStore.js';

export const config = { maxDuration: 300 };

function authorized(req) {
  const secret = process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET;
  if (!secret) {
    // Allow in local/dev without secret so `curl` testing works.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return false;
    return true;
  }
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const query =
    typeof req.query?.secret === 'string'
      ? req.query.secret
      : new URL(req.url || '/', 'http://localhost').searchParams.get('secret') || '';
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Use GET or POST.' });
    }
    if (!authorized(req)) {
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
  } catch (err) {
    console.error('dashboard daily-pull fatal', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'Daily pull failed.',
      });
    }
  }
}
