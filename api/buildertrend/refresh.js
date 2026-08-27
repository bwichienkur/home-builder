import { handleRefresh } from '../../server/buildertrend/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    await handleRefresh(req, res);
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
      });
    }
  }
}
