import { beforeEach, describe, expect, it } from 'vitest';
import { LIVE_JOBS, LIVE_PIPEDRIVE_AT, LIVE_SNAPSHOT_AT } from '../buildertrend/liveSnapshot';
import { LIVE_DRILLDOWN } from '../buildertrend/liveDrilldown';
import { OPS_STORAGE_KEY } from './types';
import { mapExternalDealStage, seedOpsFromLiveSnapshot } from './seed';
import { mapOpsSnapshotToDashboardInputs } from './mapToDashboard';
import { nativeOwnerDashboardProvider } from './nativeProvider';
import { buildOpsDrilldown } from './buildDrilldown';
import { clearOpsStore, ensureOpsSeeded, loadOpsSnapshot, wipeOpsStoreForTests } from './store';
import { LIVE_OPS_IMPORT } from './liveOpsImport';
import { buildOpsBtImport } from './buildOpsBtImport';

function drillCount(map: Record<string, unknown[]>) {
  return Object.values(map).reduce((sum, rows) => sum + rows.length, 0);
}

describe('operations seed + map', () => {
  beforeEach(() => {
    wipeOpsStoreForTests();
  });

  it('seeds full LIVE_DRILLDOWN rows (not synthetic capped counts)', () => {
    const seeded = seedOpsFromLiveSnapshot();
    expect(seeded.jobs.length).toBe(LIVE_JOBS.length);
    expect(seeded.jobs[0]?.id).toBe(LIVE_JOBS[0]?.id);
    expect(seeded.selections.length).toBe(drillCount(LIVE_DRILLDOWN.selectionsByJobId));
    // Ops-only import prefers all incomplete BT tasks when LIVE_OPS_IMPORT is present.
    expect(seeded.tasks.length).toBeGreaterThan(drillCount(LIVE_DRILLDOWN.pastDueByJobId));
    expect(seeded.tasks.every((t) => t.source === 'bt-incomplete' || t.source === 'bt-past-due')).toBe(true);
    expect(seeded.deals.length).toBe(drillCount(LIVE_DRILLDOWN.dealsByStage));
    expect(seeded.logs.length).toBeGreaterThanOrEqual(drillCount(LIVE_DRILLDOWN.logsByJobId));
    expect(seeded.scheduleItems?.length).toBe(drillCount(LIVE_DRILLDOWN.baselineSlipByJobId));
    expect(seeded.cashflow?.length).toBe(
      LIVE_JOBS.filter((j) => (j.revenueLast30d ?? 0) > 0).length,
    );
    expect(seeded.selections[0]?.title).not.toMatch(/^Pending selection \d+$/);
    expect(seeded.tasks[0]?.title).not.toMatch(/^Past-due task \d+$/);
  });

  it('maps past-due counts from incomplete Ops tasks to match LIVE_JOBS', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const pullDay = (LIVE_SNAPSHOT_AT || LIVE_DRILLDOWN.generatedAt || '2026-08-27').slice(0, 10);
    for (const live of LIVE_JOBS) {
      const pastDue = seeded.tasks.filter(
        (t) => t.jobId === live.id && t.status === 'incomplete' && t.dueDate && t.dueDate < pullDay,
      ).length;
      expect(pastDue).toBe(live.pastDueTasks);
    }
  });

  it('maps Pipedrive stage labels into OpsDealStage buckets', () => {
    expect(mapExternalDealStage('pd-1', 'First Contact')).toBe('lead');
    expect(mapExternalDealStage('pd-5', 'Pricing Proposal')).toBe('proposal');
    expect(mapExternalDealStage('pd-6', 'Contract Sent')).toBe('contract');
  });

  it('maps store into OwnerDashboard summarize inputs', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const mapped = mapOpsSnapshotToDashboardInputs(seeded, new Date('2030-01-15T12:00:00Z'));
    expect(mapped.jobs.length).toBe(seeded.jobs.filter((j) => !j.archived).length);
    if (LIVE_PIPEDRIVE_AT) {
      expect(mapped.pipeline.some((p) => (p.dealCount ?? 0) > 0)).toBe(true);
    }
    expect(mapped.targetMarginPct).toBe(seeded.settings.targetMarginPct);
    expect(mapped.timeMetrics.length).toBe(3);
    expect(mapped.timeMetrics.map((m) => m.id)).toEqual(['contract-close', 'permit-close', 'slab-close']);
    expect(mapped.salesPerformance.map((b) => b.id)).toEqual(['backlog', 'closings', 'signing']);
  });

  it('preserves lifetime daily log totals from LIVE_JOBS on map', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const mapped = mapOpsSnapshotToDashboardInputs(seeded, new Date('2030-01-15T12:00:00Z'));
    for (const live of LIVE_JOBS) {
      const mappedJob = mapped.jobs.find((j) => j.id === live.id);
      expect(mappedJob?.dailyLogsTotal).toBe(live.dailyLogsTotal ?? 0);
    }
    expect(seeded.settings.timeMetrics?.length).toBe(3);
  });

  it('ensureOpsSeeded persists once', () => {
    const first = ensureOpsSeeded();
    expect(first.jobs.length).toBeGreaterThan(0);
    expect(loadOpsSnapshot().jobs.length).toBe(first.jobs.length);
    const second = ensureOpsSeeded();
    expect(second.jobs[0]?.id).toBe(first.jobs[0]?.id);
    void OPS_STORAGE_KEY;
  });

  it('clearOpsStore leaves an empty persisted snapshot', () => {
    ensureOpsSeeded();
    clearOpsStore();
    const empty = loadOpsSnapshot();
    expect(empty.jobs).toEqual([]);
    expect(ensureOpsSeeded().jobs).toEqual([]);
  });

  it('native provider returns source native', async () => {
    const dash = await nativeOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    expect(dash.source).toBe('native');
    expect(dash.projects.length).toBeGreaterThan(0);
  });

  it('buildOpsDrilldown keys selections by numeric job id', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const detail = buildOpsDrilldown(seeded);
    const firstSel = seeded.selections[0];
    if (!firstSel) return;
    const key = firstSel.jobId.replace(/^bt-/, '');
    expect(detail.selectionsByJobId[key]?.length).toBeGreaterThan(0);
  });

  it('buildOpsDrilldown includes baseline slip from schedule items', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const detail = buildOpsDrilldown(seeded);
    const first = seeded.scheduleItems?.[0];
    if (!first) return;
    const key = first.jobId.replace(/^bt-/, '');
    expect(detail.baselineSlipByJobId[key]?.length).toBeGreaterThan(0);
  });

  it('LIVE_OPS_IMPORT carries all incomplete tasks without changing Home past-due drilldown', () => {
    expect(LIVE_OPS_IMPORT.meta.incompleteTaskCount).toBeGreaterThan(LIVE_OPS_IMPORT.meta.pastDueTaskCount);
    expect(LIVE_OPS_IMPORT.meta.logBodiesUnavailable).toBe(true);
    expect(drillCount(LIVE_DRILLDOWN.pastDueByJobId)).toBe(LIVE_OPS_IMPORT.meta.pastDueTaskCount);
  });

  it('buildOpsBtImport keeps incomplete ≫ past-due', () => {
    const built = buildOpsBtImport({
      reports: {
        tasks: {
          tasks: [
            { taskId: 1, jobId: 10, status: 0, title: 'Past', endDate: '2020-01-01', isDeleted: false, assignments: [] },
            { taskId: 2, jobId: 10, status: 0, title: 'Future', endDate: '2099-01-01', isDeleted: false, assignments: [] },
            { taskId: 3, jobId: 10, status: 0, title: 'No due', isDeleted: false, assignments: [] },
            { taskId: 4, jobId: 10, status: 1, title: 'Done', endDate: '2020-01-01', isDeleted: false, assignments: [] },
          ],
        },
        userDailyLogsRecent: {
          rowData: [{ userName: 'Ada', jobID: 10, jobName: 'Job', dailyLogCount: 2, lastLogDate: '2026-01-10' }],
        },
      },
      pulledAt: '2026-08-27T12:00:00.000Z',
      now: new Date('2026-08-27T12:00:00.000Z'),
    });
    expect(built.meta.incompleteTaskCount).toBe(3);
    expect(built.meta.pastDueTaskCount).toBe(1);
    expect(built.logsByJobId['10']).toHaveLength(1);
  });
});
