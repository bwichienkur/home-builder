/**
 * Vercel Buildertrend refresh — delegates to staged full pull (multi-request).
 */
import { readJsonBodySync } from './vercelRefresh.js';
import { runStagedBuildertrendRefresh, toRefreshResponse } from './stagedPull.js';

export async function handleVercelFullRefresh(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST to refresh.', code: 'method_not_allowed' });
  }

  try {
    const body = readJsonBodySync(req);
    const cookie = typeof body?.cookie === 'string' ? body.cookie.trim() : '';
    const continuePull = Boolean(body?.continue);
    const pull = await runStagedBuildertrendRefresh({ cookie, continuePull });
    return res.status(200).json(toRefreshResponse(pull));
  } catch (err) {
    const status = Number(err?.status) || 500;
    const message =
      typeof err?.message === 'string' && err.message.trim()
        ? err.message
        : 'Buildertrend refresh failed on the server.';
    console.error('handleVercelFullRefresh failed', err);
    return res.status(status).json({
      ok: false,
      error: message,
      code: err?.code || 'refresh_failed',
      stage: err?.stage,
    });
  }
}
