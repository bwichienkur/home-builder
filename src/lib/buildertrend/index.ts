import { apiOwnerDashboardProvider } from './apiProvider';
import { mockOwnerDashboardProvider } from './mockProvider';
import type { OwnerDashboardProvider } from './types';

export type BuildertrendProviderId = 'mock' | 'api';

function envProvider(): BuildertrendProviderId {
  const value = String((import.meta.env as Record<string, string | undefined>).VITE_BUILDERTREND_PROVIDER ?? 'mock')
    .trim()
    .toLowerCase();
  return value === 'api' ? 'api' : 'mock';
}

/** UI talks only to this port. Default is mock; `api` is a stub until partner access exists. */
export function getOwnerDashboardProvider(): OwnerDashboardProvider {
  return envProvider() === 'api' ? apiOwnerDashboardProvider : mockOwnerDashboardProvider;
}

export { mockOwnerDashboardProvider } from './mockProvider';
export { apiOwnerDashboardProvider } from './apiProvider';
export { summarizeOwnerDashboard, filterJobs, roundPctParts } from './summarize';
export { formatCompactUsd, formatUsd, formatPct, formatDelta, formatRefreshedAt, formatCloseDate, formatDays, totalSlipDays, phaseLabel } from './format';
export type * from './types';
