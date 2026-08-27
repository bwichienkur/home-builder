import { handleRefresh } from '../../server/buildertrend/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    // Always use the minimal serverless pull on this Vercel function.
    await handleRefresh(req, res, { serverless: true });
  } catch (err) {
    console.error('buildertrend refresh handler error', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : 'Buildertrend refresh failed on the server.',
        code: 'refresh_failed',
        ...(err?.stage ? { stage: err.stage } : {}),
      });
    }
  }
}
