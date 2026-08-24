import { describe, expect, it } from 'vitest';
import {
  INCOMPLETE_TASKS_FILTERS,
  isSiteWorkScheduleTitle,
  mergeTasksListResponses,
  selectionsGridBody,
  SELECTIONS_GRID_SELECTED_TAB,
  siteWorkStatusFromGantt,
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
