/**
 * Isolated Buildertrend refresh for Vercel serverless.
 * Intentionally does NOT import pull.js (large) or dotenv/fs.
 *
 * Locally this path succeeds in ~2s with a valid cookie. On Vercel, platform
 * HTTP 500s usually mean the outbound BT call hung until the function was killed —
 * so every network/parse step uses a hard Promise.race timeout and a size cap.
 */

const ORIGIN = 'https://buildertrend.net';
const FETCH_MS = 12_000;
const MAX_BT_BODY_CHARS = 1_500_000;

function parseCookieHeader(raw) {
  const jar = new Map();
  for (const part of String(raw || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return jar;
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
  for (const line of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
    const pair = String(line).split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asRows(payload) {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (!root) return [];
  if (Array.isArray(root.rowData)) return root.rowData;
  if (Array.isArray(root.data)) return root.data;
  const nested = asRecord(root.data);
  if (nested) {
    if (Array.isArray(nested.rowData)) return nested.rowData;
    if (Array.isArray(nested.data)) return nested.data;
  }
  return [];
}

/** Hard timeout that does not rely on AbortSignal.timeout (flaky in some runtimes). */
function raceTimeout(promise, ms, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(
          new Error(
            `Buildertrend timed out during "${stage}" (${ms / 1000}s). Vercel often cannot finish calls to buildertrend.net — set BUILDERTREND_COOKIE on Vercel or run a local pull + snapshot bake.`,
          ),
          { status: 504, code: 'bt_timeout', stage },
        ),
      );
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function btGet(session, urlPath, query, stage) {
  const url = new URL(`${ORIGIN}${urlPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const run = async () => {
    let response;
    try {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), FETCH_MS);
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': session.userAgent,
            Cookie: cookieHeader(session.jar),
          },
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw Object.assign(
        new Error(
          timedOut
            ? `Buildertrend timed out during "${stage}". The Vercel host may be blocked — use local pull + snapshot bake, or set BUILDERTREND_COOKIE on Vercel and retry.`
            : `Buildertrend unreachable during "${stage}": ${err?.message || err}`,
        ),
        { status: 504, code: timedOut ? 'bt_timeout' : 'bt_unreachable', stage },
      );
    }

    collectCookies(session.jar, readSetCookies(response.headers));
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BT_BODY_CHARS) {
      throw Object.assign(
        new Error(`Buildertrend "${stage}" response too large (${contentLength} bytes).`),
        { status: 502, code: 'bt_payload_too_large', stage },
      );
    }

    const text = await response.text();
    if (text.length > MAX_BT_BODY_CHARS) {
      throw Object.assign(
        new Error(`Buildertrend "${stage}" body too large (${text.length} chars).`),
        { status: 502, code: 'bt_payload_too_large', stage },
      );
    }

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  };

  return raceTimeout(run(), FETCH_MS + 2000, stage);
}

function slimJobs(payload) {
  const root = asRecord(payload);
  const nested = asRecord(root?.data);
  const list = Array.isArray(nested?.jobs) ? nested.jobs : Array.isArray(root?.jobs) ? root.jobs : [];
  return {
    data: {
      jobs: list
        .map((row) => {
          const rec = asRecord(row);
          if (!rec) return null;
          return {
            jobID: rec.jobID ?? rec.jobId,
            jobName: rec.jobName ?? rec.name,
            jobStatus: rec.jobStatus,
            projectManagers: rec.projectManagers ?? rec.projectManager,
          };
        })
        .filter(Boolean),
    },
  };
}

function slimWip(payload) {
  return asRows(payload)
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      return {
        jobID: rec.jobID ?? rec.jobId,
        jobName: rec.jobName ?? rec.name,
        jobStatus: rec.jobStatus,
        projectManagers: rec.projectManagers ?? rec.projectManager,
        contractPrice: rec.contractPrice ?? rec.revisedContractPrice,
        amountInvoiced: rec.amountInvoiced,
        percentComplete: rec.percentComplete,
        earnedRevenue: rec.earnedRevenue,
        projectedMargin: rec.projectedMargin,
        amountRemaining: rec.amountRemaining,
      };
    })
    .filter(Boolean);
}

function slimDailyLogs(payload) {
  return asRows(payload)
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      return {
        jobID: rec.jobID ?? rec.jobId,
        jobName: rec.jobName ?? rec.name,
        jobStatus: rec.jobStatus,
        dailyLogCount: rec.dailyLogCount ?? rec.logCount,
        openedDate: rec.openedDate ?? rec.openDate ?? rec.jobOpenedDate,
        projectManagers: rec.projectManagers ?? rec.projectManager,
      };
    })
    .filter(Boolean);
}

function emptyReports() {
  return {
    wip: [],
    profitability: [],
    changeOrderProfit: [],
    cashflow: null,
    jobInfoContractByJob: {},
    dailyLogs: [],
    userDailyLogsRecent: null,
    schedulePercentComplete: [],
    baselineDuration: [],
    leadStatus: null,
    jobs: { data: { jobs: [] } },
    leads: null,
    jobsites: null,
    tasks: { tasks: [] },
    actionItemsByJob: {},
    selectionsByJob: {},
    scheduleByJob: {},
    siteWorkByJob: {},
    baselineSlipByJob: {},
    baselineItemsByJob: {},
    ochMasterTemplateId: null,
  };
}

/**
 * Parse JSON body without hanging. On Vercel, awaiting the raw request stream
 * can block until the platform kills the function (generic HTTP 500).
 */
export function readJsonBodySync(req) {
  const body = req?.body;
  if (body == null || body === '') return {};
  if (Buffer.isBuffer(body)) {
    const raw = body.toString('utf8').trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof body === 'string') {
    const raw = body.trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

function resolveCookie(body) {
  const fromBody = typeof body?.cookie === 'string' ? body.cookie.trim() : '';
  if (fromBody) return { cookie: fromBody, source: 'body' };
  const fromEnv = String(process.env.BUILDERTREND_COOKIE || '').trim();
  if (fromEnv) return { cookie: fromEnv, source: 'env' };
  return { cookie: '', source: '' };
}

/**
 * Vercel-safe Buildertrend refresh handler (self-contained).
 */
export async function handleVercelRefresh(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.', code: 'method_not_allowed' });
  }

  const stages = [];
  const startedAt = Date.now();
  try {
    stages.push('parse_body');
    const body = readJsonBodySync(req);
    const { cookie, source: cookieSource } = resolveCookie(body);
    if (!cookie) {
      return res.status(400).json({
        ok: false,
        error:
          'Paste Buildertrend cookie values, or set BUILDERTREND_COOKIE on the Vercel project (Production env).',
        code: 'credentials_missing',
        stage: 'parse_body',
      });
    }

    const session = {
      jar: parseCookieHeader(cookie),
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    };

    stages.push('auth_probe');
    const probe = await btGet(session, '/apix/v3/Reporting/work-in-progress', { openJobLimit: 1 }, 'auth_probe');
    if (!probe.ok) {
      return res.status(401).json({
        ok: false,
        error: `Buildertrend rejected the cookies (HTTP ${probe.status}, source=${cookieSource || 'body'}). Re-copy .AspNet.Auth0, ASP.NET_SessionId, and GAESA from a logged-in buildertrend.net tab.`,
        code: 'cookie_rejected',
        stage: 'auth_probe',
      });
    }

    // Prefer returning something useful quickly. Extra reports are best-effort.
    let jobs = { data: { jobs: [] } };
    let wip = slimWip(probe.data);
    let dailyLogs = [];
    let jobsStatus = 0;
    let wipStatus = probe.status;
    let logsStatus = 0;

    try {
      stages.push('jobpicker');
      const jobsRaw = await btGet(session, '/api/jobpicker/GetExistingJobList', undefined, 'jobpicker');
      jobsStatus = jobsRaw.status;
      if (jobsRaw.ok) jobs = slimJobs(jobsRaw.data);
    } catch (err) {
      console.error('jobpicker skipped', err?.message || err);
    }

    try {
      stages.push('wip');
      const wipRaw = await btGet(
        session,
        '/apix/v3/Reporting/work-in-progress',
        { openJobLimit: 100 },
        'wip',
      );
      wipStatus = wipRaw.status;
      if (wipRaw.ok) wip = slimWip(wipRaw.data);
    } catch (err) {
      console.error('wip skipped', err?.message || err);
    }

    // Skip daily logs if we're already slow — platform may kill at ~60s.
    if (Date.now() - startedAt < 35_000) {
      try {
        stages.push('daily_logs');
        const logsRaw = await btGet(
          session,
          '/apix/v3/Reporting/daily-log-creation-by-job',
          undefined,
          'daily_logs',
        );
        logsStatus = logsRaw.status;
        if (logsRaw.ok) dailyLogs = slimDailyLogs(logsRaw.data);
      } catch (err) {
        console.error('daily_logs skipped', err?.message || err);
      }
    }

    const reports = {
      ...emptyReports(),
      jobs,
      wip,
      dailyLogs,
    };

    return res.status(200).json({
      ok: true,
      pulledAt: new Date().toISOString(),
      authMethod: cookieSource === 'env' ? 'cookie-env' : 'cookie',
      readonly: true,
      serverless: true,
      enrichment: 'core',
      elapsedMs: Date.now() - startedAt,
      statuses: {
        jobs: jobsStatus,
        wip: wipStatus,
        dailyLogs: logsStatus,
        stages,
        cookieSource,
      },
      reports,
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === 'string' && err.message.trim()
        ? err.message
        : 'Buildertrend refresh failed on the server.';
    console.error('vercelRefresh failed', { stages, err });
    return res.status(status).json({
      ok: false,
      error: message,
      code: err?.code || 'refresh_failed',
      stage: err?.stage || stages[stages.length - 1] || 'unknown',
      stages,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
