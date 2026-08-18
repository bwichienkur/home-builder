import { MOCK_JOBS, MOCK_PIPELINE, MOCK_PROJECTED_MARGIN_PCT, MOCK_ROLLING_REVENUE_12MO, MOCK_SALES_PERFORMANCE, MOCK_TARGET_MARGIN_PCT, MOCK_TIME_METRICS, MOCK_WEIGHTED_PIPELINE } from './mockData';
import { summarizeOwnerDashboard } from './summarize';
import type { OwnerDashboardFilters, OwnerDashboardProvider } from './types';

/** In-memory Olsen-style snapshot. Replace with a Buildertrend client later. */
export const mockOwnerDashboardProvider: OwnerDashboardProvider = {
  id: 'mock',
  async getDashboard(filters: OwnerDashboardFilters) {
    const refreshedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    return summarizeOwnerDashboard({
      source: 'mock',
      refreshedAt,
      filters,
      jobs: MOCK_JOBS,
      pipeline: MOCK_PIPELINE,
      salesPerformance: MOCK_SALES_PERFORMANCE,
      timeMetrics: MOCK_TIME_METRICS,
      targetMarginPct: MOCK_TARGET_MARGIN_PCT,
      projectedMarginPct: MOCK_PROJECTED_MARGIN_PCT,
      rollingRevenue12Mo: MOCK_ROLLING_REVENUE_12MO,
      weightedPipeline: MOCK_WEIGHTED_PIPELINE,
    });
  },
};
