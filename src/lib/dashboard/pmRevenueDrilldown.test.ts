import { describe, expect, it } from 'vitest';
import { snapshotOwnerDashboardProvider } from '../buildertrend/snapshotProvider';
import { resolveDrilldown } from './resolveDrilldown';

describe('pm-revenue drill-down', () => {
  it('lists open jobs with trailing-30d cashflow Money In for a PM', async () => {
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    const james = dash.pmScorecard.find((r) => r.pm === 'James Manford');
    expect(james).toBeDefined();

    const data = resolveDrilldown({ type: 'pm-revenue', pm: 'James Manford' }, dash.projects, null);
    expect(data.title).toBe('Revenue (30d) · James Manford');
    const total = data.rows.reduce((s, r) => s + Number(r.revenue30d || 0), 0);
    expect(total).toBeCloseTo(james!.revenueLast30d);
  });

  it('sums Paul open-job trailing-30d revenue to match the scorecard total', async () => {
    const dash = await snapshotOwnerDashboardProvider.getDashboard({ status: 'open', dateRange: 'all' });
    const paul = dash.pmScorecard.find((r) => r.pm === 'Paul Dimeglio');
    expect(paul).toBeDefined();
    expect(paul!.revenueLast30d).toBeGreaterThan(0);

    const data = resolveDrilldown({ type: 'pm-revenue', pm: 'Paul Dimeglio' }, dash.projects, null);
    const total = data.rows.reduce((s, r) => s + Number(r.revenue30d || 0), 0);
    expect(total).toBeCloseTo(paul!.revenueLast30d);
  });
});
