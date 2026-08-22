import { describe, expect, it } from 'vitest';
import { INCOMPLETE_TASKS_FILTERS, mergeTasksListResponses, TASKS_LIST_ROW_CAP } from './pull.js';

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
