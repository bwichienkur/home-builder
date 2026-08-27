import { summarizeOwnerDashboard } from '../buildertrend/summarize';
import type { OwnerDashboardFilters, OwnerDashboardProvider } from '../buildertrend/types';
import { mapOpsSnapshotToDashboardInputs } from './mapToDashboard';
import { ensureOpsSeeded } from './store';

/** Owner dashboard fed by native Operations store (localStorage). Flag: VITE_BUILDERTREND_PROVIDER=native */
export const nativeOwnerDashboardProvider: OwnerDashboardProvider = {
  id: 'native',
  async getDashboard(filters: OwnerDashboardFilters) {
    const snapshot = ensureOpsSeeded();
    const mapped = mapOpsSnapshotToDashboardInputs(snapshot);
    return summarizeOwnerDashboard({
      source: 'native',
      refreshedAt: mapped.refreshedAt,
      filters,
      jobs: mapped.jobs,
      pipeline: mapped.pipeline,
      salesPerformance: mapped.salesPerformance,
      timeMetrics: mapped.timeMetrics,
      targetMarginPct: mapped.targetMarginPct,
      projectedMarginPct: mapped.projectedMarginPct,
      rollingRevenue12Mo: mapped.rollingRevenue12Mo,
      weightedPipeline: mapped.weightedPipeline,
    });
  },
};
