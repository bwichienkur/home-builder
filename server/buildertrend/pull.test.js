import { describe, expect, it } from 'vitest';
import {
  compactBaselineSlipRow,
  contractPriceFromJobInfo,
  filterBaselineRowsToTemplate,
  INCOMPLETE_TASKS_FILTERS,
  isSiteWorkScheduleTitle,
  mergeTasksListResponses,
  normalizeScheduleTitle,
  pickCurrentScheduleItem,
  scheduleMilestonesFromGantt,
  selectionsGridBody,
  SELECTIONS_GRID_SELECTED_TAB,
  siteWorkStatusFromGantt,
  slipBucketsFromBaselineItems,
  TASKS_LIST_ROW_CAP,
} from './pull.js';

describe('mergeTasksListResponses', () => {
  it('dedupes tasks by taskId across per-job pulls', () => {
    const merged = mergeTasksListResponses([
      {
        jobId: 1,
        data: {
          tasks: [{ taskId: 10, jobId: 1, title: 'A' }],
          jobs: [{ jobId: 1, name: 'One' }],
        },
      },
      {
        jobId: 2,
        data: {
          tasks: [
            { taskId: 20, jobId: 2, title: 'B' },
            { taskId: 10, jobId: 1, title: 'A duplicate' },
          ],
          jobs: [{ jobId: 2, name: 'Two' }],
        },
      },
    ]);

    expect(merged.tasks).toHaveLength(2);
    expect(merged.tasks.find((task) => task.taskId === 10)?.title).toBe('A');
    expect(merged.jobs).toHaveLength(2);
  });

  it('records jobs that hit the Tasks/list row cap', () => {
    const tasks = Array.from({ length: TASKS_LIST_ROW_CAP }, (_, index) => ({
      taskId: index + 1,
      jobId: 99,
      title: `Task ${index + 1}`,
    }));
    const merged = mergeTasksListResponses([{ jobId: 99, data: { tasks, jobs: [] } }]);
    expect(merged.meta.cappedJobIds).toEqual([99]);
  });

  it('keeps only past-due incomplete tasks when pastDueOnly is set', () => {
    const merged = mergeTasksListResponses(
      [
        {
          jobId: 1,
          data: {
            tasks: [
              { taskId: 1, status: 0, isDeleted: false, endDate: '2020-01-01', title: 'Past due' },
              { taskId: 2, status: 0, isDeleted: false, endDate: '2099-01-01', title: 'Future' },
            ],
          },
        },
      ],
      { pastDueOnly: true, now: new Date('2026-01-01') },
    );
    expect(merged.tasks).toHaveLength(1);
    expect(merged.tasks[0].title).toBe('Past due');
    expect(merged.jobs).toBeUndefined();
  });
});

describe('INCOMPLETE_TASKS_FILTERS', () => {
  it('matches PM Tasks “Not completed” filter', () => {
    expect(INCOMPLETE_TASKS_FILTERS.filters[0].groups[0].filters[0]).toEqual({
      field: 'status',
      operator: 24,
      value: '[0]',
    });
  });
});

describe('selectionsGridBody', () => {
  it('targets the Selections list grid for one job', () => {
    const body = selectionsGridBody(40497055);
    expect(body.jobIds).toEqual([40497055]);
    expect(body.filters).toBe('{}');
    expect(body.pagingData.pageSize).toBe(500);
  });

  it('uses the list tab query param constant', () => {
    expect(SELECTIONS_GRID_SELECTED_TAB).toBe(1);
  });
});

describe('Site Work schedule helpers', () => {
  it('recognizes Site Work titles', () => {
    expect(isSiteWorkScheduleTitle('Site Work')).toBe(true);
    expect(isSiteWorkScheduleTitle('SITEWORK')).toBe(true);
    expect(isSiteWorkScheduleTitle('Site Work Checklist')).toBe(false);
  });

  it('marks Site Work started when complete or percent > 0', () => {
    const byJob = siteWorkStatusFromGantt({
      data: {
        items: [
          { jobId: 1, title: 'Site Work', isComplete: false, percentComplete: 0, startDate: '2026-10-01' },
          { jobId: 2, title: 'Site Work', isComplete: true, percentComplete: 0, startDate: '2026-01-01' },
          { jobId: 3, title: 'Site Work', isComplete: false, percentComplete: 25, startDate: '2026-01-01' },
          { jobId: 4, title: 'Foundation', isComplete: true, percentComplete: 100 },
        ],
      },
    });
    expect(byJob['1']?.started).toBe(false);
    expect(byJob['2']?.started).toBe(true);
    expect(byJob['3']?.started).toBe(true);
    expect(byJob['4']).toBeUndefined();
  });
});

describe('scheduleMilestonesFromGantt', () => {
  it('extracts first item, Permitting end, Foundation start/started, Closing end', () => {
    const byJob = scheduleMilestonesFromGantt({
      data: {
        items: [
          { jobId: 10, title: 'Sale/Contract Deposit', startDate: '2025-01-01', endDate: '2025-01-01', percentComplete: 100, isComplete: true },
          { jobId: 10, title: 'Permitting', startDate: '2025-02-01', endDate: '2025-06-15', percentComplete: 100, isComplete: true },
          { jobId: 10, title: 'Site Work', startDate: '2025-06-16', endDate: '2025-06-20', percentComplete: 100, isComplete: true },
          { jobId: 10, title: 'Foundation', startDate: '2025-06-21', endDate: '2025-07-01', percentComplete: 100, isComplete: true },
          { jobId: 10, title: 'Closing', startDate: '2026-03-01', endDate: '2026-03-05', percentComplete: 100, isComplete: true },
          { jobId: 11, title: 'Foundation', startDate: '2026-09-01', endDate: '2026-09-10', percentComplete: 0, isComplete: false },
          { jobId: 11, title: 'Site Work', startDate: '2026-08-01', endDate: '2026-08-05', percentComplete: 0, isComplete: false },
        ],
      },
    });
    expect(byJob['10']).toMatchObject({
      firstItemStartDate: '2025-01-01',
      siteWorkStarted: true,
      foundationStarted: true,
      permitting: { endDate: '2025-06-15' },
      foundation: { startDate: '2025-06-21' },
      closing: { endDate: '2026-03-05' },
    });
    expect(byJob['11']?.foundationStarted).toBe(false);
    expect(byJob['11']?.siteWorkStarted).toBe(false);
  });

  it('marks Foundation started if any Foundation item has progress', () => {
    const byJob = scheduleMilestonesFromGantt({
      data: {
        items: [
          { jobId: 1, title: 'Foundation', startDate: '2025-01-01', endDate: '2025-01-05', percentComplete: 0, isComplete: false },
          { jobId: 1, title: 'Foundation', startDate: '2025-02-01', endDate: '2025-02-10', percentComplete: 50, isComplete: false },
        ],
      },
    });
    expect(byJob['1']?.foundation?.startDate).toBe('2025-01-01');
    expect(byJob['1']?.foundationStarted).toBe(true);
  });

  it('sets currentItem to the in-progress schedule activity', () => {
    const byJob = scheduleMilestonesFromGantt(
      {
        data: {
          items: [
            { jobId: 1, title: 'Framing', startDate: '2026-07-01', endDate: '2026-07-20', percentComplete: 100, isComplete: true },
            { jobId: 1, title: 'Drywall', startDate: '2026-08-01', endDate: '2026-08-20', percentComplete: 0, isComplete: false },
            { jobId: 1, title: 'Paint', startDate: '2026-08-10', endDate: '2026-08-28', percentComplete: 0, isComplete: false },
            { jobId: 1, title: 'Closing', startDate: '2026-09-01', endDate: '2026-09-05', percentComplete: 0, isComplete: false },
          ],
        },
      },
      { now: new Date('2026-08-15T12:00:00Z') },
    );
    expect(byJob['1']?.currentItem).toMatchObject({ title: 'Paint', startDate: '2026-08-10', endDate: '2026-08-28' });
  });
});

describe('pickCurrentScheduleItem', () => {
  it('prefers the most recently started incomplete item still in window', () => {
    const pick = pickCurrentScheduleItem(
      [
        { title: 'Install Tile', startDate: '2026-08-10', endDate: '2026-09-04', isComplete: false, percentComplete: 0 },
        { title: 'Driveway', startDate: '2026-08-24', endDate: '2026-08-27', isComplete: false, percentComplete: 0 },
        { title: 'Closing', startDate: '2026-10-01', endDate: '2026-10-05', isComplete: false, percentComplete: 0 },
      ],
      new Date('2026-08-25T12:00:00Z'),
    );
    expect(pick?.title).toBe('Driveway');
  });

  it('falls back to the next upcoming incomplete item', () => {
    const pick = pickCurrentScheduleItem(
      [
        { title: 'Done', startDate: '2026-01-01', endDate: '2026-01-10', isComplete: true, percentComplete: 100 },
        { title: 'Next Up', startDate: '2026-09-01', endDate: '2026-09-10', isComplete: false, percentComplete: 0 },
      ],
      new Date('2026-08-25T12:00:00Z'),
    );
    expect(pick?.title).toBe('Next Up');
  });
});

describe('slipBucketsFromBaselineItems', () => {
  it('uses Permitting, max of selection phases 1-3, and Closing minus Site Work', () => {
    const slip = slipBucketsFromBaselineItems([
      { title: 'Permitting', endDateSlip: 28 },
      { title: 'Selection Phase 1 Due ', endDateSlip: 20 },
      { title: 'Selection Phase 2 Due', endDateSlip: 30 },
      { title: 'Selection Phase 3 Due', endDateSlip: 25 },
      { title: 'Selection Phase 4 Due', endDateSlip: 99 },
      { title: 'Site Work', endDateSlip: 100 },
      { title: 'Closing', endDateSlip: 130 },
    ]);
    expect(slip).toEqual({ permit: 28, selections: 30, construction: 30 });
  });
});

describe('filterBaselineRowsToTemplate', () => {
  it('keeps OCH MASTER titles and drops ad-hoc items, deduping by title', () => {
    const allow = new Set(['framing', 'site work', 'closing'].map(normalizeScheduleTitle));
    const filtered = filterBaselineRowsToTemplate(
      [
        { title: 'Framing', endDateSlip: 10, durationSlip: 2 },
        { title: 'Framing', endDateSlip: 25, durationSlip: 5 },
        { title: 'Site Work', endDateSlip: 0, durationSlip: 0 },
        { title: 'HVAC Rough', endDateSlip: 40, durationSlip: 3 },
        { title: 'Closing', endDateSlip: -2, durationSlip: 0 },
      ],
      allow,
    );
    expect(filtered.map((row) => row.title).sort()).toEqual(['Closing', 'Framing', 'Site Work']);
    expect(filtered.find((row) => row.title === 'Framing')?.endDateSlip).toBe(25);
    expect(compactBaselineSlipRow(filtered.find((row) => row.title === 'Framing')).durationSlip).toBe(5);
  });
});

describe('contractPriceFromJobInfo', () => {
  it('reads nested BT currency value objects', () => {
    expect(
      contractPriceFromJobInfo({
        data: { jobInfo: { contractPrice: { value: 1_204_751, currencyIdentifier: '$' } } },
      }),
    ).toBe(1_204_751);
    expect(contractPriceFromJobInfo({ data: { jobInfo: { contractPrice: { value: 0 } } } })).toBe(0);
  });
});
