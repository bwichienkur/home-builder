/**
 * Client for the local/Vercel read-only Buildertrend refresh API.
 * Mapping happens in the browser so tests can run without hitting Buildertrend.
 */
import { errorCodeFromUnknown, formatUnknownError } from '../httpError';
import { platformConfig } from '../platform/config';
import type { BuildertrendReports } from './mapReports';

export const LIVE_PULL_STORAGE_KEY = 'mahnikka-bt-live-pull';

export type BuildertrendLivePull = {
  pulledAt: string;
  authMethod: string;
  reports: BuildertrendReports;
  /** `core` = Vercel lite pull (no tasks/selections/baseline); `full` = complete. */
  enrichment?: 'core' | 'full';
};

function apiBase() {
  return platformConfig.apiUrl.replace(/\/$/, '');
}

function vercelCrashHint(status: number, message: string) {
  if (status < 500) return message;
  if (/server error has occurred|function_invocation_failed|internal_server_error/i.test(message)) {
    return 'The refresh API was killed during the Buildertrend pull (Vercel timeout/memory). Ping works, so /api is up — Buildertrend is likely hanging from Vercel. Set BUILDERTREND_COOKIE in Vercel Production env, disable Deployment Protection, or run `npm run buildertrend:pull` locally and bake the snapshot.';
  }
  return message;
}

async function diagnosePing(): Promise<string> {
  try {
    const response = await fetch(`${apiBase()}/api/buildertrend/ping`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return 'API ping ok — the crash happens during the Buildertrend pull (timeout/memory or BT blocking this host).';
    }
    return `API ping HTTP ${response.status}.`;
  } catch {
    return 'API ping failed — /api/buildertrend routes may not be deployed on this host.';
  }
}

async function parseError(response: Response) {
  const raw = await response.text();
  let message = '';
  let code = 'refresh_failed';
  try {
    const body = JSON.parse(raw) as {
      error?: unknown;
      code?: unknown;
      message?: unknown;
      stage?: unknown;
      protection?: unknown;
    };
    if (response.status === 401 && (body?.protection || /protected deployment/i.test(JSON.stringify(body)))) {
      return {
        message:
          'This Vercel deployment is SSO-protected. Open the site while logged into Vercel, or disable Deployment Protection for Production (Project Settings → Deployment Protection) so /api/buildertrend/refresh can run.',
        code: 'deployment_protected',
      };
    }
    message = vercelCrashHint(
      response.status,
      formatUnknownError(
        body?.error ?? body?.message,
        `Buildertrend refresh failed (HTTP ${response.status}).`,
      ),
    );
    if (typeof body?.stage === 'string' && body.stage && !message.includes(body.stage)) {
      message = `${message} (stage: ${body.stage})`;
    }
    code =
      (typeof body?.code === 'string' && body.code) ||
      errorCodeFromUnknown(body?.error) ||
      (response.status === 404 ? 'not_running' : 'refresh_failed');
  } catch {
    if (response.status === 404) {
      return {
        message: 'Refresh API is not running. Start `npm run server` locally, or deploy the /api/buildertrend functions.',
        code: 'not_running',
      };
    }
    message = vercelCrashHint(
      response.status,
      raw.trim() || `Buildertrend refresh failed (HTTP ${response.status}).`,
    );
  }
  if (response.status >= 500) {
    const ping = await diagnosePing();
    message = `${message} ${ping}`;
  }
  return { message, code };
}

/** Carry forward heavy enrichment from a prior pull when the new pull is core-only. */
export function mergeCorePullWithPrior(
  next: BuildertrendLivePull,
  prior: BuildertrendLivePull | null,
): BuildertrendLivePull {
  if (next.enrichment !== 'core' || !prior?.reports) return next;
  const reports: BuildertrendReports = { ...next.reports };
  const priorTasks = prior.reports.tasks;
  const nextTaskList = Array.isArray((reports.tasks as { tasks?: unknown[] } | undefined)?.tasks)
    ? (reports.tasks as { tasks: unknown[] }).tasks
    : [];
  if ((!nextTaskList || nextTaskList.length === 0) && priorTasks) reports.tasks = priorTasks;
  if (
    (!reports.selectionsByJob || Object.keys(reports.selectionsByJob).length === 0) &&
    prior.reports.selectionsByJob
  ) {
    reports.selectionsByJob = prior.reports.selectionsByJob;
  }
  if (
    (!reports.baselineSlipByJob || Object.keys(reports.baselineSlipByJob).length === 0) &&
    prior.reports.baselineSlipByJob
  ) {
    reports.baselineSlipByJob = prior.reports.baselineSlipByJob;
  }
  if (
    (!reports.baselineItemsByJob || Object.keys(reports.baselineItemsByJob).length === 0) &&
    prior.reports.baselineItemsByJob
  ) {
    reports.baselineItemsByJob = prior.reports.baselineItemsByJob;
  }
  return { ...next, reports };
}

export function loadStoredLivePull(): BuildertrendLivePull | null {
  // Deprecated: live pulls load from GET /api/buildertrend/dashboard (Neon-backed).
  clearStoredLivePull();
  return null;
}

export function storeLivePull(_pull: BuildertrendLivePull): boolean {
  // Live pulls are persisted server-side (Neon dashboard_live_pulls). Clear legacy browser cache.
  clearStoredLivePull();
  return true;
}

export function clearStoredLivePull() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LIVE_PULL_STORAGE_KEY);
}

export async function fetchCachedBuildertrendPull(): Promise<BuildertrendLivePull | null> {
  try {
    const response = await fetch(`${apiBase()}/api/buildertrend/dashboard`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as BuildertrendLivePull & { ok?: boolean };
    if (!body?.pulledAt || !body.reports) return null;
    return {
      pulledAt: body.pulledAt,
      authMethod: body.authMethod,
      reports: body.reports,
      enrichment: body.enrichment,
    };
  } catch {
    return null;
  }
}

export async function refreshBuildertrendPull(cookie?: string): Promise<BuildertrendLivePull> {
  let response: Response;
  try {
    const requestBody = cookie ? JSON.stringify({ cookie }) : undefined;
    response = await fetch(`${apiBase()}/api/buildertrend/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json', ...(requestBody ? { 'content-type': 'application/json' } : {}) },
      body: requestBody,
    });
  } catch {
    throw new Error('Could not reach the refresh API. Start `npm run server` (it proxies /api) and try again.');
  }
  if (!response.ok) {
    const info = await parseError(response);
    const err = new Error(
      response.status >= 500
        ? `${info.message} (HTTP ${response.status})`
        : info.message,
    );
    (err as { code?: string }).code = info.code;
    throw err;
  }
  const body = (await response.json()) as BuildertrendLivePull & {
    ok?: boolean;
    error?: unknown;
    enrichment?: 'core' | 'full';
    serverless?: boolean;
  };
  if (!body?.reports) {
    throw new Error(formatUnknownError(body.error, 'Buildertrend refresh returned no reports.'));
  }
  const enrichment = body.enrichment ?? (body.serverless ? 'core' : 'full');
  const pull: BuildertrendLivePull = {
    pulledAt: body.pulledAt,
    authMethod: body.authMethod,
    reports: body.reports,
    enrichment,
  };
  storeLivePull(pull);
  return pull;
}
