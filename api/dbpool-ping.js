/** Isolate: import dbPool getPool + one query. */
export default async function handler(_req, res) {
  try {
    const { getPool } = await import('../server/dbPool.js');
    const db = getPool();
    if (!db) {
      return res.status(503).json({ ok: false, error: 'getPool returned null' });
    }
    const { rows } = await db.query('select 1 as n');
    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
      name: err?.name,
      stack: err?.stack?.split('\n').slice(0, 12),
    });
  }
}
