import { describe, expect, it } from 'vitest';
import { drillCellClassName, resolveDrilldown } from './resolveDrilldown';
import type { DrillColumn } from './resolveDrilldown';
import type { ProjectSnapshot } from '../buildertrend/types';

describe('job-slip drill-down', () => {
  const slipCol: DrillColumn = { key: 'durationSlip', label: 'Duration slip', tone: 'slip' };

  const ahigian: ProjectSnapshot = {
    id: 'bt-40497055',
    name: 'Ahigian - Habashi',
    pm: 'Adam Horseman',
    pendingSelections: 0,
    pastDueTasks: 0,
    dailyLogsRecentDone: null,
    dailyLogsRecentExpected: 16,
    dailyLogsTotal: 0,
    dailyLogLifetimePct: 0,
    contractPrice: 0,
    revenueToDate: 0,
    wip: 0,
    pctComplete: 0,
    estCloseDate: '2027-06-04',
    estFirstScheduleStart: '2024-09-01',
    estPermittingEnd: '2025-06-01',
    estFoundationStart: '2025-08-01',
    estClosingEnd: '2027-06-04',
    phase: 'construction',
    slip: { permit: 0, selections: 0, construction: 0 },
    totalSlip: 212,
    notes: '',
  };

  it('highlights positive duration slip red and negative green', () => {
    expect(drillCellClassName(slipCol, 12)).toBe('dash-slip-duration-pos');
    expect(drillCellClassName(slipCol, -10)).toBe('dash-slip-duration-neg');
    expect(drillCellClassName(slipCol, 0)).toBeUndefined();
  });

  it('sorts schedule slip rows by expected end date ascending', () => {
    const resolved = resolveDrilldown(
      { type: 'job-slip', jobId: 'bt-1', jobName: 'Test' },
      [],
      {
        generatedAt: '2026-08-22T12:00:00.000Z',
        dealsByStage: {},
        selectionsByJobId: {},
        pastDueByJobId: {},
        logsByJobId: {},
        baselineSlipByJobId: {
          '1': [
            {
              title: 'Later',
              endDateSlip: 50,
              durationSlip: 5,
              expectedEndDate: '2026-06-01',
              actualEndDate: '',
              completed: false,
            },
            {
              title: 'Earlier',
              endDateSlip: 10,
              durationSlip: -2,
              expectedEndDate: '2026-03-01',
              actualEndDate: '',
              completed: false,
            },
          ],
        },
      },
    );
    expect(resolved.rows.map((r) => r.title)).toEqual(['Earlier', 'Later']);
  });

  it('includes estimated time metrics from the project schedule milestones', () => {
    const resolved = resolveDrilldown(
      { type: 'job-slip', jobId: 'bt-40497055', jobName: 'Ahigian - Habashi' },
      [ahigian],
      {
        generatedAt: '2026-08-22T12:00:00.000Z',
        dealsByStage: {},
        selectionsByJobId: {},
        pastDueByJobId: {},
        logsByJobId: {},
        baselineSlipByJobId: { '40497055': [] },
      },
    );
    expect(resolved.metrics?.map((m) => m.label)).toEqual([
      'Est. contract to close',
      'Est. permit to close',
      'Est. slab pour to close',
    ]);
    expect(resolved.metrics?.every((m) => m.days > 0)).toBe(true);
  });
});
