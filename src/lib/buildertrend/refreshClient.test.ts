import { describe, expect, it } from 'vitest';
import { mergeCorePullWithPrior, storeLivePull, type BuildertrendLivePull } from './refreshClient';
import { estimatePullBytes, slimPullForStorage } from './slimLivePull';

describe('slimPullForStorage', () => {
  it('keeps past-due tasks only and drops schedule gantt blobs', () => {
    const pull: BuildertrendLivePull = {
      pulledAt: '2026-09-01T12:00:00.000Z',
      authMethod: 'cookie',
      enrichment: 'full',
      reports: {
        wip: [{ jobID: 1 }],
        tasks: {
          tasks: [
            { taskId: 1, status: 0, endDate: '2020-01-01', title: 'Past due' },
            { taskId: 2, status: 0, endDate: '2030-01-01', title: 'Future' },
          ],
        },
        scheduleByJob: { '1': { siteWork: { title: 'Huge gantt blob' } } },
      },
    };
    const slim = slimPullForStorage(pull, { now: new Date('2026-09-01T12:00:00.000Z') });
    expect(slim.reports.wip).toEqual([{ jobID: 1 }]);
    expect((slim.reports.tasks as { tasks: { taskId: number }[] }).tasks).toHaveLength(1);
    expect(slim.reports.scheduleByJob).toBeUndefined();
    expect(estimatePullBytes(slim)).toBeLessThan(estimatePullBytes(pull));
  });
});

describe('storeLivePull', () => {
  it('does not throw when localStorage quota is exceeded', () => {
    const storage = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });
    try {
      const ok = storeLivePull({
        pulledAt: '2026-09-01T12:00:00.000Z',
        authMethod: 'cookie',
        reports: { wip: [{ jobID: 1 }] },
      });
      expect(ok).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});

describe('mergeCorePullWithPrior', () => {
  it('keeps prior tasks and selections when the new pull is core-only', () => {
    const prior: BuildertrendLivePull = {
      pulledAt: '2026-01-01T00:00:00.000Z',
      authMethod: 'cookie',
      enrichment: 'full',
      reports: {
        tasks: { tasks: [{ taskId: 1, title: 'Old past due' }] },
        selectionsByJob: { '10': [{ id: 1, title: { title: 'Pending' } }] },
        baselineSlipByJob: { '10': { permit: 5, selections: 2, construction: 1 } },
      },
    };
    const next: BuildertrendLivePull = {
      pulledAt: '2026-01-02T00:00:00.000Z',
      authMethod: 'cookie',
      enrichment: 'core',
      reports: {
        wip: [{ jobID: 10 }],
        tasks: { tasks: [] },
        selectionsByJob: {},
      },
    };
    const merged = mergeCorePullWithPrior(next, prior);
    expect(merged.pulledAt).toBe(next.pulledAt);
    expect(merged.reports.wip).toEqual([{ jobID: 10 }]);
    expect(merged.reports.tasks).toEqual(prior.reports.tasks);
    expect(merged.reports.selectionsByJob).toEqual(prior.reports.selectionsByJob);
    expect(merged.reports.baselineSlipByJob).toEqual(prior.reports.baselineSlipByJob);
  });

  it('does not merge when enrichment is full', () => {
    const prior: BuildertrendLivePull = {
      pulledAt: '2026-01-01T00:00:00.000Z',
      authMethod: 'cookie',
      reports: { tasks: { tasks: [{ taskId: 1 }] } },
    };
    const next: BuildertrendLivePull = {
      pulledAt: '2026-01-02T00:00:00.000Z',
      authMethod: 'cookie',
      enrichment: 'full',
      reports: { tasks: { tasks: [] } },
    };
    expect(mergeCorePullWithPrior(next, prior).reports.tasks).toEqual({ tasks: [] });
  });
});