/** Isolate: can Vercel import from server/ at all? */
import { applyCors, hasDatabaseUrl } from '../server/vercelCors.js';

export default function handler(_req, res) {
  applyCors(res);
  res.status(200).json({
    ok: true,
    hasDatabaseUrl: hasDatabaseUrl(),
    keys: ['DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING']
      .filter((k) => Boolean(process.env[k])),
  });
}
