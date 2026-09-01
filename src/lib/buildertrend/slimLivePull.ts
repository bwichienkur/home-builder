/**
 * Shrink Buildertrend live pulls before browser localStorage (typically ~5MB).
 * Raw server pulls can be 50–100MB; Vercel core pulls are smaller but prior merges can balloon.
 */
import type { BuildertrendReports } from './mapReports';

export type StorableLivePull = {
  pulledAt: string;
  authMethod: string;
  reports: BuildertrendReports;
  enrichment?: 'core' | 'partial' | 'full';
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  if (Array.isArray(rec.tasks)) return rec.tasks;
  if (Array.isArray(rec.rowData)) return rec.rowData;
  if (Array.isArray(rec.data)) return rec.data;
  const nested = asRecord(rec.data);
  if (nested) {
    if (Array.isArray(nested.rowData)) return nested.rowData;
    if (Array.isArray(nested.data)) return nested.data;
    if (Array.isArray(nested.jobs)) return nested.jobs;
  }
  if (Array.isArray(rec.jobs)) return rec.jobs;
  return [];
}

function isoDay(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

function taskDueDay(task: Record<string, unknown>): string {
  return isoDay(task.endDate ?? task.endDateTimeCalculated ?? task.baseEndDate);
}

function slimTask(task: unknown) {
  const rec = asRecord(task);
  if (!rec) return null;
  return {
    taskId: rec.taskId,
    jobId: rec.jobId,
    title: rec.title,
    name: rec.name,
    status: rec.status,
    isDeleted: rec.isDeleted,
    endDate: rec.endDate,
    endDateTimeCalculated: rec.endDateTimeCalculated,
    baseEndDate: rec.baseEndDate,
    assignments: (Array.isArray(rec.assignments) ? rec.assignments : [])
      .map((row) => {
        const a = asRecord(row);
        const name = a?.name || a?.fullName || '';
        return name ? { name } : null;
      })
      .filter(Boolean),
  };
}

function isSelectionGreen(status: unknown): boolean {
  const rec = asRecord(status);
  const code = Number(rec?.status);
  return code === 2 || code === 3;
}

function slimSelection(row: unknown) {
  const rec = asRecord(row);
  if (!rec || isSelectionGreen(rec.status)) return null;
  const titleRec = asRecord(rec.title);
  const deadlineRec = asRecord(rec.deadline);
  const statusRec = asRecord(rec.status);
  return {
    id: rec.id,
    title: titleRec ? { title: titleRec.title } : rec.title,
    category: rec.category,
    location: rec.location,
    status: statusRec ? { status: statusRec.status } : rec.status,
    deadline: deadlineRec ? { deadline: deadlineRec.deadline } : rec.deadline,
  };
}

function slimPastDueTasks(tasksEnvelope: unknown, now = new Date()) {
  if (!tasksEnvelope) return { tasks: [] as unknown[] };
  const today = now.toISOString().slice(0, 10);
  const rawTasks = asArray(asRecord(tasksEnvelope)?.tasks ?? tasksEnvelope);
  const tasks = rawTasks
    .map(slimTask)
    .filter((task) => {
      if (!task || task.isDeleted) return false;
      if (Number(task.status) !== 0) return false;
      const due = taskDueDay(task as Record<string, unknown>);
      return Boolean(due && due < today);
    });
  return { tasks, meta: asRecord(tasksEnvelope)?.meta };
}

function slimSelectionsByJob(selectionsByJob: Record<string, unknown[]> | undefined) {
  const out: Record<string, unknown[]> = {};
  for (const [jobId, rows] of Object.entries(selectionsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const pending = rows.map(slimSelection).filter(Boolean);
    if (pending.length) out[jobId] = pending;
  }
  return out;
}

function slimBaselineItem(row: unknown) {
  const rec = asRecord(row);
  if (!rec) return null;
  return {
    title: rec.title,
    endDateSlip: rec.endDateSlip,
    durationSlip: rec.durationSlip,
    expectedStartDate: rec.expectedStartDate,
    actualStartDate: rec.actualStartDate,
    expectedEndDate: rec.expectedEndDate,
    actualEndDate: rec.actualEndDate,
    completed: rec.completed,
  };
}

/** Fields the owner-dashboard mapper + drilldown need; drop bulky schedule/gantt blobs. */
export function slimReportsForStorage(reports: BuildertrendReports, options: { now?: Date } = {}): BuildertrendReports {
  const baselineItemsByJob: Record<string, unknown[]> = {};
  for (const [jobId, rows] of Object.entries(reports.baselineItemsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const slimRows = rows.map(slimBaselineItem).filter(Boolean);
    if (slimRows.length) baselineItemsByJob[jobId] = slimRows;
  }

  return {
    wip: reports.wip,
    dailyLogs: reports.dailyLogs,
    userDailyLogsRecent: reports.userDailyLogsRecent,
    schedulePercentComplete: reports.schedulePercentComplete,
    baselineDuration: reports.baselineDuration,
    leads: reports.leads,
    jobs: reports.jobs,
    leadStatus: reports.leadStatus,
    profitability: reports.profitability,
    changeOrderProfit: reports.changeOrderProfit,
    cashflow: reports.cashflow,
    jobInfoContractByJob: reports.jobInfoContractByJob,
    baselineSlipByJob: reports.baselineSlipByJob,
    tasks: slimPastDueTasks(reports.tasks, options.now),
    selectionsByJob: slimSelectionsByJob(reports.selectionsByJob),
    baselineItemsByJob,
    actionItemsByJob: reports.actionItemsByJob ?? {},
    // Omit scheduleByJob / siteWorkByJob — large gantt payloads; KPIs use dailyLogs + baked snapshot fallbacks.
  };
}

export function slimPullForStorage(pull: StorableLivePull, options: { now?: Date } = {}): StorableLivePull {
  return {
    pulledAt: pull.pulledAt,
    authMethod: pull.authMethod,
    enrichment: pull.enrichment === 'full' ? 'core' : pull.enrichment,
    reports: slimReportsForStorage(pull.reports, options),
  };
}

export function estimatePullBytes(pull: StorableLivePull): number {
  try {
    return new TextEncoder().encode(JSON.stringify(pull)).length;
  } catch {
    return Infinity;
  }
}

/** ~4MB — leave headroom under typical 5MB localStorage cap. */
export const MAX_BROWSER_PULL_BYTES = 4_000_000;

export function priorSmallEnoughToMerge(prior: StorableLivePull | null): boolean {
  if (!prior?.reports) return false;
  return estimatePullBytes(prior) < 1_500_000;
}
