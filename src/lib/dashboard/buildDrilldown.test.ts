import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '../buildertrend/types';
import { pipedriveStageKey } from '../pipedrive/stageMap';
import { buildLiveDrilldown, selectionStatusLabel } from './buildDrilldown';
import { filterDrillRows, resolveDrilldown } from './resolveDrilldown';

const sampleProjects: ProjectSnapshot[] = [
  {
    id: 'bt-1',
    name: 'Bennett',
    pm: 'James Manford',
    pendingSelections: 1,
    pastDueTasks: 0,
    dailyLogsRecentDone: 4,
    dailyLogsRecentExpected: 16,
    dailyLogsTotal: 40,
    dailyLogLifetimePct: 50,
    contractPrice: 1_000_000,
    revenueToDate: 400_000,
    wip: 1_000_000,
    pctComplete: 40,
    estCloseDate: '2026-12-01',
    phase: 'construction',
    slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 },
    totalSlip: 0,
    notes: '',
  },
  {
    id: 'bt-2',
    name: 'Ahigian',
    pm: 'Richard Linck',
    pendingSelections: 2,
    pastDueTasks: 1,
    dailyLogsRecentDone: 8,
    dailyLogsRecentExpected: 16,
    dailyLogsTotal: 80,
    dailyLogLifetimePct: 60,
    contractPrice: 2_000_000,
    revenueToDate: 1_500_000,
    wip: 2_000_000,
    pctComplete: 75,
    estCloseDate: '2026-10-01',
    phase: 'construction',
    slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 },
    totalSlip: 0,
    notes: '',
  },
];

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
      { type: 'pipeline-stage', stageId: pipedriveStageKey(1), label: 'First Contact' },
      [],
      {
        generatedAt: '2026-08-22T12:00:00.000Z',
        dealsByStage: {
          [pipedriveStageKey(1)]: [
            {
              id: 1,
              title: 'Test Deal',
              value: 1_000_000,
              stageName: 'First Contact',
              probabilityPct: 10,
              weightedValue: 100_000,
              expectedCloseDate: '',
              status: 'open',
            },
          ],
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

  it('shows WIP as revised contract per project', () => {
    const resolved = resolveDrilldown({ type: 'wip-breakdown' }, sampleProjects, null);
    expect(resolved.subtitle).toContain('revised contract values');
    expect(resolved.rows).toHaveLength(2);
    expect(resolved.rows[0]?.wip).toBe(2_000_000);
    expect(resolved.columns.find((c) => c.key === 'wip')?.label).toBe('Revised contract');
    expect(resolved.columns.find((c) => c.key === 'wip')?.sum).toBe('usd');
  });

  it('shows revenue breakdown with invoiced amounts', () => {
    const resolved = resolveDrilldown({ type: 'revenue-breakdown' }, sampleProjects, null);
    expect(resolved.subtitle).toContain('amount invoiced');
    expect(resolved.rows[0]?.revenue).toBe(1_500_000);
    expect(resolved.rows.reduce((s, r) => s + Number(r.revenue), 0)).toBe(1_900_000);
  });

  it('lists PM daily logs by project and who logged', () => {
    const resolved = resolveDrilldown(
      { type: 'pm-logs', pm: 'James Manford' },
      sampleProjects,
      {
        generatedAt: '2026-08-22T12:00:00.000Z',
        dealsByStage: {},
        selectionsByJobId: {},
        pastDueByJobId: {},
        logsByJobId: {
          '1': [
            { jobId: 1, jobName: 'Bennett', userName: 'James Manford', dailyLogCount: 4, lastLogDate: '2026-08-20' },
            { jobId: 1, jobName: 'Bennett', userName: 'Rob Dougherty', dailyLogCount: 2, lastLogDate: '2026-08-18' },
          ],
          '2': [{ jobId: 2, jobName: 'Ahigian', userName: 'Richard Linck', dailyLogCount: 8, lastLogDate: '2026-08-21' }],
        },
      },
    );
    expect(resolved.rows).toHaveLength(2);
    expect(resolved.rows.every((r) => r.jobName === 'Bennett')).toBe(true);
    expect(resolved.rows.map((r) => r.userName)).toEqual(['James Manford', 'Rob Dougherty']);
    expect(resolved.columns.map((c) => c.key)).toContain('pm');
  });

  it('filters detail rows by search query', () => {
    const columns = [
      { key: 'name', label: 'Project' },
      { key: 'pm', label: 'PM' },
      { key: 'wip', label: 'WIP', sum: 'usd' as const },
    ];
    const rows = [
      { name: 'Bennett', pm: 'James Manford', wip: 600_000 },
      { name: 'Ahigian', pm: 'Richard Linck', wip: 500_000 },
    ];
    expect(filterDrillRows(columns, rows, 'bennett')).toHaveLength(1);
    expect(filterDrillRows(columns, rows, 'LINCK')).toHaveLength(1);
    expect(filterDrillRows(columns, rows, '600,000')).toHaveLength(1);
    expect(filterDrillRows(columns, rows, '   ')).toHaveLength(2);
    expect(filterDrillRows(columns, rows, 'zzzz')).toHaveLength(0);
  });
});
