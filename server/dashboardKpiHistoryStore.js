/**
 * Daily KPI snapshots for Robinhood-style period charts on the Owner Dashboard.
 */
import { getPool } from './dbPool.js';

const TABLE = 'dashboard_kpi_history';

/** @typedef {Record<string, number>} KpiMetrics */

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      day date NOT NULL PRIMARY KEY,
      metrics jsonb NOT NULL,
      source text NOT NULL DEFAULT 'live',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function dayKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Upsert one day's metrics. Best-effort when DATABASE_URL is missing.
 * @param {KpiMetrics} metrics
 * @param {{ day?: string | Date, source?: string }} [opts]
 */
export async function upsertKpiHistoryDay(metrics, opts = {}) {
  if (!metrics || typeof metrics !== 'object') {
    return { saved: false, backend: 'none' };
  }
  const day = dayKey(opts.day);
  const source = opts.source || 'live';
  try {
    const pool = getPool();
    if (!pool) return { saved: false, backend: 'none' };
    await ensureTable(pool);
    await pool.query(
      `INSERT INTO ${TABLE} (day, metrics, source, updated_at)
       VALUES ($1::date, $2::jsonb, $3, now())
       ON CONFLICT (day) DO UPDATE SET
         metrics = EXCLUDED.metrics,
         source = EXCLUDED.source,
         updated_at = now()`,
      [day, JSON.stringify(metrics), source],
    );
    return { saved: true, backend: 'postgres', day };
  } catch (err) {
    console.error('[dashboardKpiHistoryStore] upsert failed', err?.message || err);
    return { saved: false, backend: 'none', error: String(err?.message || err) };
  }
}

/**
 * @param {{ from?: string, to?: string, limit?: number }} [opts]
 * @returns {Promise<{ points: Array<{ day: string, metrics: KpiMetrics, source: string }>, backend: string }>}
 */
export async function listKpiHistory(opts = {}) {
  try {
    const pool = getPool();
    if (!pool) return { points: [], backend: 'none' };
    await ensureTable(pool);
    const limit = Math.min(Math.max(Number(opts.limit) || 400, 1), 800);
    const params = [];
    let where = '';
    if (opts.from) {
      params.push(opts.from);
      where += `${where ? ' AND' : ' WHERE'} day >= $${params.length}::date`;
    }
    if (opts.to) {
      params.push(opts.to);
      where += `${where ? ' AND' : ' WHERE'} day <= $${params.length}::date`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT day::text AS day, metrics, source
       FROM ${TABLE}
       ${where}
       ORDER BY day ASC
       LIMIT $${params.length}`,
      params,
    );
    return {
      backend: 'postgres',
      points: rows.map((row) => ({
        day: String(row.day).slice(0, 10),
        metrics: row.metrics && typeof row.metrics === 'object' ? row.metrics : {},
        source: row.source || 'live',
      })),
    };
  } catch (err) {
    console.error('[dashboardKpiHistoryStore] list failed', err?.message || err);
    return { points: [], backend: 'none' };
  }
}

/**
 * @param {Array<{ id: string, value: number }>} kpis
 * @returns {KpiMetrics}
 */
export function metricsFromKpis(kpis) {
  const out = {};
  for (const card of kpis || []) {
    if (!card?.id || !Number.isFinite(Number(card.value))) continue;
    out[card.id] = Number(card.value);
  }
  return out;
}
