/**
 * Client for the local/Vercel read-only Pipedrive refresh API.
 * Mapping happens in the browser so tests can run without hitting Pipedrive.
 */
import { errorCodeFromUnknown, formatUnknownError } from '../httpError';
import { platformConfig } from '../platform/config';
import type { PipedriveReports } from './mapDeals';

export const LIVE_PD_PULL_STORAGE_KEY = 'mahnikka-pd-live-pull';

export type PipedriveLivePull = {
  pulledAt: string;
  reports: PipedriveReports;
};

function apiBase() {
  return platformConfig.apiUrl.replace(/\/$/, '');
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown; message?: unknown };
    const message = formatUnknownError(
      body?.error ?? body?.message,
      `Pipedrive refresh failed (HTTP ${response.status}).`,
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
      message: 'Pipedrive refresh API is not running. Start `npm run server` locally, or deploy the /api/pipedrive functions.',
      code: 'not_running',
    };
  }
  return { message: `Pipedrive refresh failed (HTTP ${response.status}).`, code: 'refresh_failed' };
}

export function loadStoredPipedrivePull(): PipedriveLivePull | null {
  clearStoredPipedrivePull();
  return null;
}

export function storePipedrivePull(_pull: PipedriveLivePull) {
  clearStoredPipedrivePull();
}

export function clearStoredPipedrivePull() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LIVE_PD_PULL_STORAGE_KEY);
}

export async function fetchCachedPipedrivePull(): Promise<PipedriveLivePull | null> {
  try {
    const response = await fetch(`${apiBase()}/api/pipedrive/dashboard`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as PipedriveLivePull & { ok?: boolean };
    if (!body?.pulledAt || !body.reports) return null;
    return { pulledAt: body.pulledAt, reports: body.reports };
  } catch {
    return null;
  }
}

export async function refreshPipedrivePull(token?: string): Promise<PipedriveLivePull> {
  let response: Response;
  try {
    const requestBody = token ? JSON.stringify({ token }) : undefined;
    response = await fetch(`${apiBase()}/api/pipedrive/refresh`, {
      method: 'POST',
      headers: { accept: 'application/json', ...(requestBody ? { 'content-type': 'application/json' } : {}) },
      body: requestBody,
    });
  } catch {
    throw new Error('Could not reach the Pipedrive refresh API. Start `npm run server` (it proxies /api) and try again.');
  }
  if (!response.ok) {
    const info = await parseError(response);
    const err = new Error(info.message);
    (err as { code?: string }).code = info.code;
    throw err;
  }
  const body = (await response.json()) as PipedriveLivePull & { ok?: boolean; error?: unknown };
  if (!body?.reports) {
    throw new Error(formatUnknownError(body.error, 'Pipedrive refresh returned no reports.'));
  }
  const pull = { pulledAt: body.pulledAt, reports: body.reports };
  storePipedrivePull(pull);
  return pull;
}
