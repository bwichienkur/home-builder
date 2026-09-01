/**
 * Read-only Pipedrive pull (API token).
 * GET-only: pipelines, stages, deals. Never creates/edits/deletes PD records.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveDashboardLivePull, DASHBOARD_PULL_IDS } from '../dashboardLivePullStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ORIGIN = 'https://api.pipedrive.com';

/** Olsen Custom Homes — Sales pipeline (see src/lib/pipedrive/stageMap.ts). */
export const SALES_PIPELINE_ID = 1;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function cachePath() {
  if (process.env.VERCEL) return path.join('/tmp', 'pipedrive-cache.json');
  return path.join(__dirname, '../../data/pipedrive-cache.json');
}

async function pdFetch(token, urlPath, query = {}) {
  const url = new URL(urlPath.startsWith('http') ? urlPath : `${API_ORIGIN}${urlPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-token': token,
      'User-Agent': 'OlsenCustomHomes-OwnerDashboard/1.0',
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

async function fetchAllPages(token, urlPath, query = {}) {
  const rows = [];
  let cursor = null;
  let pages = 0;
  do {
    const result = await pdFetch(token, urlPath, { ...query, limit: 100, ...(cursor ? { cursor } : {}) });
    if (!result.ok) return { ok: false, status: result.status, data: rows, error: result.data };
    const batch = Array.isArray(result.data?.data) ? result.data.data : [];
    rows.push(...batch);
    cursor = result.data?.additional_data?.next_cursor ?? null;
    pages += 1;
  } while (cursor && pages < 50);
  return { ok: true, status: 200, data: rows };
}

export async function fetchPipedriveReports({ token } = {}) {
  const apiToken = token ?? env('PIPEDRIVE_API_TOKEN');
  if (!apiToken) {
    throw Object.assign(new Error('PIPEDRIVE_API_TOKEN is not set.'), {
      status: 503,
      code: 'credentials_missing',
    });
  }

  const me = await pdFetch(apiToken, '/api/v1/users/me');
  if (!me.ok) {
    throw Object.assign(new Error(`Pipedrive auth failed (HTTP ${me.status}). Check PIPEDRIVE_API_TOKEN.`), {
      status: 503,
      code: 'login_failed',
    });
  }

  const [pipelines, stages, openDeals, wonDeals] = await Promise.all([
    pdFetch(apiToken, '/api/v2/pipelines'),
    pdFetch(apiToken, '/api/v2/stages'),
    fetchAllPages(apiToken, '/api/v2/deals', { status: 'open', pipeline_id: SALES_PIPELINE_ID }),
    fetchAllPages(apiToken, '/api/v2/deals', { status: 'won' }),
  ]);

  if (!pipelines.ok || !stages.ok || !openDeals.ok || !wonDeals.ok) {
    const failed = [
      ['pipelines', pipelines],
      ['stages', stages],
      ['openDeals', openDeals],
      ['wonDeals', wonDeals],
    ].find(([, result]) => !result.ok);
    throw Object.assign(new Error(`Pipedrive ${failed[0]} returned HTTP ${failed[1].status}.`), {
      status: 502,
      code: 'reports_failed',
    });
  }

  return {
    company: {
      id: me.data?.data?.company_id,
      name: me.data?.data?.company_name,
      domain: me.data?.data?.company_domain,
    },
    pipelines: pipelines.data?.data ?? [],
    stages: stages.data?.data ?? [],
    openDeals: openDeals.data,
    wonDeals: wonDeals.data,
  };
}

export function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf8'));
  } catch {
    return null;
  }
}

export function writeCache(payload) {
  const file = cachePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

export async function pullPipedrive({ token } = {}) {
  const reports = await fetchPipedriveReports({ token });
  const payload = {
    pulledAt: new Date().toISOString(),
    readonly: true,
    source: 'pipedrive',
    reports,
  };
  writeCache(payload);
  await saveDashboardLivePull(DASHBOARD_PULL_IDS.pipedrive, payload);
  return payload;
}
