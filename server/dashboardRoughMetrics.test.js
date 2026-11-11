import { describe, expect, it } from 'vitest';
import { roughMetricsFromPull } from './dashboardRoughMetrics.js';

describe('roughMetricsFromPull', () => {
  it('includes Job Info–priced opens missing from the WIP report', () => {
    const metrics = roughMetricsFromPull(
      {
        reports: {
          jobs: {
            data: {
              jobs: [
                { jobID: 1, jobName: 'On Wip', jobStatus: 'Open' },
                { jobID: 101, jobName: 'Graham', jobStatus: 'Open' },
                { jobID: 102, jobName: 'Olmstead', jobStatus: 'Open' },
              ],
            },
          },
          wip: {
            data: {
              rowData: [{ jobID: 1, jobName: 'On Wip', totalRevisedPrice: 500_000, jobStatus: 'Open' }],
            },
          },
          jobInfoContractByJob: {
            '101': 1_204_751,
            '102': 914_222,
          },
        },
      },
      null,
    );
    expect(metrics.active).toBe(3);
    expect(metrics.wip).toBe(500_000 + 1_204_751 + 914_222);
  });

  it('prefers profitability revised price over Job Info', () => {
    const metrics = roughMetricsFromPull(
      {
        reports: {
          jobs: [{ jobID: 1, jobName: 'On Budget', jobStatus: 'Open' }],
          profitability: {
            data: {
              rowData: [{ jobID: 1, revisedClientPrice: 1_402_571.9, jobStatus: 'Open' }],
            },
          },
          jobInfoContractByJob: { '1': 1_314_110 },
        },
      },
      null,
    );
    expect(metrics.wip).toBe(1_402_571.9);
  });

  it('excludes internal Buildertrend / OCH master jobs from active and WIP totals', () => {
    const metrics = roughMetricsFromPull(
      {
        reports: {
          jobs: {
            data: {
              jobs: [
                { jobID: 1, jobName: 'Bennett', jobStatus: 'Open' },
                { jobID: 2, jobName: 'General', jobStatus: 'Open' },
                { jobID: 3, jobName: 'OCH Master 2026', jobStatus: 'Open' },
                { jobID: 4, jobName: 'Digital Showroom', jobStatus: 'Open' },
              ],
            },
          },
          wip: {
            data: {
              rowData: [
                { jobID: 1, jobName: 'Bennett', totalRevisedPrice: 500_000, jobStatus: 'Open' },
                { jobID: 2, jobName: 'General', totalRevisedPrice: 50_000, jobStatus: 'Open' },
                { jobID: 3, jobName: 'OCH Master 2026', totalRevisedPrice: 1_000_000, jobStatus: 'Open' },
              ],
            },
          },
        },
      },
      null,
    );
    expect(metrics.active).toBe(1);
    expect(metrics.wip).toBe(500_000);
  });
});
