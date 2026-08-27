/** Owner-dashboard domain. Shaped for a later Buildertrend API client. */

export type JobStatus = 'open' | 'closed' | 'warranty';
export type OwnerPhase = 'design' | 'permitting' | 'construction' | 'closeout';
export type DateRangeId = 'all' | '30d' | 'ytd' | '12mo';
export type DashboardSource = 'mock' | 'buildertrend';

export type OwnerDashboardFilters = {
  status: JobStatus;
  dateRange: DateRangeId;
};

/** Intended later BT source: sales stages × close probability. */
export const PIPELINE_WEIGHTS: Record<string, number> = {
  lead: 0.1,
  proposal: 0.25,
  'pre-contract': 0.45,
  contract: 0.8,
  closed: 1,
};

export type SlipBuckets = {
  permit: number;
  selections: number;
  construction: number;
};

export type OwnerJob = {
  id: string;
  name: string;
  pm: string;
  status: JobStatus;
  phase: OwnerPhase;
  pendingSelections: number;
  pastDueTasks: number;
  /** Lifetime count from BT (optional; parsed from notes when absent). */
  dailyLogsTotal?: number;
  /** Past 4 weeks from BT user-daily-logs when available. */
  dailyLogsRecentDone?: number | null;
  /**
   * Past 4 weeks logs authored by this job’s PM only (PM attendance metric).
   * Used by the PM scorecard numerator.
   */
  dailyLogsRecentPmDone?: number | null;
  /**
   * When false, daily logs are not required yet (Foundation schedule item not started).
   * null/undefined = unknown (treat as required for mock / legacy snapshots).
   */
  foundationStarted?: boolean | null;
  /** USD */
  contractPrice: number;
  revenueToDate: number;
  /**
   * Trailing 30-day owner inflow (draws / revenue received) from BT Cash flow
   * (`cashflowType` Money In). Used for the PM $500k/mo staffing metric.
   */
  revenueLast30d?: number;
  /** USD revised contract (original + change orders) for WIP totals. */
  wip: number;
  /** Change order revenue from BT Change order profit report (open jobs). */
  changeOrderRevenue?: number;
  /** Change order profit dollars from BT Change order profit report. */
  changeOrderProfit?: number;
  /** ISO date */
  estCloseDate: string;
  openedAt: string;
  slip: SlipBuckets;
  /**
   * Total end-date slip workdays from Baseline vs. actual duration by job.
   * Prefer this over summing category slips (they do not add to total).
   */
  totalSlip?: number;
  notes: string;
};

export type KpiCard = {
  id: string;
  title: string;
  value: number;
  display: string;
  delta: number;
  deltaUnit: 'pct' | 'pts';
  deltaLabel: string;
  sparkline: number[];
  detail?: string;
};

export type PhaseSlice = {
  phase: OwnerPhase;
  label: string;
  count: number;
  pct: number;
};

export type TimeMetric = {
  id: string;
  label: string;
  days: number;
  deltaDays: number;
};

/** Leadership goal: $500k draws / revenue received per PM per trailing ~30 days. */
export const PM_REVENUE_LAST_30D_GOAL = 500_000;

export type PmScorecardRow = {
  pm: string;
  projects: number;
  wip: number;
  /**
   * Sum of trailing-30-day BT Cash flow Money In across this PM’s open jobs.
   * Goal: {@link PM_REVENUE_LAST_30D_GOAL}.
   */
  revenueLast30d: number;
  /** Rolling 4-week window (4 logs/week × 4 weeks × project count). */
  dailyLogsRecentDone: number;
  dailyLogsRecentExpected: number;
  dailyLogRecentPct: number;
  dailyLogLifetimePct: number;
  pastDueTasks: number;
};

export type PipelineStage = {
  id: string;
  label: string;
  /** Dollar value in stage (Pipedrive: weighted deal value sum). */
  value: number;
  /** Open deal count when sourced from Pipedrive. */
  dealCount?: number;
};

export type SalesPerformanceBar = {
  id: string;
  label: string;
  value: number;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  pm: string;
  pendingSelections: number;
  pastDueTasks: number;
  dailyLogsRecentDone: number | null;
  dailyLogsRecentExpected: number;
  dailyLogsTotal: number;
  dailyLogLifetimePct: number;
  contractPrice: number;
  revenueToDate: number;
  /** Trailing 30-day BT Cash flow Money In (draws / revenue received). */
  revenueLast30d?: number;
  /** Revised contract (original + change orders) for WIP totals. */
  wip: number;
  changeOrderRevenue?: number;
  changeOrderProfit?: number;
  pctComplete: number;
  estCloseDate: string;
  phase: OwnerPhase;
  slip: SlipBuckets;
  totalSlip: number;
  notes: string;
};

export type DashboardTotals = {
  jobCount: number;
  avgTotalSlipDays: number;
  totalRevenueToDate: number;
  totalWip: number;
  /** Sum of change order revenue on open jobs (BT Change order profit report). */
  totalChangeOrderRevenue: number;
  /** Portfolio change order profit % on open jobs (profit ÷ revenue). */
  changeOrderProfitPct: number;
  pendingSelections: number;
  pastDueTasks: number;
  avgDailyLogPct: number;
  avgDailyLogLifetimePct: number;
};

export type OwnerDashboard = {
  source: DashboardSource;
  refreshedAt: string;
  filters: OwnerDashboardFilters;
  kpis: KpiCard[];
  phases: PhaseSlice[];
  timeMetrics: TimeMetric[];
  pmScorecard: PmScorecardRow[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceBar[];
  weightedPipeline: number;
  projects: ProjectSnapshot[];
  totals: DashboardTotals;
};

export type OwnerDashboardProvider = {
  id: DashboardSource;
  getDashboard: (filters: OwnerDashboardFilters) => Promise<OwnerDashboard>;
};
