/** Native operations entities — mirror Owner Dashboard datapoints without BT/PD sync. */

import type { JobStatus, OwnerPhase, SlipBuckets } from '../buildertrend/types';

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
  /** Schedule milestones (ISO dates). */
  estFirstScheduleStart?: string;
  estPermittingEnd?: string;
  estFoundationStart?: string;
  estClosingEnd?: string;
  currentScheduleItem?: string;
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
  updatedAt: string;
};

export type OpsTask = {
  id: string;
  jobId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: 'incomplete' | 'complete';
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
