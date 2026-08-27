/**
 * Read-only Buildertrend pull.
 * Authenticates, then GET-only report endpoints. Never creates/edits/deletes BT records.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://buildertrend.net';
const AUTH0_TOKEN = 'https://login.buildertrend.com/oauth/token';
const AUTH0_CLIENT_ID = 'rM9vUB980Q7Tfy1eSi9fc5FDBpNM0jt3';
const AUTH0_AUDIENCE = 'https://api.buildertrend.net/';

const WRITE_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);
/** POST bodies allowed for read-only list/report queries (never create/update/delete). */
const READ_POST_PREFIXES = [
  '/apix/v2/Tasks/list',
  '/api/Leads/Grid',
  '/api/Selections/Grid',
  '/api/Calendar/GanttChart',
  '/api/Calendar/BaselineGrid',
];

function isReadOnlyPost(urlPath) {
  const path = String(urlPath).split('?')[0];
  return READ_POST_PREFIXES.some((prefix) => path === prefix || path.endsWith(prefix));
}

function cachePath() {
  if (process.env.VERCEL) return path.join('/tmp', 'buildertrend-cache.json');
  return path.join(__dirname, '../../data/buildertrend-cache.json');
}

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function collectCookies(jar, setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const line of list) {
    const pair = String(line).split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function btFetch(session, method, urlPath, { json, query, headers } = {}) {
  const methodUpper = String(method || 'GET').toUpperCase();
  if (WRITE_METHODS.has(methodUpper)) {
    throw new Error(`Refusing ${methodUpper} to Buildertrend (read-only pull).`);
  }
  const url = new URL(urlPath.startsWith('http') ? urlPath : `${ORIGIN}${urlPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  const reqHeaders = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': session.userAgent,
    Cookie: cookieHeader(session.jar),
    ...headers,
  };
  if (session.bearer) reqHeaders.Authorization = `Bearer ${session.bearer}`;
  let body;
  if (json !== undefined) {
    if (methodUpper !== 'POST') throw new Error('JSON body is only used for POST requests.');
    const login = urlPath.includes('/api/Login/AjaxLogin');
    if (!login && !isReadOnlyPost(urlPath)) {
      throw new Error(`Refusing POST to ${urlPath} (not a read-only list endpoint).`);
    }
    reqHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const response = await fetch(url, { method: methodUpper, headers: reqHeaders, body, redirect: 'manual' });
  collectCookies(session.jar, readSetCookies(response.headers));
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data, location: response.headers.get('location') };
}

function newSession(overrides = {}) {
  return {
    jar: new Map(),
    bearer: '',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    method: '',
    ...overrides,
  };
}

function parseCookieEnv(raw) {
  const jar = new Map();
  for (const part of String(raw).split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return jar;
}

async function loginWithCookie(cookieOverride) {
  const provided = cookieOverride != null && String(cookieOverride).trim() !== '';
  const raw = provided ? String(cookieOverride).trim() : env('BUILDERTREND_COOKIE');
  if (!raw) return null;
  const session = newSession({
    jar: parseCookieEnv(raw),
    method: 'cookie',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const probe = await btFetch(session, 'GET', '/apix/v3/Reporting/work-in-progress', { query: { openJobLimit: 1 } });
  if (probe.ok) return session;

  // Pasted/overridden cookies must fail loudly — do not silently fall back to username/password.
  if (provided) {
    throw Object.assign(
      new Error(
        `Buildertrend rejected the pasted cookies (HTTP ${probe.status}). Re-copy .AspNet.Auth0, ASP.NET_SessionId, and GAESA from a logged-in buildertrend.net tab (Value column only).`,
      ),
      { status: 401, code: 'cookie_rejected' },
    );
  }
  return null;
}

async function loginMobile(username, password) {
  const session = newSession({
    method: 'mobile',
    userAgent: 'Buildertrend/24.8.0 (iPhone; iOS 18.5; Scale/3.00)',
  });
  const result = await btFetch(session, 'POST', '/api/Login/AjaxLogin', {
    json: { username, password, deviceType: 'iPhone', appVersion: '24.8.0', rememberMe: true },
  });
  const data = result.data?.data ?? {};
  if (!result.data?.success && !data.loginSuccess) {
    const message = result.data?.message || 'Mobile login was rejected.';
    return { error: message, migrated: /invalid username or password/i.test(message) };
  }
  if (data.Token) session.bearer = data.Token;
  for (const cookie of data.mobileCookies ?? []) {
    if (cookie?.name && cookie?.value) session.jar.set(cookie.name, cookie.value);
  }
  return { session };
}

async function loginAuth0(username, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
    audience: AUTH0_AUDIENCE,
    client_id: AUTH0_CLIENT_ID,
    scope: 'openid profile email',
  });
  const response = await fetch(AUTH0_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    return { error: payload.error_description || payload.error || `Auth0 token HTTP ${response.status}` };
  }
  const session = newSession({
    method: 'auth0',
    bearer: payload.access_token,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const probe = await btFetch(session, 'GET', '/apix/v3/Reporting/work-in-progress', { query: { openJobLimit: 1 } });
  if (!probe.ok) return { error: `Auth0 token was issued but Buildertrend reports still returned HTTP ${probe.status}.` };
  return { session };
}

export async function authenticate({ cookie } = {}) {
  const cookieSession = await loginWithCookie(cookie);
  if (cookieSession) return { session: cookieSession };

  const username = env('BUILDERTREND_USERNAME') || env('BUILDERTREND_EMAIL');
  const password = env('BUILDERTREND_PASSWORD');
  if (!username || !password) {
    throw Object.assign(
      new Error(
        'Buildertrend website login needs a human reCAPTCHA, and no BUILDERTREND_COOKIE or BUILDERTREND_USERNAME/PASSWORD is set. Add those env vars on the API server (never commit them).',
      ),
      { status: 503, code: 'credentials_missing' },
    );
  }

  const auth0 = await loginAuth0(username, password);
  if (auth0.session) return { session: auth0.session };

  const mobile = await loginMobile(username, password);
  if (mobile.session) return { session: mobile.session };

  const recaptcha = /access_denied|bot|captcha|recaptcha/i.test(String(auth0.error || ''));
  throw Object.assign(
    new Error(
      recaptcha || mobile.migrated
        ? 'Buildertrend website login is blocked by Auth0/reCAPTCHA, and the mobile app login rejected this account (it is Auth0-migrated). Set BUILDERTREND_COOKIE from a logged-in browser session, or use a Buildertrend partner API key. The last snapshot stays on screen.'
        : `Buildertrend login failed (${mobile.error || auth0.error}). Last snapshot is unchanged.`,
    ),
    { status: 503, code: 'login_failed' },
  );
}

async function getJson(session, urlPath, query) {
  const result = await btFetch(session, 'GET', urlPath, { query });
  if (!result.ok) return { ok: false, status: result.status, data: result.data };
  return { ok: true, status: result.status, data: result.data };
}

async function postJson(session, urlPath, json) {
  const result = await btFetch(session, 'POST', urlPath, { json });
  if (!result.ok) return { ok: false, status: result.status, data: result.data };
  return { ok: true, status: result.status, data: result.data };
}

function rollingLogWindow(now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

function openJobIdsFromPicker(jobsPayload) {
  const list = jobsPayload?.data?.jobs ?? jobsPayload?.jobs ?? [];
  return list.filter((job) => job.jobStatus === 1 || String(job.jobStatus).toLowerCase() === 'open').map((job) => job.jobID);
}

/** BT caps Tasks/list responses at 4,000 rows; per-job pulls avoid cross-job truncation. */
export const TASKS_LIST_ROW_CAP = 4000;

/** PM → Tasks: Status includes Not completed. Past-due (due before today) is applied in the mapper. */
export const INCOMPLETE_TASKS_FILTERS = {
  filters: [
    {
      groups: [
        {
          booleanOperator: 0,
          filters: [{ field: 'status', operator: 24, value: '[0]' }],
        },
      ],
    },
  ],
};

export function mergeTasksListResponses(parts) {
  const tasksById = new Map();
  const jobsById = new Map();
  const dependencies = [];
  const taskComments = [];
  const watchers = [];
  const cappedJobIds = [];

  for (const part of parts) {
    const data = part?.data;
    if (!data) continue;
    const taskList = Array.isArray(data.tasks) ? data.tasks : [];
    if (taskList.length >= TASKS_LIST_ROW_CAP && part.jobId != null) cappedJobIds.push(part.jobId);
    for (const task of taskList) {
      const key = task?.taskId ?? `${task?.jobId ?? part.jobId}-${tasksById.size}`;
      if (!tasksById.has(key)) tasksById.set(key, task);
    }
    for (const job of data.jobs ?? []) {
      if (job?.jobId != null) jobsById.set(job.jobId, job);
    }
    if (Array.isArray(data.dependencies)) dependencies.push(...data.dependencies);
    if (Array.isArray(data.taskComments)) taskComments.push(...data.taskComments);
    if (Array.isArray(data.watchers)) watchers.push(...data.watchers);
  }

  return {
    tasks: [...tasksById.values()],
    dependencies,
    jobs: [...jobsById.values()],
    taskComments,
    watchers,
    meta: {
      jobPullCount: parts.length,
      cappedJobIds,
    },
  };
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchTasksForOpenJobs(session, jobIds, { concurrency = 5 } = {}) {
  if (!jobIds.length) return { ok: false, status: 0, data: null };

  const parts = await mapPool(jobIds, concurrency, async (jobId) => {
    const result = await postJson(session, '/apix/v2/Tasks/list', {
      jobIds: [jobId],
      filters: INCOMPLETE_TASKS_FILTERS,
      includeDeleted: false,
    });
    return { jobId, ok: result.ok, status: result.status, data: result.ok ? result.data : null };
  });

  const succeeded = parts.filter((part) => part.ok && part.data);
  if (!succeeded.length) {
    const firstFailure = parts.find((part) => !part.ok);
    return { ok: false, status: firstFailure?.status ?? 502, data: null };
  }

  return {
    ok: true,
    status: parts.every((part) => part.ok) ? 200 : 207,
    data: mergeTasksListResponses(succeeded),
  };
}

/** Match BT schedule titles "Site Work" / "SITEWORK". */
export function isSiteWorkScheduleTitle(title) {
  return /^\s*site\s*work\s*$/i.test(String(title || '').trim());
}

export function isExactScheduleTitle(title, expected) {
  return new RegExp(`^\\s*${expected}\\s*$`, 'i').test(String(title || '').trim());
}

/** Selection Phase 1/2/3 Due titles (trailing space tolerated). */
export function isSelectionPhaseDueTitle(title, phase) {
  return new RegExp(`^\\s*selection\\s*phase\\s*${phase}\\s*due\\s*$`, 'i').test(String(title || '').trim());
}

/** Schedule item started = complete or percentComplete > 0. */
export function scheduleItemStarted(item) {
  if (!item) return false;
  return Boolean(item.isComplete) || Number(item.percentComplete) > 0;
}

function endDateSlipDays(row) {
  const raw = row?.endDateSlip;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (raw && typeof raw === 'object') {
    const nested = Number(raw.workdays ?? raw.days ?? raw.value);
    if (Number.isFinite(nested)) return Math.round(nested);
  }
  return 0;
}

function durationSlipDays(row) {
  const raw = row?.durationSlip;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (raw && typeof raw === 'object') {
    const nested = Number(raw.workdays ?? raw.days ?? raw.value);
    if (Number.isFinite(nested)) return Math.round(nested);
  }
  return 0;
}

/** Normalize schedule titles for OCH MASTER template matching. */
export function normalizeScheduleTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const OCH_MASTER_TEMPLATE_NAME = /^och\s*master\s*2026$/i;

/**
 * Keep Baseline rows whose title matches OCH MASTER 2026 (or provided allowlist).
 * Drops ad-hoc / non-template schedule items PMs add during construction.
 * Dedupes identical titles by keeping the row with the largest |endDateSlip|.
 */
export function filterBaselineRowsToTemplate(rows, templateTitles) {
  const allow = templateTitles instanceof Set ? templateTitles : new Set([...(templateTitles || [])].map(normalizeScheduleTitle));
  const bestByTitle = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const title = String(row?.title || '').trim();
    const key = normalizeScheduleTitle(title);
    if (!key || !allow.has(key)) continue;
    const endSlip = endDateSlipDays(row);
    const prev = bestByTitle.get(key);
    if (!prev || Math.abs(endSlip) > Math.abs(endDateSlipDays(prev))) bestByTitle.set(key, row);
  }
  return [...bestByTitle.values()];
}

export function compactBaselineSlipRow(row) {
  return {
    title: String(row?.title || '').trim(),
    endDateSlip: endDateSlipDays(row),
    durationSlip: durationSlipDays(row),
    expectedStartDate: row?.expectedStartDate ? String(row.expectedStartDate).slice(0, 10) : '',
    actualStartDate: row?.actualStartDate ? String(row.actualStartDate).slice(0, 10) : '',
    expectedEndDate: row?.expectedEndDate ? String(row.expectedEndDate).slice(0, 10) : '',
    actualEndDate: row?.actualEndDate ? String(row.actualEndDate).slice(0, 10) : '',
    completed: Boolean(row?.completed),
  };
}

/**
 * Permit / Selections / Construction slip from Schedule → Baseline item rows.
 * - Permit: Permitting endDateSlip
 * - Selections: max endDateSlip among Selection Phase 1/2/3 Due
 * - Construction: Closing endDateSlip − Site Work endDateSlip (floor at 0)
 */
export function slipBucketsFromBaselineItems(items) {
  const rows = Array.isArray(items) ? items : [];
  const findExact = (expected) => rows.find((row) => isExactScheduleTitle(row?.title, expected));
  const permit = endDateSlipDays(findExact('Permitting'));
  const selectionSlips = [1, 2, 3]
    .map((phase) => endDateSlipDays(rows.find((row) => isSelectionPhaseDueTitle(row?.title, phase))))
    .filter((n) => Number.isFinite(n));
  const selections = selectionSlips.length ? Math.max(...selectionSlips) : 0;
  const siteWork = endDateSlipDays(findExact('Site Work'));
  const closing = endDateSlipDays(findExact('Closing'));
  return {
    permit,
    selections,
    construction: Math.max(0, closing - siteWork),
  };
}

function isoDay(value) {
  return value ? String(value).slice(0, 10) : '';
}

/**
 * Current schedule item for a job: incomplete work that has started (start ≤ today),
 * preferring items still inside their planned window. Falls back to the next upcoming
 * incomplete item. Returns { title, percentComplete, startDate, endDate } or null.
 */
export function pickCurrentScheduleItem(items, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const incomplete = (items ?? []).filter((item) => !item?.isComplete && String(item?.title || '').trim());
  if (!incomplete.length) return null;

  const active = incomplete.filter((item) => {
    const start = isoDay(item.startDate);
    return Boolean(start && start <= today);
  });
  const inWindow = active.filter((item) => {
    const end = isoDay(item.endDate);
    return !end || end >= today;
  });
  const pool = inWindow.length ? inWindow : active;

  const rank = (list) =>
    [...list].sort((a, b) => {
      const startCmp = isoDay(b.startDate).localeCompare(isoDay(a.startDate));
      if (startCmp) return startCmp;
      const endCmp = isoDay(a.endDate).localeCompare(isoDay(b.endDate));
      if (endCmp) return endCmp;
      return Number(b.percentComplete || 0) - Number(a.percentComplete || 0);
    });

  const pick = pool.length
    ? rank(pool)[0]
    : [...incomplete].sort((a, b) => isoDay(a.startDate).localeCompare(isoDay(b.startDate)))[0];
  if (!pick) return null;
  return {
    title: String(pick.title).trim(),
    percentComplete: Number(pick.percentComplete) || 0,
    startDate: isoDay(pick.startDate),
    endDate: isoDay(pick.endDate),
  };
}

/**
 * Site Work started = schedule item complete or percentComplete > 0.
 * Returns map of jobId → { started, title, percentComplete, isComplete, startDate }.
 */
export function siteWorkStatusFromGantt(ganttPayload) {
  const schedule = scheduleMilestonesFromGantt(ganttPayload);
  const byJob = {};
  for (const [jobId, row] of Object.entries(schedule)) {
    if (!row.siteWork) continue;
    byJob[jobId] = {
      title: row.siteWork.title,
      started: row.siteWork.started,
      percentComplete: row.siteWork.percentComplete,
      isComplete: row.siteWork.isComplete,
      startDate: row.siteWork.startDate,
    };
  }
  return byJob;
}

/**
 * Per-job schedule milestones from GanttChart items.
 * Exact titles: Site Work, Permitting, Foundation, Closing.
 * firstItemStartDate = earliest startDate among all items for the job.
 * currentItem = incomplete schedule item currently in progress (or next upcoming).
 */
export function scheduleMilestonesFromGantt(ganttPayload, options = {}) {
  const items = ganttPayload?.data?.items ?? ganttPayload?.items ?? [];
  const now = options.now ?? new Date();
  const byJob = new Map();
  const itemsByJob = new Map();

  const ensure = (jobId) => {
    if (!byJob.has(jobId)) {
      byJob.set(jobId, {
        firstItemStartDate: '',
        siteWork: null,
        permitting: null,
        foundation: null,
        closing: null,
        siteWorkStarted: null,
        foundationStarted: null,
        currentItem: null,
      });
    }
    return byJob.get(jobId);
  };

  for (const item of items) {
    const jobId = Number(item?.jobId);
    if (!jobId) continue;
    const row = ensure(jobId);
    if (!itemsByJob.has(jobId)) itemsByJob.set(jobId, []);
    itemsByJob.get(jobId).push(item);
    const startDate = isoDay(item.startDate);
    const endDate = isoDay(item.endDate);
    if (startDate && (!row.firstItemStartDate || startDate < row.firstItemStartDate)) {
      row.firstItemStartDate = startDate;
    }

    const title = String(item.title || '').trim();
    const percentComplete = Number(item.percentComplete) || 0;
    const isComplete = Boolean(item.isComplete);
    const started = isComplete || percentComplete > 0;
    const milestone = { title, started, percentComplete, isComplete, startDate, endDate };

    if (isSiteWorkScheduleTitle(title)) {
      row.siteWork = milestone;
      row.siteWorkStarted = started;
    } else if (isExactScheduleTitle(title, 'Permitting')) {
      // Last day of Permitting = max endDate when multiple.
      if (!row.permitting || (endDate && endDate > (row.permitting.endDate || ''))) {
        row.permitting = milestone;
      }
    } else if (isExactScheduleTitle(title, 'Foundation')) {
      // First day of Foundation = earliest startDate.
      if (!row.foundation || (startDate && startDate < (row.foundation.startDate || '9999'))) {
        row.foundation = milestone;
      }
      row.foundationStarted = scheduleItemStarted(row.foundation);
    } else if (isExactScheduleTitle(title, 'Closing')) {
      // Last date of Closing = max endDate.
      if (!row.closing || (endDate && endDate > (row.closing.endDate || ''))) {
        row.closing = milestone;
      }
    }
  }

  // Recompute foundationStarted from final foundation row (earliest start may not be the started one).
  for (const row of byJob.values()) {
    if (row.foundation) row.foundationStarted = scheduleItemStarted(row.foundation);
    // If multiple Foundation items exist, started if ANY has started.
  }

  // Second pass: foundationStarted if any Foundation item started (not only earliest).
  const foundationByJob = new Map();
  for (const item of items) {
    if (!isExactScheduleTitle(item?.title, 'Foundation')) continue;
    const jobId = Number(item.jobId);
    if (!jobId) continue;
    const prev = foundationByJob.get(jobId) || false;
    foundationByJob.set(jobId, prev || scheduleItemStarted(item));
  }
  for (const [jobId, started] of foundationByJob.entries()) {
    const row = byJob.get(jobId);
    if (row) row.foundationStarted = started;
  }

  for (const [jobId, jobItems] of itemsByJob.entries()) {
    const row = byJob.get(jobId);
    if (row) row.currentItem = pickCurrentScheduleItem(jobItems, now);
  }

  return Object.fromEntries([...byJob.entries()].map(([id, row]) => [String(id), row]));
}

const GANTT_JOB_CHUNK = 25;

async function fetchScheduleMilestonesByJob(session, jobIds) {
  if (!jobIds.length) return { ok: false, status: 0, data: {} };
  const unique = [...new Set(jobIds.map(Number).filter(Boolean))];
  const merged = {};
  let lastStatus = 200;
  let anyOk = false;
  for (let i = 0; i < unique.length; i += GANTT_JOB_CHUNK) {
    const chunk = unique.slice(i, i + GANTT_JOB_CHUNK);
    const result = await postJson(session, '/api/Calendar/GanttChart', { jobIds: chunk });
    lastStatus = result.status;
    if (!result.ok) continue;
    anyOk = true;
    Object.assign(merged, scheduleMilestonesFromGantt(result.data));
  }
  return { ok: anyOk, status: lastStatus, data: merged };
}

async function fetchBaselineGridForJob(session, jobId) {
  const result = await postJson(session, '/api/Calendar/BaselineGrid', { jobIds: [Number(jobId)] });
  if (!result.ok) return { ok: false, status: result.status, rows: [] };
  const rows = result.data?.data?.data;
  return {
    ok: true,
    status: result.status,
    rows: Array.isArray(rows) ? rows : [],
  };
}

async function fetchOchMasterTemplateTitles(session) {
  const list = await getJson(session, '/api/Templates/List');
  if (!list.ok) return { ok: false, status: list.status, titles: new Set(), templateId: null };
  const templates = list.data?.data?.templates?.value ?? list.data?.templates?.value ?? [];
  const match = (Array.isArray(templates) ? templates : []).find((row) =>
    OCH_MASTER_TEMPLATE_NAME.test(String(row?.name || '').trim()),
  );
  const templateId = Number(match?.id);
  if (!templateId) return { ok: true, status: list.status, titles: new Set(), templateId: null };
  const gantt = await postJson(session, '/api/Calendar/GanttChart', { jobIds: [templateId] });
  if (!gantt.ok) return { ok: false, status: gantt.status, titles: new Set(), templateId };
  const items = gantt.data?.data?.items ?? gantt.data?.items ?? [];
  const titles = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeScheduleTitle(item?.title))
      .filter(Boolean),
  );
  return { ok: true, status: gantt.status, titles, templateId };
}

/**
 * Per open job: Permit / Selections / Construction slip from Schedule → Baseline,
 * plus template-filtered item rows for Total Slip drill-down.
 * Fetches one job at a time (BaselineGrid ignores extra jobIds beyond the first).
 */
async function fetchBaselineSlipByJob(session, jobIds, { concurrency = 5, templateTitles = new Set() } = {}) {
  if (!jobIds.length) return { ok: true, status: 200, data: {}, itemsByJob: {} };
  const unique = [...new Set(jobIds.map(Number).filter(Boolean))];
  const parts = await mapPool(unique, concurrency, async (jobId) => {
    const result = await fetchBaselineGridForJob(session, jobId);
    return { jobId, ...result };
  });
  const data = {};
  const itemsByJob = {};
  let lastStatus = 200;
  let anyOk = false;
  for (const part of parts) {
    lastStatus = part.status || lastStatus;
    if (!part.ok) continue;
    anyOk = true;
    const filtered =
      templateTitles.size > 0 ? filterBaselineRowsToTemplate(part.rows, templateTitles) : part.rows;
    data[String(part.jobId)] = slipBucketsFromBaselineItems(filtered);
    itemsByJob[String(part.jobId)] = filtered.map(compactBaselineSlipRow);
  }
  return { ok: anyOk || !unique.length, status: lastStatus, data, itemsByJob };
}

function closedWarrantyJobIdsFromReports(...payloads) {
  const ids = new Set();
  for (const payload of payloads) {
    const list =
      payload?.data?.rowData ??
      payload?.rowData ??
      (Array.isArray(payload?.data) ? payload.data : null) ??
      (Array.isArray(payload) ? payload : []);
    for (const row of list) {
      const status = String(row?.jobStatus ?? '').toLowerCase();
      if (!status.includes('closed') && !status.includes('warranty')) continue;
      const id = Number(row?.jobID ?? row?.jobId);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** PM → Selections list view (`selectedTab=1`). */
export const SELECTIONS_GRID_SELECTED_TAB = 1;
export const SELECTIONS_GRID_PAGE_SIZE = 500;

export function selectionsGridBody(jobId, { pageNumber = 1, pageSize = SELECTIONS_GRID_PAGE_SIZE } = {}) {
  const firstRow = (pageNumber - 1) * pageSize + 1;
  const lastRow = pageNumber * pageSize;
  return {
    gridRequest: { selectedColumns: [], sortColumn: null, sortDirection: 'asc', savedViewId: -1 },
    pagingData: {
      pageNumber,
      pageSize,
      firstRow,
      lastRow,
      totalRowsAllPages: pageSize,
      resetScroll: false,
    },
    filters: '{}',
    jobIds: [jobId],
  };
}

async function fetchSelectionsPage(session, jobId, pageNumber) {
  return postJson(
    session,
    `/api/Selections/Grid?selectedTab=${SELECTIONS_GRID_SELECTED_TAB}`,
    selectionsGridBody(jobId, { pageNumber }),
  );
}

async function fetchSelectionsForJob(session, jobId) {
  const rows = [];
  let pageNumber = 1;
  let totalRecords = null;

  while (true) {
    const result = await fetchSelectionsPage(session, jobId, pageNumber);
    if (!result.ok) return { ok: false, status: result.status, rows: [] };

    const payload = result.data?.data ?? {};
    const pageRows = Array.isArray(payload.data) ? payload.data : [];
    if (totalRecords == null) totalRecords = Number(payload.records ?? pageRows.length);

    rows.push(...pageRows);
    if (!pageRows.length || rows.length >= totalRecords || pageRows.length < SELECTIONS_GRID_PAGE_SIZE) break;
    pageNumber += 1;
  }

  return { ok: true, status: 200, rows };
}

async function fetchSelectionsForOpenJobs(session, jobIds, { concurrency = 5 } = {}) {
  if (!jobIds.length) return {};

  const parts = await mapPool(jobIds, concurrency, async (jobId) => {
    const result = await fetchSelectionsForJob(session, jobId);
    return { jobId, ...result };
  });

  const byJob = {};
  for (const part of parts) {
    if (part.ok) byJob[part.jobId] = part.rows;
  }
  return byJob;
}

async function fetchActionItemsByJob(session, jobIds) {
  const entries = await Promise.all(
    jobIds.map(async (jobId) => {
      const result = await getJson(session, `/apix/v2/Summary/job/${jobId}/action-items/count`);
      return [jobId, result.ok ? result.data : null];
    }),
  );
  return Object.fromEntries(entries.filter(([, value]) => value != null));
}

export function contractPriceFromJobInfo(payload) {
  const raw = payload?.data?.jobInfo?.contractPrice ?? payload?.jobInfo?.contractPrice;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const value = Number(raw.value);
    if (Number.isFinite(value)) return value;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Jobs → Job Info contract price for open jobs not yet "sent to budget"
 * (absent from Profitability / WIP with a revised price).
 */
async function fetchJobInfoContractByJob(session, jobIds, { concurrency = 5 } = {}) {
  if (!jobIds.length) return {};
  const unique = [...new Set(jobIds.map(Number).filter(Boolean))];
  const parts = await mapPool(unique, concurrency, async (jobId) => {
    const result = await getJson(session, `/api/Jobsites/${jobId}`);
    return { jobId, ok: result.ok, contractPrice: result.ok ? contractPriceFromJobInfo(result.data) : 0 };
  });
  const byJob = {};
  for (const part of parts) {
    if (part.ok) byJob[String(part.jobId)] = part.contractPrice;
  }
  return byJob;
}

function leadsGridBody() {
  return {
    gridRequest: {
      hideMultiJobsColumns: true,
      selectedColumns: [
        '1', '2', '3', '4', '29', '26', '5', '6', '7', '12', '13', '9', '10', '20', '24', '11', '52', '15',
        '55', '56', '54', '57', '58', '25', '8', '22', '48', '49', '35', '53', '33', '32', '17', '18', '16',
        '31', '19', '14', '23', '34', '50', '30', '21', '62', '63',
      ],
      sortColumn: '4',
      sortDirection: 'asc',
      hasFooter: true,
      emptyStateEntity: 14,
      savedViewId: -1,
    },
    pagingData: {
      pageNumber: '1',
      pageSize: 500,
      resetScroll: false,
      firstRow: 1,
      lastRow: 500,
      totalRowsAllPages: 500,
      currentPage: 1,
    },
    // Sales → Lead Opportunities list (company-wide). Empty filters = all open opportunities.
    filters: '{}',
    jobIds: [],
    gridType: 1,
  };
}

export async function fetchReports(session) {
  const { start: logStart, end: logEnd } = rollingLogWindow();
  const [
    wip,
    profitability,
    changeOrderProfit,
    cashflow,
    dailyLogs,
    userDailyLogsRecent,
    schedulePercentComplete,
    baselineDuration,
    leadStatus,
    jobs,
    leadsGrid,
    jobsites,
  ] = await Promise.all([
      getJson(session, '/apix/v3/Reporting/work-in-progress', { openJobLimit: 500 }),
      getJson(session, '/apix/v3/Reporting/profitability', {
        openJobLimit: 500,
        closedJobLimit: 500,
        warrantyJobLimit: 500,
      }),
      getJson(session, '/apix/v3/Reporting/change-order-profit', { openJobLimit: 500 }),
      getJson(session, '/apix/v3/Reporting/cashflow'),
      getJson(session, '/apix/v3/Reporting/daily-log-creation-by-job'),
      getJson(session, '/apix/v3/Reporting/user-daily-logs', { startDate: logStart, endDate: logEnd }),
      getJson(session, '/apix/v3/Reporting/schedule-percent-complete-by-job'),
      getJson(session, '/apix/v3/Reporting/baseline-vs-actual-duration-by-job'),
      getJson(session, '/apix/v3/Reporting/lead-status-by-source'),
      getJson(session, '/api/jobpicker/GetExistingJobList'),
      postJson(session, '/api/Leads/Grid', leadsGridBody()),
      getJson(session, '/apix/v3/Jobsites'),
    ]);

  const jobIds = openJobIdsFromPicker(jobs.data);
  const closedWarrantyIds = closedWarrantyJobIdsFromReports(schedulePercentComplete.data, dailyLogs.data);
  const scheduleJobIds = [...new Set([...jobIds, ...closedWarrantyIds])];
  const masterTemplate = await fetchOchMasterTemplateTitles(session);
  const [tasks, actionItemsByJob, selectionsByJob, scheduleByJob, baselineSlipByJob, jobInfoContractByJob] =
    await Promise.all([
    fetchTasksForOpenJobs(session, jobIds),
    jobIds.length ? fetchActionItemsByJob(session, jobIds) : Promise.resolve({}),
    jobIds.length ? fetchSelectionsForOpenJobs(session, jobIds) : Promise.resolve({}),
    scheduleJobIds.length
      ? fetchScheduleMilestonesByJob(session, scheduleJobIds)
      : Promise.resolve({ ok: true, status: 200, data: {} }),
    jobIds.length
      ? fetchBaselineSlipByJob(session, jobIds, { templateTitles: masterTemplate.titles })
      : Promise.resolve({ ok: true, status: 200, data: {}, itemsByJob: {} }),
    jobIds.length ? fetchJobInfoContractByJob(session, jobIds) : Promise.resolve({}),
  ]);

  const scheduleData = scheduleByJob.data ?? {};
  // Back-compat: Site Work–only map used by older snapshot/tests.
  const siteWorkByJob = Object.fromEntries(
    Object.entries(scheduleData)
      .filter(([, row]) => row?.siteWork)
      .map(([jobId, row]) => [
        jobId,
        {
          title: row.siteWork.title,
          started: row.siteWork.started,
          percentComplete: row.siteWork.percentComplete,
          isComplete: row.siteWork.isComplete,
          startDate: row.siteWork.startDate,
        },
      ]),
  );

  const reports = {
    wip: wip.data,
    profitability: profitability.data,
    changeOrderProfit: changeOrderProfit.data,
    cashflow: cashflow.data,
    jobInfoContractByJob,
    dailyLogs: dailyLogs.data,
    userDailyLogsRecent: userDailyLogsRecent.data,
    schedulePercentComplete: schedulePercentComplete.data,
    baselineDuration: baselineDuration.data,
    leadStatus: leadStatus.data,
    jobs: jobs.data,
    leads: leadsGrid.data,
    jobsites: jobsites.data,
    tasks: tasks.data,
    actionItemsByJob,
    selectionsByJob,
    scheduleByJob: scheduleData,
    siteWorkByJob,
    baselineSlipByJob: baselineSlipByJob.data ?? {},
    baselineItemsByJob: baselineSlipByJob.itemsByJob ?? {},
    ochMasterTemplateId: masterTemplate.templateId,
  };
  const failed = [
    ['work-in-progress', wip],
    ['daily-log-creation-by-job', dailyLogs],
    ['jobpicker', jobs],
  ].filter(([, result]) => !result.ok);
  if (failed.length === 3) {
    throw Object.assign(new Error(`Buildertrend reports returned HTTP ${failed[0][1].status}. Session may have expired.`), {
      status: 502,
      code: 'reports_failed',
    });
  }
  return {
    reports,
    statuses: {
      wip: wip.status,
      profitability: profitability.status,
      changeOrderProfit: changeOrderProfit.status,
      cashflow: cashflow.status,
      dailyLogs: dailyLogs.status,
      userDailyLogsRecent: userDailyLogsRecent.status,
      schedulePercentComplete: schedulePercentComplete.status,
      baselineDuration: baselineDuration.status,
      leadStatus: leadStatus.status,
      jobs: jobs.status,
      leads: leadsGrid.status,
      jobsites: jobsites.status,
      tasks: tasks.status,
      scheduleByJob: scheduleByJob.status ?? 0,
      siteWorkByJob: scheduleByJob.status ?? 0,
      baselineSlipByJob: baselineSlipByJob.status ?? 0,
      ochMasterTemplate: masterTemplate.status ?? 0,
    },
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
  // Compact JSON — pretty-printing a ~100MB pull can OOM small serverless hosts.
  fs.writeFileSync(file, JSON.stringify(payload));
}

export async function pullBuildertrend({ cookie } = {}) {
  const { session } = await authenticate({ cookie });
  const { reports, statuses } = await fetchReports(session);
  const payload = {
    pulledAt: new Date().toISOString(),
    authMethod: session.method,
    readonly: true,
    statuses,
    reports,
  };
  writeCache(payload);
  return payload;
}
