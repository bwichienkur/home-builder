/** Compact Ops-only Buildertrend import (does not feed Home LIVE_DRILLDOWN). */

export type OpsBtImportTask = {
  taskId: number;
  jobId: number;
  title: string;
  assignee: string;
  dueDate: string;
  startDate?: string;
  /** Truncated BT task descriptionPlainText when present. */
  note?: string;
};

export type OpsBtImportLogAggregate = {
  jobId: number;
  jobName: string;
  userName: string;
  dailyLogCount: number;
  lastLogDate: string;
};

/**
 * Richer BT bake for Operations seed only.
 * Home continues to use LIVE_JOBS + LIVE_DRILLDOWN (past-due / aggregates).
 */
export type OpsBtImport = {
  generatedAt: string;
  /** All incomplete (Not completed) tasks from the full local BT pull. */
  tasksByJobId: Record<string, OpsBtImportTask[]>;
  /**
   * Rolling-window user×job log aggregates (bodies not available from BT reports API).
   * Same shape as LIVE_DRILLDOWN.logsByJobId; duplicated here so Ops can evolve independently.
   */
  logsByJobId: Record<string, OpsBtImportLogAggregate[]>;
  meta: {
    incompleteTaskCount: number;
    pastDueTaskCount: number;
    logAggregateRows: number;
    /** True when real per-entry log bodies were not in the pull. */
    logBodiesUnavailable: true;
  };
};
