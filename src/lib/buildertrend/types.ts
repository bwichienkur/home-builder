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
  purchasing: number;
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
   * When false, daily logs are not required yet (Foundation schedule item not started).
   * null/undefined = unknown (treat as required for mock / legacy snapshots).
   */
  foundationStarted?: boolean | null;
  /** USD */
  contractPrice: number;
  revenueToDate: number;
  /** USD work-in-progress (remaining production value). */
  wip: number;
  /** ISO date */
  estCloseDate: string;
  openedAt: string;
  slip: SlipBuckets;
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

export type PmScorecardRow = {
  pm: string;
  projects: number;
  wip: number;
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
  value: number;
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
  /** Remaining production value: revised contract − amount invoiced (BT WIP). */
  wip: number;
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
  totalContract: number;
  totalWip: number;
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
