/** Isolate: Neon HTTP on Vercel without going through dbPool. */
import { neon } from '@neondatabase/serverless';

export default async function handler(_req, res) {
  try {
    const url =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      '';
    if (!url) {
      return res.status(503).json({
        ok: false,
        error: 'No DATABASE_URL',
        envKeys: Object.keys(process.env)
          .filter((k) => /DATABASE|POSTGRES|NEON|PG/i.test(k))
          .sort(),
      });
    }
    const sql = neon(url);
    const rows = await sql`select 1 as n`;
    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
      name: err?.name,
      stack: err?.stack?.split('\n').slice(0, 8),
    });
  }
}
