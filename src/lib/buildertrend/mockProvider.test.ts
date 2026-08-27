import { describe, expect, it } from 'vitest';
import { MOCK_JOBS } from './mockData';
import { mockOwnerDashboardProvider } from './mockProvider';
import { apiOwnerDashboardProvider } from './apiProvider';
import { filterJobs, roundPctParts } from './summarize';
import { formatCompactUsd, formatDelta, formatPct, formatRefreshedAt } from './format';

const now = new Date('2026-08-18T20:00:00.000Z');

describe('owner dashboard mock', () => {
  it('matches the Olsen overview KPIs on Open / All dates', async () => {
    const dash = await mockOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    expect(dash.source).toBe('mock');
    expect(dash.kpis.find((k) => k.id === 'active')?.display).toBe('24');
    expect(dash.kpis.find((k) => k.id === 'wip')?.display).toBe('$18.74M');
    expect(dash.kpis.find((k) => k.id === 'revenue')?.display).toBe('$15.11M');
    expect(dash.kpis.find((k) => k.id === 'change-order')?.display).toBe('$964K');
    expect(dash.kpis.find((k) => k.id === 'change-order')?.detail).toBe('33.0% CO profit');
    expect(dash.kpis.find((k) => k.id === 'pipeline')?.display).toBe('$22.65M');
    expect(dash.kpis.find((k) => k.id === 'rolling')?.display).toBe('$42.82M');
    expect(dash.kpis.find((k) => k.id === 'margin')?.detail).toContain('15.0% target vs 18.6% projected');
    expect(dash.kpis.find((k) => k.id === 'margin')?.delta).toBeCloseTo(3.6, 5);
    expect(dash.totals.jobCount).toBe(24);
    expect(dash.totals.totalWip).toBe(18_740_000);
    expect(dash.totals.totalRevenueToDate).toBe(15_110_000);
    expect(dash.totals.totalChangeOrderRevenue).toBe(964_000);
    expect(dash.totals.changeOrderProfitPct).toBe(33);
  });

  it('splits the 24 open jobs into Design/Permitting vs Construction', async () => {
    const dash = await mockOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    const byPhase = Object.fromEntries(dash.phases.map((p) => [p.phase, p]));
    expect(dash.phases).toHaveLength(2);
    expect(byPhase.design).toMatchObject({ count: 10, label: 'Design / Permitting' });
    expect(byPhase.construction).toMatchObject({ count: 14, label: 'Construction' });
    expect(byPhase.design!.count + byPhase.construction!.count).toBe(24);
    expect(dash.pmScorecard.map((row) => row.pm)).toEqual([
      'Adam Horseman',
      'James Manford',
      'Monique Lumley',
      'Paul Dimeglio',
      'Richard Linck',
    ]);
  });

  it('filters Open vs Closed vs Warranty', () => {
    expect(filterJobs(MOCK_JOBS, { status: 'open', dateRange: 'all' })).toHaveLength(24);
    expect(filterJobs(MOCK_JOBS, { status: 'closed', dateRange: 'all' }).length).toBeGreaterThanOrEqual(4);
    expect(filterJobs(MOCK_JOBS, { status: 'warranty', dateRange: 'all' }).length).toBeGreaterThanOrEqual(2);
    expect(filterJobs(MOCK_JOBS, { status: 'closed', dateRange: 'all' }).every((j) => j.status === 'closed')).toBe(true);
  });

  it('narrows Open jobs for last 30 days', () => {
    const recent = filterJobs(MOCK_JOBS, { status: 'open', dateRange: '30d' }, now);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThan(24);
    expect(recent.every((job) => job.name === 'Ellis' || job.name === 'Turner')).toBe(true);
  });
});

describe('dashboard formatters', () => {
  it('compacts millions to two decimals', () => {
    expect(formatCompactUsd(18_740_000)).toBe('$18.74M');
    expect(formatCompactUsd(42_820_000)).toBe('$42.82M');
    expect(formatPct(18.6)).toBe('18.6%');
    expect(formatDelta(9.1, 'pct')).toBe('↑ 9.1%');
    expect(formatDelta(3.6, 'pts')).toBe('↑ 3.6 pts');
  });

  it('renders refreshed-at copy', () => {
    const stamp = new Date(now.getTime() - 2 * 60_000).toISOString();
    expect(formatRefreshedAt(stamp, now)).toMatch(/^Updated 2m ago · /);
  });

  it('rounds phase percents to 100', () => {
    expect(roundPctParts([11, 6, 4, 3])).toEqual([46, 25, 17, 12]);
  });
});

describe('buildertrend api stub', () => {
  it('refuses to scrape and throws until a partner client exists', async () => {
    await expect(apiOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' })).rejects.toThrow(
      /Buildertrend API is not configured/,
    );
  });
});
