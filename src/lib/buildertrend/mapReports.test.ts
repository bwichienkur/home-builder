import { describe, expect, it } from 'vitest';
import {
  isSelectionMarkedSelected,
  mapBuildertrendReports,
  pastDueTasksByJob,
  pendingSelectionsByJob,
  pickProjectManager,
  weekdaysElapsedInMonth,
} from './mapReports';

const now = new Date(2026, 7, 19, 12);

describe('Buildertrend report mapper', () => {
  it('strips the designer when a PM is also listed', () => {
    expect(pickProjectManager('Paul Dimeglio, Monique Lumley')).toBe('Paul Dimeglio');
    expect(pickProjectManager(['Monique Lumley', 'Richard Linck'])).toBe('Richard Linck');
    expect(pickProjectManager('Monique Lumley')).toBe('Monique Lumley');
    expect(pickProjectManager('')).toBe('Unassigned');
  });

  it('counts Aug 1–19 2026 weekdays as 13', () => {
    expect(weekdaysElapsedInMonth(now)).toBe(13);
  });

  it('maps WIP, daily logs, and job picker rows without writing to Buildertrend', () => {
    const mapped = mapBuildertrendReports(
      {
        jobs: [
          { jobID: 1, jobName: 'Bennett', jobStatus: 'Open', projectManagers: 'James Manford' },
          { jobID: 99, jobName: '**** Tate TEST JOB', jobStatus: 'Open' },
          { jobID: 2, jobName: 'Allie Job', jobStatus: 'Open', actualStartDate: '2026-08-03' },
          { jobID: 3, jobName: 'Graham', jobStatus: 'Open', actualStartDate: '2026-05-20' },
          { jobID: 4, jobName: 'Norris', jobStatus: 'Open', projectManagers: 'Richard Linck, Monique Lumley' },
          { jobID: 5, jobName: 'Whipple', jobStatus: 'Open', projectManagers: 'Adam Horseman' },
        ],
        dailyLogs: {
          data: {
            rowData: [
              {
                jobName: 'Bennett',
                jobStatus: 'Open',
                projectManagers: 'James Manford',
                actualStartDate: '2025-10-07',
                lastDailyLogDate: '2026-08-12',
                totalDailyLogEntries: 157,
                totalWorkDays: 220,
              },
              {
                jobName: 'Allie Job',
                jobStatus: 'Open',
                lastDailyLogDate: '2026-08-11',
                totalDailyLogEntries: 1,
                totalWorkDays: 16,
              },
              {
                jobName: 'Norris',
                jobStatus: 'Open',
                projectManagers: 'Richard Linck',
                actualStartDate: '2026-01-03',
                lastDailyLogDate: '2026-08-10',
                totalDailyLogEntries: 54,
                totalWorkDays: 228,
              },
              {
                jobName: 'Whipple',
                jobStatus: 'Open',
                actualStartDate: '2025-10-15',
                lastDailyLogDate: '2026-08-18',
                totalDailyLogEntries: 222,
                totalWorkDays: 308,
              },
              {
                jobName: 'Bucciarelli',
                jobStatus: 'Open',
                projectManagers: 'Richard Linck',
                actualStartDate: '2026-06-01',
                lastDailyLogDate: '2026-07-24',
                totalDailyLogEntries: 3,
                totalWorkDays: 79,
              },
            ],
          },
        },
        wip: {
          data: {
            rowData: [
              {
                jobName: 'Bennett',
                jobID: 1,
                projectManagers: 'James Manford',
                totalRevisedPrice: 1_158_353,
                amountInvoiced: 626_047.24,
                jobCompletionPercentage: 84,
                projectedProfit: 100_000,
                earnedRevenue: 900_000,
              },
              {
                jobName: 'Ahigian - Habashi',
                projectManagers: 'Richard Linck',
                totalRevisedPrice: 0,
                amountInvoiced: 1_628_705.53,
                jobCompletionPercentage: 73,
                projectedCosts: 1_334_640,
                projectedProfit: 0,
                earnedRevenue: 1_200_000,
              },
              {
                jobName: 'Nagle',
                projectManagers: 'Adam Horseman, Monique Lumley',
                totalRevisedPrice: 1_360_391.07,
                amountInvoiced: 1_377_463.99,
                jobCompletionPercentage: 79,
                projectedProfit: 50_000,
                earnedRevenue: 1_100_000,
              },
              {
                jobName: 'Whipple',
                totalRevisedPrice: 1_078_675,
                amountInvoiced: 1_164_852.51,
                jobCompletionPercentage: 91,
                projectedProfit: 80_000,
                earnedRevenue: 1_050_000,
              },
              {
                jobName: 'Chahlavi',
                projectManagers: 'Adam Horseman, Monique Lumley',
                totalRevisedPrice: 1_085_163.28,
                amountInvoiced: 201_975,
                jobCompletionPercentage: 4,
                projectedProfit: 10_000,
                earnedRevenue: 40_000,
              },
            ],
          },
        },
        leads: {
          data: [
            {
              leadStatus: 0,
              confidence: 50,
              estimatedRevenueMin: { value: 1_400_000, scale: 2 },
              estimatedRevenueMax: { value: 1_800_000, scale: 2 },
              opportunityTitle: { leadLink: { title: 'Allen Kim' } },
            },
            {
              leadStatus: 0,
              confidence: 40,
              estimatedRevenueMin: { value: 900_000, scale: 2 },
              estimatedRevenueMax: { value: 1_000_000, scale: 2 },
              opportunityTitle: { leadLink: { title: 'Blanks Todd' } },
            },
          ],
          records: 2,
        },
      },
      { now },
    );

    expect(mapped.jobs.map((job) => job.name)).not.toContain('**** Tate TEST JOB');
    expect(mapped.jobs.find((job) => job.name === 'Bennett')).toMatchObject({
      pm: 'James Manford',
      phase: 'construction',
      contractPrice: 1_158_353,
      revenueToDate: 626_047.24,
      wip: 532_305.76,
      dailyLogsTotal: 157,
      dailyLogsRecentDone: null,
    });
    expect(mapped.jobs.find((job) => job.name === 'Ahigian - Habashi')).toMatchObject({
      contractPrice: 0,
      revenueToDate: 1_628_705.53,
      wip: 0,
      phase: 'construction',
    });
    expect(mapped.jobs.find((job) => job.name === 'Nagle')).toMatchObject({
      pm: 'Adam Horseman',
      wip: 0,
      revenueToDate: 1_377_463.99,
    });
    expect(mapped.jobs.find((job) => job.name === 'Allie Job')).toMatchObject({
      phase: 'permitting',
      dailyLogsTotal: 1,
      dailyLogsRecentDone: null,
      contractPrice: 0,
    });
    expect(mapped.jobs.find((job) => job.name === 'Graham')).toMatchObject({
      phase: 'design',
      dailyLogsTotal: undefined,
      dailyLogsRecentDone: null,
    });
    expect(mapped.jobs.find((job) => job.name === 'Norris')).toMatchObject({
      pm: 'Richard Linck',
      phase: 'construction',
      dailyLogsTotal: 54,
    });
    expect(mapped.jobs.find((job) => job.name === 'Whipple')?.phase).toBe('closeout');
    expect(mapped.jobs.find((job) => job.name === 'Chahlavi')?.phase).toBe('design');
    expect(mapped.jobs.find((job) => job.name === 'Bucciarelli')).toMatchObject({
      phase: 'permitting',
      dailyLogsTotal: 3,
      dailyLogsRecentDone: null,
    });
    // Lead Opportunities: sum(confidence × estimatedRevenueMin) e.g. 50%×1.4M + 40%×0.9M
    expect(mapped.pipeline[0]).toMatchObject({ id: 'lead', value: 2_300_000 });
    expect(mapped.weightedPipeline).toBe(700_000 + 360_000);
    expect(mapped.rollingRevenue12Mo).toBe(4_290_000);
    expect(mapped.projectedMarginPct).toBeGreaterThan(0);
  });

  it('counts past-due incomplete tasks from merged per-job Tasks/list payloads', () => {
    const counts = pastDueTasksByJob(
      {
        tasks: {
          tasks: [
            { taskId: 1, jobId: 42673665, status: 0, endDate: '2026-08-12T00:00:00' },
            { taskId: 2, jobId: 42673665, status: 0, endDate: '2026-08-18T00:00:00' },
            { taskId: 3, jobId: 42673665, status: 0, endDate: '2026-09-01T00:00:00' },
            { taskId: 4, jobId: 35918575, status: 0, endDate: '2026-07-01T00:00:00' },
            { taskId: 5, jobId: 35918575, status: 1, endDate: '2026-07-01T00:00:00' },
          ],
        },
      },
      new Date(2026, 7, 22, 12),
    );

    expect(counts.get(42673665)).toBe(2);
    expect(counts.get(35918575)).toBe(1);
    expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  it('treats Selected and single-choice BuilderOverride as selected', () => {
    expect(isSelectionMarkedSelected({ status: 2 })).toBe(true);
    expect(isSelectionMarkedSelected({ status: 3, maxSelected: 1 })).toBe(true);
    expect(isSelectionMarkedSelected({ status: 3, maxSelected: -999 })).toBe(false);
    expect(isSelectionMarkedSelected({ status: 0, maxSelected: 1 })).toBe(false);
    expect(isSelectionMarkedSelected({ status: -1 })).toBe(false);
  });

  it('counts pending selections per job as rows not marked Selected', () => {
    const counts = pendingSelectionsByJob({
      selectionsByJob: {
        '40497055': [
          { status: { status: 3, maxSelected: -999 } },
          { status: { status: 3, maxSelected: 1 } },
          { status: { status: 0, maxSelected: 1 } },
        ],
        '123': [{ status: { status: 2 } }],
      },
    });

    expect(counts.get(40497055)).toBe(2);
    expect(counts.get(123)).toBe(0);
  });
});
