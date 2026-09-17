import type { KpiCard } from '../buildertrend/types';

/** Robinhood-style chart period windows. */
export type ChartPeriodId = '1d' | '1w' | '1m' | '3m' | 'ytd' | '1y' | 'all';

export const CHART_PERIODS: { id: ChartPeriodId; label: string }[] = [
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: 'ytd', label: 'YTD' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'ALL' },
];

export type KpiHistoryPoint = {
  day: string;
  metrics: Record<string, number>;
  source?: string;
};

export type PeriodSeries = {
  days: string[];
  values: number[];
  /** Absolute change end − start. */
  change: number;
  /** Percent change vs period start. */
  changePct: number;
  start: number;
  end: number;
  label: string;
};

const PERIOD_LABEL: Record<ChartPeriodId, string> = {
  '1d': 'Past day',
  '1w': 'Past week',
  '1m': 'Past month',
  '3m': 'Past 3 months',
  ytd: 'Year to date',
  '1y': 'Past year',
  all: 'All time',
};

export function periodLabel(period: ChartPeriodId): string {
  return PERIOD_LABEL[period];
}

export function periodStartDate(period: ChartPeriodId, now = new Date()): Date | null {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case '1d':
      d.setDate(d.getDate() - 1);
      return d;
    case '1w':
      d.setDate(d.getDate() - 7);
      return d;
    case '1m':
      d.setMonth(d.getMonth() - 1);
      return d;
    case '3m':
      d.setMonth(d.getMonth() - 3);
      return d;
    case 'ytd':
      return new Date(d.getFullYear(), 0, 1);
    case '1y':
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case 'all':
      return null;
    default:
      return d;
  }
}

function toDay(iso: string | Date): string {
  if (typeof iso === 'string') return iso.slice(0, 10);
  return iso.toISOString().slice(0, 10);
}

/** Filter history points to the selected period (inclusive). */
export function sliceHistoryForPeriod(
  points: KpiHistoryPoint[],
  period: ChartPeriodId,
  now = new Date(),
): KpiHistoryPoint[] {
  const start = periodStartDate(period, now);
  if (!start) return [...points].sort((a, b) => a.day.localeCompare(b.day));
  const startDay = toDay(start);
  const endDay = toDay(now);
  return points
    .filter((p) => p.day >= startDay && p.day <= endDay)
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function seriesForMetric(
  points: KpiHistoryPoint[],
  metricId: string,
  period: ChartPeriodId,
  fallbackValue?: number,
  now = new Date(),
): PeriodSeries {
  const sliced = sliceHistoryForPeriod(points, period, now);
  let days = sliced.map((p) => p.day);
  let values = sliced.map((p) => Number(p.metrics[metricId])).filter((v, i) => {
    if (!Number.isFinite(v)) {
      days[i] = '';
      return false;
    }
    return true;
  });
  // Re-align after filter — rebuild cleanly
  const pairs = sliced
    .map((p) => ({ day: p.day, value: Number(p.metrics[metricId]) }))
    .filter((p) => Number.isFinite(p.value));
  days = pairs.map((p) => p.day);
  values = pairs.map((p) => p.value);

  if (!values.length && fallbackValue != null && Number.isFinite(fallbackValue)) {
    const today = toDay(now);
    days = [today];
    values = [fallbackValue];
  }

  const start = values[0] ?? 0;
  const end = values[values.length - 1] ?? start;
  const change = end - start;
  const changePct = start === 0 ? (end === 0 ? 0 : 100) : (change / Math.abs(start)) * 100;

  return {
    days,
    values,
    change,
    changePct,
    start,
    end,
    label: periodLabel(period),
  };
}

/** Overlay period series onto KPI cards (delta + sparkline). */
export function applyHistoryToKpis(
  kpis: KpiCard[],
  points: KpiHistoryPoint[],
  period: ChartPeriodId,
  now = new Date(),
): KpiCard[] {
  return kpis.map((card) => {
    const series = seriesForMetric(points, card.id, period, card.value, now);
    if (series.values.length < 2 && points.length === 0) {
      return {
        ...card,
        deltaLabel: periodLabel(period),
      };
    }
    return {
      ...card,
      delta: Number(series.changePct.toFixed(1)),
      deltaUnit: 'pct' as const,
      deltaLabel: periodLabel(period),
      sparkline: series.values.length ? series.values : card.sparkline,
    };
  });
}

/** Seed a smooth demo series when Neon has no history yet (so UI is usable). */
export function seedSyntheticHistory(
  kpis: KpiCard[],
  days = 90,
  now = new Date(),
): KpiHistoryPoint[] {
  const points: KpiHistoryPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const t = 1 - i / Math.max(days - 1, 1);
    const metrics: Record<string, number> = {};
    for (const card of kpis) {
      const end = card.value;
      // Ease from ~70% of current up to current with mild noise.
      const base = end * (0.72 + 0.28 * t);
      const wobble = end * 0.015 * Math.sin(i / 3.2 + card.id.length);
      metrics[card.id] = Math.max(0, base + wobble);
    }
    points.push({ day: toDay(d), metrics, source: 'synthetic' });
  }
  return points;
}

export async function fetchKpiHistory(signal?: AbortSignal): Promise<KpiHistoryPoint[]> {
  try {
    const res = await fetch('/api/dashboard?__history=1&limit=400', { signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { points?: KpiHistoryPoint[] };
    return Array.isArray(json.points) ? json.points : [];
  } catch {
    return [];
  }
}

export async function recordKpiSnapshot(kpis: KpiCard[], source = 'live'): Promise<void> {
  const metrics: Record<string, number> = {};
  for (const card of kpis) {
    if (Number.isFinite(card.value)) metrics[card.id] = card.value;
  }
  if (!Object.keys(metrics).length) return;
  try {
    await fetch('/api/dashboard?__history=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics, source }),
    });
  } catch {
    /* best-effort */
  }
}

export function formatPeriodChangeUsd(change: number, changePct: number): string {
  const arrow = change >= 0 ? '▲' : '▼';
  const abs = Math.abs(change);
  const money =
    abs >= 1_000_000
      ? `$${(abs / 1_000_000).toFixed(2)}M`
      : abs >= 1_000
        ? `$${(abs / 1_000).toFixed(2)}K`
        : `$${abs.toFixed(2)}`;
  return `${arrow} ${money} (${Math.abs(changePct).toFixed(2)}%)`;
}

export function formatPeriodChangePlain(changePct: number, absoluteChange: number, isMoney: boolean): string {
  if (isMoney) return formatPeriodChangeUsd(absoluteChange, changePct);
  const arrow = changePct >= 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(absoluteChange).toFixed(1)} (${Math.abs(changePct).toFixed(2)}%)`;
}
