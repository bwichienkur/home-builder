import { describe, expect, it } from 'vitest';
import { summarizeOwnerDashboard } from './summarize';
import type { OwnerJob } from './types';

const baseJob = (overrides: Partial<OwnerJob>): OwnerJob => ({
  id: 'x',
  name: 'Job',
  pm: 'Adam Horseman',
  status: 'open',
  phase: 'construction',
  pendingSelections: 0,
  pastDueTasks: 0,
  contractPrice: 100000,
  revenueToDate: 10000,
  wip: 50000,
  estCloseDate: '2026-12-01',
  openedAt: '2026-01-01',
  slip: { permit: 0, selections: 0, construction: 0 },
  notes: '10 daily logs',
  dailyLogsTotal: 10,
  dailyLogsRecentDone: 4,
  ...overrides,
});

describe('summarizeOwnerDashboard PM scorecard', () => {
  it('always counts OPEN projects even when status filter is closed', () => {
    const dash = summarizeOwnerDashboard({
      source: 'buildertrend',
      refreshedAt: '2026-08-24T00:00:00.000Z',
      filters: { status: 'closed', dateRange: 'all' },
      jobs: [
        baseJob({ id: '1', name: 'Open A', status: 'open', pm: 'Adam Horseman', foundationStarted: true }),
        baseJob({ id: '2', name: 'Open B', status: 'open', pm: 'Adam Horseman', foundationStarted: false }),
        baseJob({ id: '3', name: 'Closed C', status: 'closed', pm: 'Adam Horseman', foundationStarted: true }),
      ],
      pipeline: [],
      salesPerformance: [],
      timeMetrics: [],
      targetMarginPct: 15,
      projectedMarginPct: 18,
      rollingRevenue12Mo: 0,
      now: new Date('2026-08-24T12:00:00'),
    });

    expect(dash.totals.jobCount).toBe(1); // closed filter
    expect(dash.pmScorecard).toHaveLength(1);
    expect(dash.pmScorecard[0]).toMatchObject({
      pm: 'Adam Horseman',
      projects: 2,
      dailyLogsRecentExpected: 16, // only the foundation-started open job
    });
  });

  it('only expects daily logs on open jobs where Foundation has started', () => {
    const dash = summarizeOwnerDashboard({
      source: 'buildertrend',
      refreshedAt: '2026-08-24T00:00:00.000Z',
      filters: { status: 'open', dateRange: 'all' },
      jobs: [
        baseJob({
          id: '1',
          name: 'Needs Logs',
          pm: 'Adam Horseman',
          foundationStarted: true,
          dailyLogsRecentDone: 8,
        }),
        baseJob({
          id: '2',
          name: 'Design Only',
          pm: 'Adam Horseman',
          foundationStarted: false,
          phase: 'design',
          dailyLogsRecentDone: 2,
        }),
        baseJob({
          id: '3',
          name: 'James Job',
          pm: 'James Manford',
          foundationStarted: true,
          dailyLogsRecentDone: 4,
        }),
      ],
      pipeline: [],
      salesPerformance: [],
      timeMetrics: [],
      targetMarginPct: 15,
      projectedMarginPct: 18,
      rollingRevenue12Mo: 0,
      now: new Date('2026-08-24T12:00:00'),
    });

    const adam = dash.pmScorecard.find((r) => r.pm === 'Adam Horseman');
    const james = dash.pmScorecard.find((r) => r.pm === 'James Manford');
    expect(adam).toMatchObject({ projects: 2, dailyLogsRecentDone: 8, dailyLogsRecentExpected: 16 });
    expect(james).toMatchObject({ projects: 1, dailyLogsRecentDone: 4, dailyLogsRecentExpected: 16 });
  });

  it('counts only PM-authored recent logs on the scorecard numerator', () => {
    const dash = summarizeOwnerDashboard({
      source: 'buildertrend',
      refreshedAt: '2026-08-24T00:00:00.000Z',
      filters: { status: 'open', dateRange: 'all' },
      jobs: [
        baseJob({
          id: '1',
          name: 'Etienne',
          pm: 'Adam Horseman',
          foundationStarted: true,
          dailyLogsRecentDone: 20,
          dailyLogsRecentPmDone: 14,
        }),
        baseJob({
          id: '2',
          name: 'Jimenez',
          pm: 'Adam Horseman',
          foundationStarted: true,
          dailyLogsRecentDone: 17,
          dailyLogsRecentPmDone: 13,
        }),
      ],
      pipeline: [],
      salesPerformance: [],
      timeMetrics: [],
      targetMarginPct: 15,
      projectedMarginPct: 18,
      rollingRevenue12Mo: 0,
      now: new Date('2026-08-24T12:00:00'),
    });

    expect(dash.pmScorecard[0]).toMatchObject({
      pm: 'Adam Horseman',
      dailyLogsRecentDone: 27,
      dailyLogsRecentExpected: 32,
    });
  });

  it('sums trailing-30d revenue on the PM scorecard', () => {
    const dash = summarizeOwnerDashboard({
      source: 'buildertrend',
      refreshedAt: '2026-08-24T00:00:00.000Z',
      filters: { status: 'open', dateRange: 'all' },
      jobs: [
        baseJob({
          id: '1',
          name: 'Emerson',
          pm: 'Paul Dimeglio',
          foundationStarted: true,
          revenueLast30d: 292829.12,
        }),
        baseJob({
          id: '2',
          name: 'Lois',
          pm: 'Paul Dimeglio',
          foundationStarted: true,
          revenueLast30d: 101455.96,
        }),
        baseJob({
          id: '3',
          name: 'Kinney',
          pm: 'James Manford',
          foundationStarted: true,
          revenueLast30d: 151340,
        }),
      ],
      pipeline: [],
      salesPerformance: [],
      timeMetrics: [],
      targetMarginPct: 15,
      projectedMarginPct: 18,
      rollingRevenue12Mo: 0,
      now: new Date('2026-08-24T12:00:00'),
    });

    expect(dash.pmScorecard.find((r) => r.pm === 'Paul Dimeglio')?.revenueLast30d).toBeCloseTo(394285.08);
    expect(dash.pmScorecard.find((r) => r.pm === 'James Manford')?.revenueLast30d).toBe(151340);
  });
});
