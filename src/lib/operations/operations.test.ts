import { beforeEach, describe, expect, it } from 'vitest';
import { LIVE_JOBS } from '../buildertrend/liveSnapshot';
import { OPS_STORAGE_KEY } from './types';
import { seedOpsFromLiveSnapshot } from './seed';
import { mapOpsSnapshotToDashboardInputs } from './mapToDashboard';
import { nativeOwnerDashboardProvider } from './nativeProvider';
import { buildOpsDrilldown } from './buildDrilldown';
import { clearOpsStore, ensureOpsSeeded, loadOpsSnapshot, wipeOpsStoreForTests } from './store';

describe('operations seed + map', () => {
  beforeEach(() => {
    wipeOpsStoreForTests();
  });

  it('seeds jobs from the live snapshot with child rows from OwnerJob counts', () => {
    const seeded = seedOpsFromLiveSnapshot();
    expect(seeded.jobs.length).toBe(LIVE_JOBS.length);
    expect(seeded.jobs[0]?.id).toBe(LIVE_JOBS[0]?.id);
    const expectedLogs = LIVE_JOBS.reduce((sum, j) => sum + Math.min(j.dailyLogsRecentDone ?? 0, 8), 0);
    const expectedTasks = LIVE_JOBS.reduce((sum, j) => sum + Math.min(j.pastDueTasks, 5), 0);
    const expectedSels = LIVE_JOBS.reduce((sum, j) => sum + Math.min(j.pendingSelections, 5), 0);
    expect(seeded.logs.length).toBe(expectedLogs);
    expect(seeded.tasks.length).toBe(expectedTasks);
    expect(seeded.selections.length).toBe(expectedSels);
  });

  it('maps store into OwnerDashboard summarize inputs', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const mapped = mapOpsSnapshotToDashboardInputs(seeded, new Date('2030-01-15T12:00:00Z'));
    expect(mapped.jobs.length).toBe(seeded.jobs.filter((j) => !j.archived).length);
    expect(mapped.pipeline.some((p) => (p.dealCount ?? 0) > 0)).toBe(true);
    expect(mapped.targetMarginPct).toBe(seeded.settings.targetMarginPct);
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
});
