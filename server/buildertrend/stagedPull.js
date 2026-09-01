/**
 * Multi-request full Buildertrend pull for Vercel (60s per invocation).
 * Core reports in the first call; per-job enrichment in batches; state in Neon.
 */
import { authenticate, enrichReportsBatch, fetchReportsCore } from './pull.js';
import { estimateJsonBytes, MAX_CLIENT_PAYLOAD_BYTES, slimReportsForClient } from './slim.js';
import { loadDashboardLivePull, saveDashboardLivePull, DASHBOARD_PULL_IDS } from '../dashboardLivePullStore.js';

const JOBS_PER_BATCH = 3;

function resolveCookie(body) {
  const fromBody = typeof body?.cookie === 'string' ? body.cookie.trim() : '';
  if (fromBody) return fromBody;
  return String(process.env.BUILDERTREND_COOKIE || '').trim();
}

function pullStateFromPayload(payload) {
  const state = payload?._pullState;
  if (!state || !Array.isArray(state.jobIds)) return null;
  return {
    jobIds: state.jobIds.map(Number).filter(Boolean),
    scheduleJobIds: (state.scheduleJobIds ?? []).map(Number).filter(Boolean),
    templateTitles: new Set(state.templateTitles ?? []),
    ochMasterTemplateId: state.ochMasterTemplateId ?? null,
    enrichedJobIds: (state.enrichedJobIds ?? []).map(Number).filter(Boolean),
  };
}

function serializePullState(state) {
  return {
    jobIds: state.jobIds,
    scheduleJobIds: state.scheduleJobIds,
    templateTitles: [...state.templateTitles],
    ochMasterTemplateId: state.ochMasterTemplateId,
    enrichedJobIds: state.enrichedJobIds,
  };
}

function clientPayload(payload) {
  const { _pullState, ...rest } = payload ?? {};
  const slimmed = {
    ...rest,
    reports: slimReportsForClient(rest.reports, { now: new Date(rest.pulledAt || Date.now()) }),
  };
  const bytes = estimateJsonBytes({ ok: true, ...slimmed });
  if (bytes > MAX_CLIENT_PAYLOAD_BYTES) {
    throw Object.assign(
      new Error(
        `Buildertrend refresh payload is too large for this host (${Math.round(bytes / 1_000_000)}MB).`,
      ),
      { status: 413, code: 'payload_too_large' },
    );
  }
  return slimmed;
}

function progressFromState(state) {
  return { done: state.enrichedJobIds.length, total: state.jobIds.length };
}

async function savePull(pull) {
  await saveDashboardLivePull(DASHBOARD_PULL_IDS.buildertrend, pull);
}

/**
 * Run one stage of a full pull. Returns payload with `continue: true` until enrichment completes.
 */
export async function runStagedBuildertrendRefresh({ cookie, continuePull = false }) {
  const trimmedCookie = String(cookie || '').trim();
  if (!trimmedCookie) {
    throw Object.assign(
      new Error(
        'Paste Buildertrend cookie values, or set BUILDERTREND_COOKIE on the Vercel project (Production env).',
      ),
      { status: 400, code: 'credentials_missing' },
    );
  }

  if (!continuePull) {
    const { session } = await authenticate({ cookie: trimmedCookie });
    const core = await fetchReportsCore(session);
    const state = {
      jobIds: core.jobIds,
      scheduleJobIds: core.scheduleJobIds,
      templateTitles: core.masterTemplate.titles,
      ochMasterTemplateId: core.masterTemplate.templateId,
      enrichedJobIds: [],
    };

    const pull = {
      pulledAt: new Date().toISOString(),
      authMethod: session.method,
      readonly: true,
      serverless: true,
      enrichment: state.jobIds.length ? 'partial' : 'full',
      statuses: core.statuses,
      reports: core.reports,
      _pullState: serializePullState(state),
    };

    if (!state.jobIds.length) {
      delete pull._pullState;
      await savePull(pull);
      return { ...pull, continue: false, progress: { done: 0, total: 0 } };
    }

    await savePull(pull);
    return {
      ...pull,
      continue: true,
      progress: progressFromState(state),
    };
  }

  const stored = await loadDashboardLivePull(DASHBOARD_PULL_IDS.buildertrend);
  const existing = stored.payload;
  const state = pullStateFromPayload(existing);
  if (!state) {
    return runStagedBuildertrendRefresh({ cookie: trimmedCookie, continuePull: false });
  }

  const remaining = state.jobIds.filter((id) => !state.enrichedJobIds.includes(id));
  if (!remaining.length) {
    const complete = { ...existing, enrichment: 'full' };
    delete complete._pullState;
    await savePull(complete);
    return { ...complete, continue: false, progress: progressFromState(state) };
  }

  const { session } = await authenticate({ cookie: trimmedCookie });
  const batch = remaining.slice(0, JOBS_PER_BATCH);
  const { reports } = await enrichReportsBatch(session, existing.reports, {
    batchJobIds: batch,
    scheduleJobIds: state.scheduleJobIds,
    templateTitles: state.templateTitles,
    concurrency: 2,
  });

  state.enrichedJobIds.push(...batch);
  const stillRemaining = state.jobIds.filter((id) => !state.enrichedJobIds.includes(id));
  const pull = {
    ...existing,
    pulledAt: new Date().toISOString(),
    authMethod: session.method,
    reports,
    enrichment: stillRemaining.length ? 'partial' : 'full',
    _pullState: stillRemaining.length ? serializePullState(state) : undefined,
  };
  if (!stillRemaining.length) delete pull._pullState;

  await savePull(pull);
  return {
    ...pull,
    continue: stillRemaining.length > 0,
    progress: progressFromState(state),
  };
}

export function toRefreshResponse(pull) {
  const { continue: shouldContinue, progress, ...rest } = pull;
  return {
    ok: true,
    ...clientPayload(rest),
    continue: Boolean(shouldContinue),
    progress: progress ?? { done: 0, total: 0 },
  };
}
