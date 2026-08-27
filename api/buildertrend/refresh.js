import { handleVercelRefresh } from '../../server/buildertrend/vercelRefresh.js';

// Keep under Hobby limits; isolated handler should finish well under this.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    await handleVercelRefresh(req, res);
  } catch (err) {
    console.error('buildertrend refresh fatal', err);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error && err.message ? err.message : 'Buildertrend refresh failed on the server.',
        code: 'refresh_failed',
      });
    }
  }
}
