import { describe, expect, it } from 'vitest';
import { buildLiveDrilldown, selectionStatusLabel } from './buildDrilldown';
import { resolveDrilldown } from './resolveDrilldown';

describe('dashboard drilldown', () => {
  it('labels selection statuses', () => {
    expect(selectionStatusLabel({ status: -1 })).toBe('Unreleased');
    expect(selectionStatusLabel({ status: 2 })).toBe('Selected');
    expect(selectionStatusLabel({ status: 3, maxSelected: -999 })).toBe('Completed');
    expect(selectionStatusLabel({ status: 0, choiceCount: 0 })).toBe('Pending: No Choices');
  });

  it('builds pending selections and past-due task lists', () => {
    const detail = buildLiveDrilldown({
      buildertrend: {
        pulledAt: '2026-08-22T12:00:00.000Z',
        reports: {
          jobs: [{ jobID: 1, jobName: 'Bennett', jobStatus: 'Open' }],
          selectionsByJob: {
            '1': [
              { id: 10, title: { title: 'Windows' }, status: { status: -1 }, category: 'Phase 1', location: 'ARB' },
              { id: 11, title: { title: 'Done' }, status: { status: 3, maxSelected: 1 } },
            ],
          },
          tasks: {
            tasks: [
              { taskId: 1, jobId: 1, title: 'Late', status: 0, endDate: '2026-08-01T00:00:00', assignments: [] },
              { taskId: 2, jobId: 1, title: 'Future', status: 0, endDate: '2026-09-01T00:00:00', assignments: [] },
            ],
          },
          userDailyLogsRecent: {
            rowData: [{ jobID: 1, jobName: 'Bennett', userName: 'James', dailyLogCount: 4, lastLogDate: '2026-08-20' }],
          },
        },
      },
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(detail.selectionsByJobId['1']).toHaveLength(1);
    expect(detail.selectionsByJobId['1']![0]?.title).toBe('Windows');
    expect(detail.pastDueByJobId['1']).toHaveLength(1);
    expect(detail.logsByJobId['1']).toHaveLength(1);
  });

  it('resolves pipeline stage drilldown rows', () => {
    const resolved = resolveDrilldown(
      { type: 'pipeline-stage', stageId: 'lead', label: 'Lead' },
      [],
      {
        generatedAt: '2026-08-22T12:00:00.000Z',
        dealsByStage: {
          lead: [
            {
              id: 1,
              title: 'Test Deal',
              value: 1_000_000,
              stageName: 'Qualified',
              probabilityPct: 25,
              weightedValue: 250_000,
              expectedCloseDate: '',
              status: 'open',
            },
          ],
          proposal: [],
          'pre-contract': [],
          contract: [],
          closed: [],
        },
        selectionsByJobId: {},
        pastDueByJobId: {},
        logsByJobId: {},
      },
    );
    expect(resolved.rows).toHaveLength(1);
    expect(resolved.rows[0]?.title).toBe('Test Deal');
    expect(resolved.rows[0]?.value).toBe(1_000_000);
    expect(resolved.columns.find((c) => c.key === 'value')?.sum).toBe('usd');
  });
});
