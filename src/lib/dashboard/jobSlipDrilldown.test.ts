import { describe, expect, it } from 'vitest';
import { drillCellClassName, resolveDrilldown } from './resolveDrilldown';
import type { DrillColumn } from './resolveDrilldown';

describe('job-slip drill-down', () => {
  const slipCol: DrillColumn = { key: 'durationSlip', label: 'Duration slip', tone: 'slip' };

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
});
