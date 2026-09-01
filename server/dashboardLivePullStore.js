/**
 * Persist Owner Dashboard live pulls in Postgres (Neon jsonb).
 * Replaces browser localStorage for large BT/PD payloads.
 */
import { loadSnapshot, saveSnapshot } from './snapshotStore.js';
import { slimReportsForClient } from './buildertrend/slim.js';

const TABLE = 'dashboard_live_pulls';

export const DASHBOARD_PULL_IDS = {
  buildertrend: 'buildertrend',
  pipedrive: 'pipedrive',
};

function slimBuildertrendPull(pull) {
  if (!pull?.reports) return pull;
  const slimmed = {
    pulledAt: pull.pulledAt,
    authMethod: pull.authMethod,
    enrichment: pull.enrichment,
    readonly: pull.readonly,
    serverless: pull.serverless,
    statuses: pull.statuses,
    reports: slimReportsForClient(pull.reports, { now: new Date(pull.pulledAt || Date.now()) }),
  };
  if (pull._pullState) slimmed._pullState = pull._pullState;
  return slimmed;
}

function slimPipedrivePull(pull) {
  if (!pull?.reports) return pull;
  return {
    pulledAt: pull.pulledAt,
    readonly: pull.readonly,
    source: pull.source,
    reports: pull.reports,
  };
}

export async function loadDashboardLivePull(id) {
  try {
    return await loadSnapshot(TABLE, id);
  } catch (err) {
    console.error(`[dashboardLivePullStore] load ${id} failed`, err?.message || err);
    return { payload: null, backend: 'none' };
  }
}

/**
 * Save a live pull. Best-effort — does not throw when DATABASE_URL is missing.
 */
export async function saveDashboardLivePull(id, pull) {
  if (!pull?.pulledAt) return { backend: 'none', saved: false };
  const payload =
    id === DASHBOARD_PULL_IDS.buildertrend ? slimBuildertrendPull(pull) : slimPipedrivePull(pull);
  try {
    const result = await saveSnapshot(TABLE, payload, id);
    return { ...result, saved: true };
  } catch (err) {
    if (err?.status === 503) {
      return { backend: 'none', saved: false };
    }
    console.error(`[dashboardLivePullStore] save ${id} failed`, err?.message || err);
    return { backend: 'none', saved: false };
  }
}
