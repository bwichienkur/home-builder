import type { OwnerJob, PipelineStage, SalesPerformanceBar, TimeMetric } from './types';

const ADAM = 'Adam Horseman';
const JAMES = 'James Manford';
const MONIQUE = 'Monique Lumley';
const PAUL = 'Paul Dimeglio';
const RICHARD = 'Richard Linck';

function scaleInt(values: number[], target: number) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return values.map(() => 0);
  const out = values.map((value) => Math.round((value * target) / sum));
  out[out.length - 1] += target - out.reduce((a, b) => a + b, 0);
  return out;
}

type Seed = Omit<OwnerJob, 'id'>;

const OPEN_SEEDS: Seed[] = [
  { name: 'Ahigian-Habashi', pm: ADAM, status: 'open', phase: 'construction', pendingSelections: 4, pastDueTasks: 2, dailyLogsRecentDone: 15, dailyLogsTotal: 262, contractPrice: 1230000, revenueToDate: 780000, wip: 920000, estCloseDate: '2026-11-14', openedAt: '2025-04-02', slip: { permit: 6, selections: 4, purchasing: 2, construction: 8 }, notes: 'Subcontractor delays on tile & stone.' },
  { name: 'Bennett', pm: JAMES, status: 'open', phase: 'construction', pendingSelections: 1, pastDueTasks: 0, dailyLogsRecentDone: 15, dailyLogsTotal: 252, contractPrice: 1120000, revenueToDate: 640000, wip: 810000, estCloseDate: '2026-10-22', openedAt: '2025-05-18', slip: { permit: 0, selections: 2, purchasing: 1, construction: 3 }, notes: 'Framing complete; MEP rough-in this week.' },
  { name: 'Blandford', pm: MONIQUE, status: 'open', phase: 'permitting', pendingSelections: 8, pastDueTasks: 3, dailyLogsRecentDone: 13, dailyLogsTotal: 105, contractPrice: 980000, revenueToDate: 210000, wip: 640000, estCloseDate: '2027-03-08', openedAt: '2026-01-12', slip: { permit: 12, selections: 6, purchasing: 0, construction: 0 }, notes: 'Coastal setback comments from the city.' },
  { name: 'Calder', pm: PAUL, status: 'open', phase: 'construction', pendingSelections: 2, pastDueTasks: 1, dailyLogsRecentDone: 16, dailyLogsTotal: 312, contractPrice: 1250000, revenueToDate: 910000, wip: 980000, estCloseDate: '2026-09-30', openedAt: '2025-02-20', slip: { permit: 2, selections: 0, purchasing: 3, construction: 5 }, notes: 'Windows 2 weeks out.' },
  { name: 'Dunn', pm: RICHARD, status: 'open', phase: 'design', pendingSelections: 14, pastDueTasks: 0, dailyLogsRecentDone: 12, dailyLogsTotal: 70, contractPrice: 890000, revenueToDate: 120000, wip: 410000, estCloseDate: '2027-06-18', openedAt: '2026-03-04', slip: { permit: 0, selections: 9, purchasing: 0, construction: 0 }, notes: 'Owner reviewing structural option B.' },
  { name: 'Ellis', pm: ADAM, status: 'open', phase: 'construction', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 16, dailyLogsTotal: 8, contractPrice: 1210000, revenueToDate: 860000, wip: 900000, estCloseDate: '2026-10-09', openedAt: '2026-08-10', slip: { permit: 1, selections: 0, purchasing: 0, construction: 2 }, notes: '' },
  { name: 'Foster', pm: JAMES, status: 'open', phase: 'permitting', pendingSelections: 5, pastDueTasks: 1, dailyLogsRecentDone: 14, dailyLogsTotal: 145, contractPrice: 1340000, revenueToDate: 280000, wip: 720000, estCloseDate: '2027-02-12', openedAt: '2025-11-02', slip: { permit: 8, selections: 3, purchasing: 2, construction: 0 }, notes: 'HOA architectural resubmittal.' },
  { name: 'Grant', pm: MONIQUE, status: 'open', phase: 'construction', pendingSelections: 3, pastDueTasks: 4, dailyLogsRecentDone: 12, dailyLogsTotal: 185, contractPrice: 760000, revenueToDate: 430000, wip: 610000, estCloseDate: '2026-12-04', openedAt: '2025-06-27', slip: { permit: 3, selections: 5, purchasing: 4, construction: 11 }, notes: 'Tile & stone vendor missed two deliveries.' },
  { name: 'Hayes', pm: PAUL, status: 'open', phase: 'closeout', pendingSelections: 0, pastDueTasks: 2, dailyLogsRecentDone: 15, dailyLogsTotal: 367, contractPrice: 1250000, revenueToDate: 1180000, wip: 880000, estCloseDate: '2026-08-28', openedAt: '2024-09-16', slip: { permit: 0, selections: 1, purchasing: 0, construction: 4 }, notes: 'Punch list: paint touch-up, appliance install.' },
  { name: 'Ingram', pm: RICHARD, status: 'open', phase: 'construction', pendingSelections: 2, pastDueTasks: 0, dailyLogsRecentDone: 15, dailyLogsTotal: 225, contractPrice: 1020000, revenueToDate: 540000, wip: 760000, estCloseDate: '2026-11-30', openedAt: '2025-07-08', slip: { permit: 4, selections: 2, purchasing: 1, construction: 6 }, notes: 'Drywall after inspections Friday.' },
  { name: 'Jensen', pm: ADAM, status: 'open', phase: 'design', pendingSelections: 11, pastDueTasks: 1, dailyLogsRecentDone: 11, dailyLogsTotal: 49, contractPrice: 1180000, revenueToDate: 90000, wip: 520000, estCloseDate: '2027-07-22', openedAt: '2026-04-15', slip: { permit: 0, selections: 7, purchasing: 0, construction: 0 }, notes: 'Waiting on pool equipment package.' },
  { name: 'Klein', pm: JAMES, status: 'open', phase: 'permitting', pendingSelections: 6, pastDueTasks: 0, dailyLogsRecentDone: 15, dailyLogsTotal: 135, contractPrice: 940000, revenueToDate: 190000, wip: 580000, estCloseDate: '2027-01-19', openedAt: '2025-12-09', slip: { permit: 9, selections: 4, purchasing: 1, construction: 0 }, notes: '' },
  { name: 'Lopez', pm: MONIQUE, status: 'open', phase: 'construction', pendingSelections: 1, pastDueTasks: 1, dailyLogsRecentDone: 16, dailyLogsTotal: 328, contractPrice: 1290000, revenueToDate: 970000, wip: 1010000, estCloseDate: '2026-09-18', openedAt: '2025-01-24', slip: { permit: 2, selections: 0, purchasing: 2, construction: 1 }, notes: 'On baseline for interior trim.' },
  { name: 'Martin', pm: PAUL, status: 'open', phase: 'construction', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 16, dailyLogsTotal: 276, contractPrice: 870000, revenueToDate: 610000, wip: 700000, estCloseDate: '2026-10-16', openedAt: '2025-04-29', slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 }, notes: '' },
  { name: 'Norris', pm: RICHARD, status: 'open', phase: 'permitting', pendingSelections: 7, pastDueTasks: 2, dailyLogsRecentDone: 13, dailyLogsTotal: 95, contractPrice: 1190000, revenueToDate: 250000, wip: 690000, estCloseDate: '2027-02-26', openedAt: '2026-02-03', slip: { permit: 14, selections: 5, purchasing: 3, construction: 0 }, notes: 'Septic variance in review.' },
  { name: 'Owens', pm: ADAM, status: 'open', phase: 'construction', pendingSelections: 3, pastDueTasks: 1, dailyLogsRecentDone: 14, dailyLogsTotal: 183, contractPrice: 990000, revenueToDate: 480000, wip: 740000, estCloseDate: '2026-12-18', openedAt: '2025-08-14', slip: { permit: 5, selections: 3, purchasing: 2, construction: 7 }, notes: 'Slab pour slipped after rain week.' },
  { name: 'Patel', pm: JAMES, status: 'open', phase: 'design', pendingSelections: 16, pastDueTasks: 0, dailyLogsRecentDone: 10, dailyLogsTotal: 33, contractPrice: 1080000, revenueToDate: 70000, wip: 470000, estCloseDate: '2027-08-06', openedAt: '2026-05-21', slip: { permit: 0, selections: 11, purchasing: 0, construction: 0 }, notes: 'Selections appointment booked for next Tuesday.' },
  { name: 'Quinn', pm: MONIQUE, status: 'open', phase: 'closeout', pendingSelections: 1, pastDueTasks: 3, dailyLogsRecentDone: 15, dailyLogsTotal: 359, contractPrice: 720000, revenueToDate: 690000, wip: 540000, estCloseDate: '2026-08-21', openedAt: '2024-11-05', slip: { permit: 1, selections: 2, purchasing: 0, construction: 3 }, notes: 'CO scheduled; landscaping punch remains.' },
  { name: 'Rivera', pm: PAUL, status: 'open', phase: 'construction', pendingSelections: 2, pastDueTasks: 0, dailyLogsRecentDone: 15, dailyLogsTotal: 233, contractPrice: 1360000, revenueToDate: 720000, wip: 990000, estCloseDate: '2026-11-06', openedAt: '2025-06-01', slip: { permit: 3, selections: 1, purchasing: 4, construction: 5 }, notes: 'Roofing complete; insulation next.' },
  { name: 'Shaw', pm: RICHARD, status: 'open', phase: 'permitting', pendingSelections: 4, pastDueTasks: 1, dailyLogsRecentDone: 14, dailyLogsTotal: 152, contractPrice: 1150000, revenueToDate: 230000, wip: 660000, estCloseDate: '2027-01-08', openedAt: '2025-10-17', slip: { permit: 7, selections: 2, purchasing: 1, construction: 0 }, notes: '' },
  { name: 'Turner', pm: ADAM, status: 'open', phase: 'construction', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 16, dailyLogsTotal: 12, contractPrice: 830000, revenueToDate: 500000, wip: 620000, estCloseDate: '2026-10-02', openedAt: '2026-08-01', slip: { permit: 0, selections: 0, purchasing: 1, construction: 2 }, notes: '' },
  { name: 'Vaughn', pm: JAMES, status: 'open', phase: 'design', pendingSelections: 9, pastDueTasks: 2, dailyLogsRecentDone: 12, dailyLogsTotal: 29, contractPrice: 1240000, revenueToDate: 110000, wip: 530000, estCloseDate: '2027-05-28', openedAt: '2026-06-11', slip: { permit: 0, selections: 8, purchasing: 0, construction: 0 }, notes: 'Lanai roof option still open.' },
  { name: 'Walsh', pm: MONIQUE, status: 'open', phase: 'permitting', pendingSelections: 5, pastDueTasks: 0, dailyLogsRecentDone: 15, dailyLogsTotal: 105, contractPrice: 1070000, revenueToDate: 200000, wip: 600000, estCloseDate: '2027-03-26', openedAt: '2026-01-28', slip: { permit: 5, selections: 3, purchasing: 0, construction: 0 }, notes: 'Tree survey submitted.' },
  { name: 'York', pm: ADAM, status: 'open', phase: 'closeout', pendingSelections: 0, pastDueTasks: 1, dailyLogsRecentDone: 16, dailyLogsTotal: 388, contractPrice: 690000, revenueToDate: 660000, wip: 510000, estCloseDate: '2026-08-25', openedAt: '2024-10-12', slip: { permit: 0, selections: 0, purchasing: 0, construction: 2 }, notes: 'Final cleaning booked.' },
];

const CLOSED_SEEDS: Seed[] = [
  { name: 'Abbott', pm: ADAM, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 394, contractPrice: 1420000, revenueToDate: 1420000, wip: 0, estCloseDate: '2026-04-10', openedAt: '2024-06-02', slip: { permit: 2, selections: 1, purchasing: 0, construction: 3 }, notes: 'Closed on schedule.' },
  { name: 'Bishop', pm: JAMES, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 405, contractPrice: 980000, revenueToDate: 980000, wip: 0, estCloseDate: '2026-02-20', openedAt: '2024-05-14', slip: { permit: 0, selections: 4, purchasing: 2, construction: 6 }, notes: '' },
  { name: 'Chen', pm: MONIQUE, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 435, contractPrice: 1210000, revenueToDate: 1210000, wip: 0, estCloseDate: '2025-12-18', openedAt: '2024-03-08', slip: { permit: 5, selections: 0, purchasing: 1, construction: 2 }, notes: '' },
  { name: 'Diaz', pm: PAUL, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 357, contractPrice: 860000, revenueToDate: 860000, wip: 0, estCloseDate: '2026-06-03', openedAt: '2024-08-19', slip: { permit: 1, selections: 2, purchasing: 0, construction: 1 }, notes: 'Warranty walk complete.' },
  { name: 'Everett', pm: RICHARD, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 449, contractPrice: 1580000, revenueToDate: 1580000, wip: 0, estCloseDate: '2026-01-09', openedAt: '2024-02-11', slip: { permit: 3, selections: 5, purchasing: 4, construction: 8 }, notes: 'Closed 11 days late.' },
  { name: 'Farrell', pm: ADAM, status: 'closed', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 0, dailyLogsTotal: 462, contractPrice: 740000, revenueToDate: 740000, wip: 0, estCloseDate: '2025-11-21', openedAt: '2024-01-16', slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 }, notes: '' },
];

const WARRANTY_SEEDS: Seed[] = [
  { name: 'Gable', pm: JAMES, status: 'warranty', phase: 'closeout', pendingSelections: 0, pastDueTasks: 1, dailyLogsRecentDone: 8, dailyLogsTotal: 292, contractPrice: 1100000, revenueToDate: 1100000, wip: 0, estCloseDate: '2025-09-12', openedAt: '2023-11-04', slip: { permit: 0, selections: 0, purchasing: 0, construction: 1 }, notes: 'AC callback scheduled.' },
  { name: 'Hale', pm: MONIQUE, status: 'warranty', phase: 'closeout', pendingSelections: 0, pastDueTasks: 0, dailyLogsRecentDone: 4, dailyLogsTotal: 148, contractPrice: 930000, revenueToDate: 930000, wip: 0, estCloseDate: '2025-07-30', openedAt: '2023-10-22', slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 }, notes: '11-month walk.' },
  { name: 'Ives', pm: PAUL, status: 'warranty', phase: 'closeout', pendingSelections: 0, pastDueTasks: 2, dailyLogsRecentDone: 12, dailyLogsTotal: 474, contractPrice: 1270000, revenueToDate: 1270000, wip: 0, estCloseDate: '2025-05-16', openedAt: '2023-08-09', slip: { permit: 0, selections: 0, purchasing: 0, construction: 2 }, notes: 'Stucco hairline — sub returning.' },
];

function withIds(prefix: string, seeds: Seed[]): OwnerJob[] {
  return seeds.map((seed, index) => ({
    ...seed,
    id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
  }));
}

function scaleOpenJobs(jobs: OwnerJob[]) {
  const contracts = scaleInt(jobs.map((j) => j.contractPrice), 25_650_000);
  const revenues = scaleInt(jobs.map((j) => j.revenueToDate), 15_110_000);
  const wips = scaleInt(jobs.map((j) => j.wip), 18_740_000);
  return jobs.map((job, i) => ({
    ...job,
    contractPrice: contracts[i]!,
    revenueToDate: revenues[i]!,
    wip: wips[i]!,
  }));
}

/** Mock sales pipeline mirrors Pipedrive Sales stages (deal counts). */
export const MOCK_PIPELINE: PipelineStage[] = [
  { id: 'pd-1', label: 'First Contact', value: 22_630_628, dealCount: 22 },
  { id: 'pd-2', label: 'Qualified', value: 14_250_000, dealCount: 11 },
  { id: 'pd-4', label: 'Homesite Secured', value: 3_400_000, dealCount: 3 },
  { id: 'pd-3', label: 'Meet with Eric', value: 4_276_730, dealCount: 3 },
  { id: 'pd-5', label: 'Pricing Proposal', value: 2_328_721, dealCount: 2 },
  { id: 'pd-17', label: 'Under Negotiation', value: 965_037, dealCount: 1 },
  { id: 'pd-6', label: 'Contract Sent', value: 0, dealCount: 0 },
];

export const MOCK_SALES_PERFORMANCE: SalesPerformanceBar[] = [
  { id: 'backlog', label: 'Signed Backlog', value: 28_120_000 },
  { id: 'closings', label: 'Projected Closings', value: 6_850_000 },
  { id: 'signing', label: 'Expected Signing Value', value: 18_600_000 },
];

/** Intended later BT source: schedule baselines (contract / permit / slab → close). */
export const MOCK_TIME_METRICS: TimeMetric[] = [
  { id: 'contract-close', label: 'Contract to Close', days: 412, deltaDays: -18 },
  { id: 'permit-close', label: 'Permit to Close', days: 298, deltaDays: -12 },
  { id: 'slab-close', label: 'Slab Pour to Close', days: 186, deltaDays: -9 },
];

export const MOCK_TARGET_MARGIN_PCT = 15;
export const MOCK_PROJECTED_MARGIN_PCT = 18.6;
export const MOCK_ROLLING_REVENUE_12MO = 42_820_000;
/** Company-level sales KPI from the mockup (not stage×weight). */
export const MOCK_WEIGHTED_PIPELINE = 22_650_000;

export const MOCK_JOBS: OwnerJob[] = [
  ...scaleOpenJobs(withIds('open', OPEN_SEEDS)),
  ...withIds('closed', CLOSED_SEEDS),
  ...withIds('warranty', WARRANTY_SEEDS),
];
