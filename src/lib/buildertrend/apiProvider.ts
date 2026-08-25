import type { OwnerDashboardProvider } from './types';

/**
 * Partner Buildertrend API client — not wired.
 *
 * Do not scrape buildertrend.com from the browser and do not put passwords in git.
 * Live read-only refresh goes through POST /api/buildertrend/refresh (env credentials or session cookie, GET reports only).
 * When Olsen has written API access, implement reads here and map into OwnerDashboard:
 * - GET projects / jobs (status, phase, PM, contract)
 * - job costing (contract, billed-to-date, projected, margin, WIP)
 * - invoices / payments (12-mo rolling revenue)
 * - sales stages (lead → closed) for weighted pipeline
 * - selections pending, to-dos past due
 * - daily logs this month
 * - schedule baseline vs actual total slip + Permit / Selections / Construction breakdown
 */
export const apiOwnerDashboardProvider: OwnerDashboardProvider = {
  id: 'buildertrend',
  async getDashboard() {
    throw new Error(
      'Buildertrend API is not configured. Use VITE_BUILDERTREND_PROVIDER=mock until a partner API client is available.',
    );
  },
};
