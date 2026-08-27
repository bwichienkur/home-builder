import { describe, expect, it } from 'vitest';
import { mergeCorePullWithPrior, type BuildertrendLivePull } from './refreshClient';

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
