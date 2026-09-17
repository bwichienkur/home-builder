import { describe, expect, it } from 'vitest';
import {
  applyHistoryToKpis,
  periodStartDate,
  seriesForMetric,
  sliceHistoryForPeriod,
  seedSyntheticHistory,
  type KpiHistoryPoint,
} from './kpiHistory';
import type { KpiCard } from '../buildertrend/types';

const samplePoints: KpiHistoryPoint[] = [
  { day: '2026-01-01', metrics: { wip: 100, active: 10 } },
  { day: '2026-01-08', metrics: { wip: 110, active: 11 } },
  { day: '2026-01-15', metrics: { wip: 120, active: 12 } },
  { day: '2026-02-01', metrics: { wip: 150, active: 14 } },
  { day: '2026-03-01', metrics: { wip: 180, active: 15 } },
];

describe('kpiHistory period helpers', () => {
  it('slices by 1m window', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const sliced = sliceHistoryForPeriod(samplePoints, '1m', now);
    expect(sliced[0]?.day).toBe('2026-02-01');
    expect(sliced.at(-1)?.day).toBe('2026-03-01');
  });

  it('computes percent change for a series', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const series = seriesForMetric(samplePoints, 'wip', 'all', undefined, now);
    expect(series.start).toBe(100);
    expect(series.end).toBe(180);
    expect(series.changePct).toBeCloseTo(80, 5);
  });

  it('ytd starts Jan 1', () => {
    const start = periodStartDate('ytd', new Date('2026-09-17T12:00:00Z'));
    expect(start?.getFullYear()).toBe(2026);
    expect(start?.getMonth()).toBe(0);
    expect(start?.getDate()).toBe(1);
  });

  it('applies history onto KPI cards', () => {
    const kpis: KpiCard[] = [
      {
        id: 'wip',
        title: 'WIP',
        value: 180,
        display: '$180',
        delta: 0,
        deltaUnit: 'pct',
        deltaLabel: 'vs prior',
        sparkline: [180, 180],
      },
    ];
    const next = applyHistoryToKpis(kpis, samplePoints, 'all', new Date('2026-03-01T12:00:00Z'));
    expect(next[0]!.delta).toBe(80);
    expect(next[0]!.sparkline.length).toBeGreaterThan(2);
    expect(next[0]!.deltaLabel).toBe('All time');
  });

  it('seeds synthetic history for empty Neon', () => {
    const kpis: KpiCard[] = [
      {
        id: 'pipeline',
        title: 'Pipeline',
        value: 1_000_000,
        display: '$1.0M',
        delta: 0,
        deltaUnit: 'pct',
        deltaLabel: 'vs prior',
        sparkline: [1, 1],
      },
    ];
    const seeded = seedSyntheticHistory(kpis, 30, new Date('2026-09-17T12:00:00Z'));
    expect(seeded).toHaveLength(30);
    expect(seeded[0]!.metrics.pipeline).toBeLessThan(seeded.at(-1)!.metrics.pipeline!);
  });
});
