import { apiOwnerDashboardProvider } from './apiProvider';
import { mockOwnerDashboardProvider } from './mockProvider';
import { snapshotOwnerDashboardProvider } from './snapshotProvider';
import type { OwnerDashboardProvider } from './types';

export type BuildertrendProviderId = 'mock' | 'api' | 'snapshot';

function envProvider(): BuildertrendProviderId {
  const value = String((import.meta.env as Record<string, string | undefined>).VITE_BUILDERTREND_PROVIDER ?? 'snapshot')
    .trim()
    .toLowerCase();
  if (value === 'api') return 'api';
  if (value === 'mock') return 'mock';
  return 'snapshot';
}

/** UI talks only to this port. Default is the 19 Aug 2026 Buildertrend read-only snapshot. */
export function getOwnerDashboardProvider(): OwnerDashboardProvider {
  const id = envProvider();
  if (id === 'api') return apiOwnerDashboardProvider;
  if (id === 'mock') return mockOwnerDashboardProvider;
  return snapshotOwnerDashboardProvider;
}

export { mockOwnerDashboardProvider } from './mockProvider';
export { snapshotOwnerDashboardProvider } from './snapshotProvider';
export { apiOwnerDashboardProvider } from './apiProvider';
export { summarizeOwnerDashboard, filterJobs, roundPctParts } from './summarize';
export { mapBuildertrendReports } from './mapReports';
export { enrichOwnerJobs, computeDailyLogMetrics, DAILY_LOGS_PER_WEEK, DAILY_LOG_ROLLING_WEEKS } from './dailyLogStandards';
export { estimatedTimeMetricsForJob } from './estimatedTimeMetrics';
export {
  fetchCachedBuildertrendPull,
  loadStoredLivePull,
  refreshBuildertrendPull,
  storeLivePull,
  clearStoredLivePull,
} from './refreshClient';
export { formatCompactUsd, formatUsd, formatPct, formatDelta, formatRefreshedAt, formatRefreshAgo, formatCloseDate, formatDays, formatMonthsDays, splitMonthsDays, totalSlipDays, phaseLabel } from './format';
export { PM_REVENUE_LAST_30D_GOAL } from './types';
export type * from './types';
export type { BuildertrendLivePull } from './refreshClient';
export type { BuildertrendReports, MappedBuildertrendPull } from './mapReports';
