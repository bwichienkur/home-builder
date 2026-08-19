import { describe, expect, it } from 'vitest';
import { mapBuildertrendReports, pickProjectManager, weekdaysElapsedInMonth } from './mapReports';

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
        leads: [{ estimatedRevenueMax: 43_000_000, status: 'Open' }],
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
      dailyLogsThisMonth: 1,
      dailyLogsExpected: 13,
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
      dailyLogsThisMonth: 1,
      dailyLogsExpected: 4,
      contractPrice: 0,
    });
    expect(mapped.jobs.find((job) => job.name === 'Graham')).toMatchObject({
      phase: 'design',
      dailyLogsExpected: 0,
      dailyLogsThisMonth: 0,
    });
    expect(mapped.jobs.find((job) => job.name === 'Norris')).toMatchObject({
      pm: 'Richard Linck',
      phase: 'construction',
      dailyLogsExpected: 13,
    });
    expect(mapped.jobs.find((job) => job.name === 'Whipple')?.phase).toBe('closeout');
    expect(mapped.jobs.find((job) => job.name === 'Chahlavi')?.phase).toBe('design');
    expect(mapped.jobs.find((job) => job.name === 'Bucciarelli')).toMatchObject({
      phase: 'permitting',
      dailyLogsThisMonth: 0,
      dailyLogsExpected: 4,
    });
    expect(mapped.pipeline[0]).toMatchObject({ id: 'lead', value: 43_000_000 });
    expect(mapped.rollingRevenue12Mo).toBe(4_290_000);
    expect(mapped.projectedMarginPct).toBeGreaterThan(0);
  });
});
