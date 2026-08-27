/** Native operations entities — mirror Owner Dashboard datapoints without BT/PD sync. */

import type {
  JobStatus,
  OwnerPhase,
  SalesPerformanceBar,
  SlipBuckets,
  TimeMetric,
} from '../buildertrend/types';

export type OpsJob = {
  id: string;
  name: string;
  pm: string;
  status: JobStatus;
  phase: OwnerPhase;
  openedAt: string;
  estCloseDate: string;
  notes: string;
  foundationStarted: boolean | null;
  /** Schedule milestones (ISO dates) — Contract/Permit/Slab → Close. */
  estFirstScheduleStart?: string;
  estPermittingEnd?: string;
  estFoundationStart?: string;
  estClosingEnd?: string;
  currentScheduleItem?: string;
  /**
   * Lifetime daily-log count from BT Daily Log creation by job.
   * Kept separately because Ops log rows may only cover the rolling 4-week window.
   */
  lifetimeDailyLogCount?: number;
  /** Financials (USD). */
  contractPrice: number;
  revenueToDate: number;
  revenueLast30d: number;
  wip: number;
  changeOrderRevenue: number;
  changeOrderProfit: number;
  /** Slip. */
  slip: SlipBuckets;
  totalSlip: number;
  archived?: boolean;
  updatedAt: string;
};

export type OpsDailyLog = {
  id: string;
  jobId: string;
  date: string;
  author: string;
  /** When true, counts toward PM attendance scorecard. */
  isPm: boolean;
  note?: string;
  /** bt-aggregate = expanded from BT user×job window counts. */
  source?: 'bt-aggregate' | 'manual' | 'bt-entry';
  updatedAt: string;
};

export type OpsTask = {
  id: string;
  jobId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: 'incomplete' | 'complete';
  startDate?: string;
  /** Optional task description / notes from BT. */
  note?: string;
  /** Seed currently imports BT incomplete (or past-due fallback); CRUD accepts any. */
  source?: 'bt-past-due' | 'bt-incomplete' | 'manual';
  updatedAt: string;
};

export type OpsSelection = {
  id: string;
  jobId: string;
  title: string;
  category: string;
  location: string;
  /** pending | selected | completed */
  status: 'pending' | 'selected' | 'completed';
  deadline: string;
  updatedAt: string;
};

export type OpsDealStage = 'lead' | 'proposal' | 'pre-contract' | 'contract' | 'closed' | 'lost';

export type OpsDeal = {
  id: string;
  title: string;
  stage: OpsDealStage;
  /** Est. revenue USD. */
  value: number;
  /** 0–100. */
  confidence: number;
  owner: string;
  /** ISO date — used for expected-signing reports. */
  expectedCloseDate?: string;
  updatedAt: string;
  archived?: boolean;
};

export type OpsPerson = {
  id: string;
  name: string;
  role: 'pm' | 'sales' | 'other';
  updatedAt: string;
};

/** Baseline / schedule line item (BT Baseline vs actual duration drilldown). */
export type OpsScheduleItem = {
  id: string;
  jobId: string;
  title: string;
  endDateSlip: number;
  durationSlip: number;
  expectedStartDate: string;
  actualStartDate: string;
  expectedEndDate: string;
  actualEndDate: string;
  completed: boolean;
  updatedAt: string;
};

/** Cash movement row (BT Cash flow Money In / Out). */
export type OpsCashflowEntry = {
  id: string;
  jobId: string;
  date: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  type: 'money_in' | 'money_out';
  note?: string;
  updatedAt: string;
};

export type OpsSettings = {
  targetMarginPct: number;
  projectedMarginPct: number;
  rollingRevenue12Mo: number;
  /**
   * Portfolio average time metrics (Contract/Permit/Slab → Close).
   * Seeded from LIVE_TIME_METRICS; recomputed when closed/warranty jobs have milestones.
   */
  timeMetrics?: TimeMetric[];
  /** Signed backlog / projected closings / expected signing — seeded from LIVE_SALES_PERFORMANCE. */
  salesPerformance?: SalesPerformanceBar[];
  /** ISO when store was last seeded or touched. */
  refreshedAt: string;
};

export type OpsSnapshot = {
  version: 1;
  settings: OpsSettings;
  jobs: OpsJob[];
  logs: OpsDailyLog[];
  tasks: OpsTask[];
  selections: OpsSelection[];
  deals: OpsDeal[];
  people: OpsPerson[];
  /** Optional for older local stores — normalized on load. */
  scheduleItems?: OpsScheduleItem[];
  cashflow?: OpsCashflowEntry[];
};

export const OPS_STORAGE_KEY = 'mahnikka-ops-v1';
