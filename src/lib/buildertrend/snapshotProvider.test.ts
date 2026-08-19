import { describe, expect, it } from 'vitest';
import { LIVE_JOBS } from './liveSnapshot';
import { snapshotOwnerDashboardProvider } from './snapshotProvider';
import { filterJobs } from './summarize';

const now = new Date('2026-08-18T20:00:00.000Z');

describe('owner dashboard Buildertrend snapshot', () => {
  it('matches the 19 Aug 2026 WIP and lead totals on Open / All dates', async () => {
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    expect(dash.source).toBe('buildertrend');
    expect(dash.kpis.find((k) => k.id === 'active')?.display).toBe('24');
    expect(dash.kpis.find((k) => k.id === 'wip')?.display).toBe('$4.51M');
    expect(dash.kpis.find((k) => k.id === 'revenue')?.display).toBe('$12.21M');
    expect(dash.kpis.find((k) => k.id === 'contract')?.display).toBe('$14.99M');
    expect(dash.kpis.find((k) => k.id === 'pipeline')?.display).toBe('$4.30M');
    expect(dash.kpis.find((k) => k.id === 'rolling')?.display).toBe('$11.27M');
    expect(dash.kpis.find((k) => k.id === 'margin')?.detail).toContain('15.0% target vs 9.3% projected');
    expect(dash.kpis.find((k) => k.id === 'active')?.delta).toBe(0);
    expect(dash.totals.jobCount).toBe(24);
    expect(dash.totals.totalWip).toBeCloseTo(4_505_574.95, 2);
    expect(dash.totals.totalRevenueToDate).toBeCloseTo(12_212_040.71, 2);
    expect(dash.totals.totalContract).toBeCloseTo(14_985_659.7, 2);
  });

  it('splits open jobs by inferred phase and lists PMs from Buildertrend', async () => {
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    const byPhase = Object.fromEntries(dash.phases.map((p) => [p.phase, p]));
    expect(byPhase.construction).toMatchObject({ count: 10, pct: 42 });
    expect(byPhase.permitting).toMatchObject({ count: 6, pct: 25 });
    expect(byPhase.design).toMatchObject({ count: 4, pct: 17 });
    expect(byPhase.closeout).toMatchObject({ count: 4, pct: 16 });
    expect(dash.pmScorecard.map((row) => row.pm)).toEqual([
      'Adam Horseman',
      'James Manford',
      'Paul Dimeglio',
      'Richard Linck',
      'Unassigned',
    ]);
  });

  it('has no Closed or Warranty jobs in the captured views', () => {
    expect(filterJobs(LIVE_JOBS, { status: 'open', dateRange: 'all' })).toHaveLength(24);
    expect(filterJobs(LIVE_JOBS, { status: 'closed', dateRange: 'all' })).toHaveLength(0);
    expect(filterJobs(LIVE_JOBS, { status: 'warranty', dateRange: 'all' })).toHaveLength(0);
  });

  it('narrows Open jobs for last 30 days to Allie Job', () => {
    const recent = filterJobs(LIVE_JOBS, { status: 'open', dateRange: '30d' }, now);
    expect(recent.map((job) => job.name)).toEqual(['Allie Job']);
  });
});
