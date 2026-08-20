import { describe, expect, it } from 'vitest';
import { LIVE_JOBS, LIVE_SNAPSHOT_AT } from './liveSnapshot';
import { snapshotOwnerDashboardProvider } from './snapshotProvider';
import { filterJobs } from './summarize';

const snapshotNow = new Date(LIVE_SNAPSHOT_AT);

describe('owner dashboard Buildertrend snapshot', () => {
  it('summarizes baked live-pull jobs on Open / All dates', async () => {
    const openJobs = filterJobs(LIVE_JOBS, { status: 'open', dateRange: 'all' }, snapshotNow);
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });

    expect(dash.source).toBe('buildertrend');
    expect(dash.refreshedAt).toBe(LIVE_SNAPSHOT_AT);
    expect(dash.totals.jobCount).toBe(openJobs.length);
    expect(dash.kpis.find((k) => k.id === 'active')?.value).toBe(openJobs.length);
    expect(dash.totals.pastDueTasks).toBe(openJobs.reduce((sum, job) => sum + job.pastDueTasks, 0));
    expect(dash.totals.pendingSelections).toBe(openJobs.reduce((sum, job) => sum + job.pendingSelections, 0));
    expect(dash.totals.pastDueTasks).toBeGreaterThan(0);
    expect(dash.totals.pendingSelections).toBeGreaterThan(0);
    // Lead Opportunities: confidence × estimatedRevenueMin
    expect(dash.kpis.find((k) => k.id === 'pipeline')?.value).toBeGreaterThan(0);
    expect(dash.kpis.find((k) => k.id === 'active')?.delta).toBe(0);
  });

  it('splits open jobs by phase and lists PMs from Buildertrend', async () => {
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    const openJobs = filterJobs(LIVE_JOBS, { status: 'open', dateRange: 'all' }, snapshotNow);
    const phaseSum = dash.phases.reduce((sum, slice) => sum + slice.count, 0);

    expect(phaseSum).toBe(openJobs.length);
    expect(dash.pmScorecard.length).toBeGreaterThan(0);
    expect(dash.pmScorecard.every((row) => row.projects > 0)).toBe(true);
  });

  it('has no Closed or Warranty jobs in the captured views', () => {
    const openJobs = filterJobs(LIVE_JOBS, { status: 'open', dateRange: 'all' }, snapshotNow);
    expect(openJobs.length).toBeGreaterThan(0);
    expect(filterJobs(LIVE_JOBS, { status: 'closed', dateRange: 'all' }, snapshotNow)).toHaveLength(0);
    expect(filterJobs(LIVE_JOBS, { status: 'warranty', dateRange: 'all' }, snapshotNow)).toHaveLength(0);
  });

  it('narrows Open jobs for last 30 days from openedAt', () => {
    const recent = filterJobs(LIVE_JOBS, { status: 'open', dateRange: '30d' }, snapshotNow);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.every((job) => job.name.length > 0)).toBe(true);
  });
});
