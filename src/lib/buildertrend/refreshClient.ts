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
};

function apiBase() {
  return platformConfig.apiUrl.replace(/\/$/, '');
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown; message?: unknown };
    const message = formatUnknownError(
      body?.error ?? body?.message,
      `Buildertrend refresh failed (HTTP ${response.status}).`,
    );
    const code =
      (typeof body?.code === 'string' && body.code) ||
      errorCodeFromUnknown(body?.error) ||
      (response.status === 404 ? 'not_running' : 'refresh_failed');
    return { message, code };
  } catch {
    /* ignore */
  }
  if (response.status === 404) {
    return {
      message: 'Refresh API is not running. Start `npm run server` locally, or deploy the /api/buildertrend functions.',
      code: 'not_running',
    };
  }
  return { message: `Buildertrend refresh failed (HTTP ${response.status}).`, code: 'refresh_failed' };
}

export function loadStoredLivePull(): BuildertrendLivePull | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LIVE_PULL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuildertrendLivePull;
    if (!parsed?.pulledAt || !parsed.reports) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeLivePull(pull: BuildertrendLivePull) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LIVE_PULL_STORAGE_KEY, JSON.stringify(pull));
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
    return { pulledAt: body.pulledAt, authMethod: body.authMethod, reports: body.reports };
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
      headers: { accept: 'application/json', ...(requestBody ? { 'content-type': 'application/json' } : {}) },
      body: requestBody,
    });
  } catch {
    throw new Error('Could not reach the refresh API. Start `npm run server` (it proxies /api) and try again.');
  }
  if (!response.ok) {
    const info = await parseError(response);
    const err = new Error(info.message);
    (err as { code?: string }).code = info.code;
    throw err;
  }
  const body = (await response.json()) as BuildertrendLivePull & { ok?: boolean; error?: unknown };
  if (!body?.reports) {
    throw new Error(formatUnknownError(body.error, 'Buildertrend refresh returned no reports.'));
  }
  const pull = { pulledAt: body.pulledAt, authMethod: body.authMethod, reports: body.reports };
  storeLivePull(pull);
  return pull;
}
