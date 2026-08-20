import {
  LIVE_JOBS,
  LIVE_PIPELINE,
  LIVE_PROJECTED_MARGIN_PCT,
  LIVE_ROLLING_REVENUE_12MO,
  LIVE_SALES_PERFORMANCE,
  LIVE_SNAPSHOT_AT,
  LIVE_TARGET_MARGIN_PCT,
  LIVE_TIME_METRICS,
  LIVE_WEIGHTED_PIPELINE,
} from './liveSnapshot';
import { summarizeOwnerDashboard } from './summarize';
import type { OwnerDashboardFilters, OwnerDashboardProvider } from './types';

/** Read-only Buildertrend snapshot. Not a live partner API and not a login scraper. */
export const snapshotOwnerDashboardProvider: OwnerDashboardProvider = {
  id: 'buildertrend',
  async getDashboard(filters: OwnerDashboardFilters) {
    return summarizeOwnerDashboard({
      source: 'buildertrend',
      refreshedAt: LIVE_SNAPSHOT_AT,
      filters,
      jobs: LIVE_JOBS,
      pipeline: LIVE_PIPELINE,
      salesPerformance: LIVE_SALES_PERFORMANCE,
      timeMetrics: LIVE_TIME_METRICS,
      targetMarginPct: LIVE_TARGET_MARGIN_PCT,
      projectedMarginPct: LIVE_PROJECTED_MARGIN_PCT,
      rollingRevenue12Mo: LIVE_ROLLING_REVENUE_12MO,
      weightedPipeline: LIVE_WEIGHTED_PIPELINE,
    });
  },
};
