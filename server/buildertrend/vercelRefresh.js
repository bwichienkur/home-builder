/**
 * Isolated Buildertrend refresh for Vercel serverless.
 * Intentionally does NOT import pull.js (large) or dotenv/fs.
 * Cookie auth + a few slim GET reports only.
 */

const ORIGIN = 'https://buildertrend.net';
const FETCH_MS = 20_000;

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

async function btGet(session, urlPath, query, stage) {
  const url = new URL(`${ORIGIN}${urlPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': session.userAgent,
        Cookie: cookieHeader(session.jar),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_MS),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(
      new Error(
        timedOut
          ? `Buildertrend timed out during "${stage}" (no response in ${FETCH_MS / 1000}s). The host may block datacenter IPs — use local pull + snapshot bake.`
          : `Buildertrend unreachable during "${stage}": ${err?.message || err}`,
      ),
      { status: 504, code: timedOut ? 'bt_timeout' : 'bt_unreachable', stage },
    );
  }
  collectCookies(session.jar, readSetCookies(response.headers));
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
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

function slimProfitability(payload) {
  return asRows(payload)
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      return {
        jobID: rec.jobID ?? rec.jobId,
        jobName: rec.jobName ?? rec.name,
        jobStatus: rec.jobStatus,
        revisedClientPrice: rec.revisedClientPrice ?? rec.revisedContractPrice ?? rec.contractPrice,
        contractPrice: rec.contractPrice,
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

async function readJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  if (req.readable && !req.readableEnded) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8');
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
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
  try {
    stages.push('parse_body');
    const body = await readJsonBody(req);
    const cookie = typeof body?.cookie === 'string' ? body.cookie.trim() : '';
    if (!cookie) {
      return res.status(400).json({
        ok: false,
        error: 'Paste Buildertrend cookie values to refresh on this host.',
        code: 'credentials_missing',
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
        error: `Buildertrend rejected the pasted cookies (HTTP ${probe.status}). Re-copy .AspNet.Auth0, ASP.NET_SessionId, and GAESA from a logged-in buildertrend.net tab (Value column only).`,
        code: 'cookie_rejected',
        stage: 'auth_probe',
      });
    }

    stages.push('jobpicker');
    const jobsRaw = await btGet(session, '/api/jobpicker/GetExistingJobList', undefined, 'jobpicker');
    const jobs = jobsRaw.ok ? slimJobs(jobsRaw.data) : { data: { jobs: [] } };

    stages.push('wip');
    const wipRaw = await btGet(
      session,
      '/apix/v3/Reporting/work-in-progress',
      { openJobLimit: 200 },
      'wip',
    );
    const wip = wipRaw.ok ? slimWip(wipRaw.data) : [];

    stages.push('daily_logs');
    const logsRaw = await btGet(session, '/apix/v3/Reporting/daily-log-creation-by-job', undefined, 'daily_logs');
    const dailyLogs = logsRaw.ok ? slimDailyLogs(logsRaw.data) : [];

    stages.push('profitability');
    const profitRaw = await btGet(
      session,
      '/apix/v3/Reporting/profitability',
      { openJobLimit: 200, closedJobLimit: 50, warrantyJobLimit: 50 },
      'profitability',
    );
    const profitability = profitRaw.ok ? slimProfitability(profitRaw.data) : [];

    if (!jobsRaw.ok && !wipRaw.ok && !logsRaw.ok) {
      return res.status(502).json({
        ok: false,
        error: `Buildertrend reports failed after auth (jobs HTTP ${jobsRaw.status}, wip HTTP ${wipRaw.status}).`,
        code: 'reports_failed',
        stage: 'reports',
      });
    }

    const reports = {
      ...emptyReports(),
      jobs,
      wip,
      dailyLogs,
      profitability,
    };

    return res.status(200).json({
      ok: true,
      pulledAt: new Date().toISOString(),
      authMethod: 'cookie',
      readonly: true,
      serverless: true,
      enrichment: 'core',
      statuses: {
        jobs: jobsRaw.status,
        wip: wipRaw.status,
        dailyLogs: logsRaw.status,
        profitability: profitRaw.status,
        stages,
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
    });
  }
}
