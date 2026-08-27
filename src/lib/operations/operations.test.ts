import { beforeEach, describe, expect, it } from 'vitest';
import { LIVE_JOBS } from '../buildertrend/liveSnapshot';
import { LIVE_DRILLDOWN } from '../buildertrend/liveDrilldown';
import { OPS_STORAGE_KEY } from './types';
import { mapExternalDealStage, seedOpsFromLiveSnapshot } from './seed';
import { mapOpsSnapshotToDashboardInputs } from './mapToDashboard';
import { nativeOwnerDashboardProvider } from './nativeProvider';
import { buildOpsDrilldown } from './buildDrilldown';
import { clearOpsStore, ensureOpsSeeded, loadOpsSnapshot, wipeOpsStoreForTests } from './store';

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
    expect(seeded.tasks.length).toBe(drillCount(LIVE_DRILLDOWN.pastDueByJobId));
    expect(seeded.deals.length).toBe(drillCount(LIVE_DRILLDOWN.dealsByStage));
    expect(seeded.logs.length).toBeGreaterThanOrEqual(drillCount(LIVE_DRILLDOWN.logsByJobId));
    expect(seeded.scheduleItems?.length).toBe(drillCount(LIVE_DRILLDOWN.baselineSlipByJobId));
    expect(seeded.cashflow?.length).toBe(
      LIVE_JOBS.filter((j) => (j.revenueLast30d ?? 0) > 0).length,
    );
    expect(seeded.selections[0]?.title).not.toMatch(/^Pending selection \d+$/);
    expect(seeded.tasks[0]?.title).not.toMatch(/^Past-due task \d+$/);
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

  it('buildOpsDrilldown includes baseline slip from schedule items', () => {
    const seeded = seedOpsFromLiveSnapshot();
    const detail = buildOpsDrilldown(seeded);
    const first = seeded.scheduleItems?.[0];
    if (!first) return;
    const key = first.jobId.replace(/^bt-/, '');
    expect(detail.baselineSlipByJobId[key]?.length).toBeGreaterThan(0);
  });
});
