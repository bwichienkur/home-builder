import { apiOwnerDashboardProvider } from './apiProvider';
import { mockOwnerDashboardProvider } from './mockProvider';
import { snapshotOwnerDashboardProvider } from './snapshotProvider';
import { nativeOwnerDashboardProvider } from '../operations/nativeProvider';
import type { OwnerDashboardProvider } from './types';

export type BuildertrendProviderId = 'mock' | 'api' | 'snapshot' | 'native';

function envProvider(): BuildertrendProviderId {
  const value = String((import.meta.env as Record<string, string | undefined>).VITE_BUILDERTREND_PROVIDER ?? 'snapshot')
    .trim()
    .toLowerCase();
  if (value === 'api') return 'api';
  if (value === 'mock') return 'mock';
  if (value === 'native') return 'native';
  return 'snapshot';
}

/** True when Owner Dashboard should use native Operations store (not BT live pulls). */
export function isNativeOwnerDashboard(): boolean {
  return envProvider() === 'native';
}

/** UI talks only to this port. Default is the baked Buildertrend read-only snapshot. */
export function getOwnerDashboardProvider(): OwnerDashboardProvider {
  const id = envProvider();
  if (id === 'api') return apiOwnerDashboardProvider;
  if (id === 'mock') return mockOwnerDashboardProvider;
  if (id === 'native') return nativeOwnerDashboardProvider;
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
  mergeCorePullWithPrior,
  refreshBuildertrendPull,
  storeLivePull,
  clearStoredLivePull,
} from './refreshClient';
export {
  BT_COOKIE_STORAGE_KEY,
  REQUIRED_BT_COOKIE_NAMES,
  loadStoredBtCookie,
  storeBtCookie,
  clearStoredBtCookie,
  buildCookieHeader,
  sanitizeCookieValue,
  isAuthRefreshFailure,
} from './cookieSession';
export type { RequiredBtCookieName } from './cookieSession';
export { formatCompactUsd, formatUsd, formatPct, formatDelta, formatRefreshedAt, formatRefreshAgo, formatCloseDate, formatDays, formatMonthsDays, splitMonthsDays, totalSlipDays, phaseLabel } from './format';
export { PM_REVENUE_LAST_30D_GOAL } from './types';
export type * from './types';
export type { BuildertrendLivePull } from './refreshClient';
export type { BuildertrendReports, MappedBuildertrendPull } from './mapReports';
