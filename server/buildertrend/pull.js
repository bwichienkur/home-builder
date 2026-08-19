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
    if (methodUpper !== 'POST') throw new Error('JSON body is only used for the login POST.');
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
  const raw = cookieOverride ?? env('BUILDERTREND_COOKIE');
  if (!raw) return null;
  const session = newSession({
    jar: parseCookieEnv(raw),
    method: 'cookie',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const probe = await btFetch(session, 'GET', '/apix/v3/Reporting/work-in-progress', { query: { openJobLimit: 1 } });
  if (!probe.ok) return null;
  return session;
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

export async function fetchReports(session) {
  const [wip, dailyLogs, leadStatus, jobs, leads, jobsites] = await Promise.all([
    getJson(session, '/apix/v3/Reporting/work-in-progress', { openJobLimit: 500 }),
    getJson(session, '/apix/v3/Reporting/daily-log-creation-by-job'),
    getJson(session, '/apix/v3/Reporting/lead-status-by-source'),
    getJson(session, '/api/jobpicker/GetExistingJobList'),
    getJson(session, '/api/Leads'),
    getJson(session, '/apix/v3/Jobsites'),
  ]);
  const reports = {
    wip: wip.data,
    dailyLogs: dailyLogs.data,
    leadStatus: leadStatus.data,
    jobs: jobs.data,
    leads: leads.data,
    jobsites: jobsites.data,
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
  return { reports, statuses: { wip: wip.status, dailyLogs: dailyLogs.status, leadStatus: leadStatus.status, jobs: jobs.status, leads: leads.status, jobsites: jobsites.status } };
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
