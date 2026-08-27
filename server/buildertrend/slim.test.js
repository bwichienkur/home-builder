import { describe, expect, it } from 'vitest';
import { estimateJsonBytes, slimReportsForClient } from './slim.js';

describe('slimReportsForClient', () => {
  it('keeps only past-due incomplete tasks and strips bulky fields', () => {
    const slim = slimReportsForClient(
      {
        tasks: {
          tasks: [
            {
              taskId: 1,
              jobId: 10,
              title: 'Past due',
              status: 0,
              endDate: '2020-01-01',
              description: 'huge',
              linkedSchedule: { a: 1 },
              assignments: [{ name: 'Pat', email: 'pat@example.com' }],
            },
            {
              taskId: 2,
              jobId: 10,
              title: 'Future',
              status: 0,
              endDate: '2099-01-01',
            },
            {
              taskId: 3,
              jobId: 10,
              title: 'Done',
              status: 1,
              endDate: '2020-01-01',
            },
          ],
        },
        selectionsByJob: {
          10: [
            { id: 1, title: { title: 'Pending' }, status: { status: 0 }, category: 'Floor' },
            { id: 2, title: { title: 'Selected' }, status: { status: 2 } },
          ],
        },
      },
      { now: new Date('2026-08-27T12:00:00.000Z') },
    );

    expect(slim.tasks.tasks).toHaveLength(1);
    expect(slim.tasks.tasks[0]).toMatchObject({ taskId: 1, title: 'Past due' });
    expect(slim.tasks.tasks[0].description).toBeUndefined();
    expect(slim.selectionsByJob['10']).toHaveLength(1);
    expect(slim.selectionsByJob['10'][0].title).toEqual({ title: 'Pending' });
  });

  it('estimates JSON byte size', () => {
    expect(estimateJsonBytes({ a: 1 })).toBeGreaterThan(0);
  });
});
