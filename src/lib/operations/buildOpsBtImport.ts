/** Build Ops-only BT import from a full local `data/buildertrend-cache.json` reports object. */

import type { OpsBtImport, OpsBtImportLogAggregate, OpsBtImportTask } from './opsBtImportTypes';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown) {
  return value == null ? '' : String(value);
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: unknown) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function assignedTo(task: Record<string, unknown>) {
  const assignments = Array.isArray(task.assignments) ? task.assignments : [];
  return assignments
    .map((a) => {
      const rec = asRecord(a);
      return str(rec?.name ?? rec?.fullName);
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Compact all incomplete tasks + rolling log aggregates for Operations seed.
 * Does not include Home KPI jobs or past-due-only filtering used by LIVE_DRILLDOWN.
 */
export function buildOpsBtImport(input: {
  reports: unknown;
  pulledAt: string;
  now?: Date;
}): OpsBtImport {
  const now = input.now ?? new Date(input.pulledAt);
  const today = now.toISOString().slice(0, 10);
  const bt = asRecord(input.reports) ?? {};

  const tasksByJobId: Record<string, OpsBtImportTask[]> = {};
  let incompleteTaskCount = 0;
  let pastDueTaskCount = 0;

  for (const row of asArray(asRecord(bt.tasks)?.tasks ?? bt.tasks)) {
    const task = asRecord(row);
    if (!task || task.isDeleted) continue;
    if (num(task.status) !== 0) continue;
    const jobId = num(task.jobId ?? task.jobID);
    if (!jobId) continue;
    const dueDate = isoDate(task.endDate ?? task.endDateTimeCalculated ?? task.baseEndDate);
    const startDate = isoDate(task.startDate ?? task.startDateTimeCalculated ?? task.baseStartDate);
    const note = str(task.descriptionPlainText).trim().slice(0, 400) || undefined;
    const compact: OpsBtImportTask = {
      taskId: num(task.taskId ?? task.id),
      jobId,
      title: str(task.title ?? task.name) || `Task ${task.taskId ?? task.id}`,
      assignee: assignedTo(task),
      dueDate,
      ...(startDate ? { startDate } : {}),
      ...(note ? { note } : {}),
    };
    const key = String(jobId);
    const list = tasksByJobId[key] ?? (tasksByJobId[key] = []);
    list.push(compact);
    incompleteTaskCount += 1;
    if (dueDate && dueDate < today) pastDueTaskCount += 1;
  }

  const logsByJobId: Record<string, OpsBtImportLogAggregate[]> = {};
  let logAggregateRows = 0;
  const udl = asRecord(bt.userDailyLogsRecent);
  const logRows = asArray(udl?.rowData ?? bt.userDailyLogsRecent);
  for (const row of logRows) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(rec.jobID ?? rec.jobId);
    if (!jobId) continue;
    const key = String(jobId);
    const list = logsByJobId[key] ?? (logsByJobId[key] = []);
    list.push({
      jobId,
      jobName: str(rec.jobName),
      userName: str(rec.userName),
      dailyLogCount: num(rec.dailyLogCount ?? rec.logCount),
      lastLogDate: isoDate(rec.lastLogDate),
    });
    logAggregateRows += 1;
  }

  return {
    generatedAt: input.pulledAt,
    tasksByJobId,
    logsByJobId,
    meta: {
      incompleteTaskCount,
      pastDueTaskCount,
      logAggregateRows,
      logBodiesUnavailable: true,
    },
  };
}
