import { handleDashboard } from '../../server/buildertrend/http.js';

export default async function handler(req, res) {
  try {
    await handleDashboard(req, res);
  } catch (err) {
    console.error('buildertrend dashboard handler error', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : 'Buildertrend dashboard read failed on the server.',
        code: 'refresh_failed',
      });
    }
  }
}
