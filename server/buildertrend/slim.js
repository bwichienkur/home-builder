/**
 * Shrink Buildertrend report payloads for Vercel API responses.
 * Raw pulls are ~100MB (tasks alone ~50MB); serverless response limits are ~4.5MB.
 */

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.tasks)) return value.tasks;
    if (Array.isArray(value.data)) return value.data;
  }
  return [];
}

function isoDay(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

function taskDueDay(task) {
  return isoDay(task.endDate ?? task.endDateTimeCalculated ?? task.baseEndDate);
}

function slimAssignment(row) {
  const rec = asRecord(row);
  if (!rec) return null;
  const name = rec.name || rec.fullName || '';
  return name ? { name } : null;
}

function slimTask(task) {
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
      .map(slimAssignment)
      .filter(Boolean),
  };
}

function selectionStatusCode(status) {
  const rec = asRecord(status);
  if (!rec) return null;
  return rec.status;
}

function isSelectionGreen(status) {
  const code = Number(selectionStatusCode(status));
  return code === 2 || code === 3;
}

function slimSelection(row) {
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

function slimBaselineItem(row) {
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

/**
 * @param {Record<string, unknown>} reports
 * @param {{ now?: Date }} [options]
 */
export function slimReportsForClient(reports, options = {}) {
  if (!reports || typeof reports !== 'object') return reports;
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  const rawTasks = asArray(asRecord(reports.tasks)?.tasks ?? reports.tasks);
  const pastDueTasks = rawTasks
    .map(slimTask)
    .filter((task) => {
      if (!task || task.isDeleted) return false;
      if (Number(task.status) !== 0) return false;
      const due = taskDueDay(task);
      return Boolean(due && due < today);
    });

  const selectionsByJob = {};
  for (const [jobId, rows] of Object.entries(reports.selectionsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const pending = rows.map(slimSelection).filter(Boolean);
    if (pending.length) selectionsByJob[jobId] = pending;
  }

  const baselineItemsByJob = {};
  for (const [jobId, rows] of Object.entries(reports.baselineItemsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const slimRows = rows.map(slimBaselineItem).filter(Boolean);
    if (slimRows.length) baselineItemsByJob[jobId] = slimRows;
  }

  return {
    ...reports,
    tasks: { tasks: pastDueTasks },
    selectionsByJob,
    baselineItemsByJob,
    // Drop bulky unused bags when present on the tasks envelope.
    actionItemsByJob: reports.actionItemsByJob ?? {},
  };
}

export function estimateJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/** Vercel serverless response bodies should stay under ~4.5MB. */
export const MAX_CLIENT_PAYLOAD_BYTES = 4_000_000;
