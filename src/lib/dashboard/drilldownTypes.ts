import type { OwnerPhase } from '../buildertrend/types';

export type DrillDealRow = {
  id: number;
  title: string;
  value: number;
  stageName: string;
  probabilityPct: number;
  weightedValue: number;
  expectedCloseDate: string;
  status: string;
};

export type DrillSelectionRow = {
  id: number;
  jobId: number;
  jobName: string;
  title: string;
  category: string;
  location: string;
  statusLabel: string;
  deadline: string;
};

export type DrillTaskRow = {
  taskId: number;
  jobId: number;
  jobName: string;
  title: string;
  endDate: string;
  status: number;
  assignedTo: string;
};

export type DrillLogRow = {
  jobId: number;
  jobName: string;
  userName: string;
  dailyLogCount: number;
  lastLogDate: string;
};

export type DrillProjectRow = {
  id: string;
  name: string;
  pm: string;
  phase: OwnerPhase;
  pendingSelections: number;
  pastDueTasks: number;
  dailyLogsRecentDone: number | null;
  contractPrice: number;
  wip: number;
};

export type DrilldownKind =
  | { type: 'pipeline-stage'; stageId: string; label: string }
  | { type: 'job-selections'; jobId: string; jobName: string }
  | { type: 'job-past-due'; jobId: string; jobName: string }
  | { type: 'job-logs'; jobId: string; jobName: string }
  | { type: 'pm-projects'; pm: string }
  | { type: 'pm-logs'; pm: string }
  | { type: 'pm-past-due'; pm: string }
  | { type: 'phase-projects'; phase: OwnerPhase; label: string }
  | { type: 'all-pending-selections' }
  | { type: 'all-past-due' }
  | { type: 'all-logs' }
  | { type: 'expected-signing' }
  | { type: 'open-deals'; label?: string }
  | { type: 'all-projects'; label?: string };

export type LiveDrilldown = {
  generatedAt: string;
  dealsByStage: Record<string, DrillDealRow[]>;
  selectionsByJobId: Record<string, DrillSelectionRow[]>;
  pastDueByJobId: Record<string, DrillTaskRow[]>;
  logsByJobId: Record<string, DrillLogRow[]>;
};
