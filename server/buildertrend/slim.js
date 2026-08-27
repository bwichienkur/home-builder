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
    if (Array.isArray(value.rowData)) return value.rowData;
    if (Array.isArray(value.data)) return value.data;
    const nested = asRecord(value.data);
    if (nested) {
      if (Array.isArray(nested.rowData)) return nested.rowData;
      if (Array.isArray(nested.data)) return nested.data;
      if (Array.isArray(nested.jobs)) return nested.jobs;
    }
    if (Array.isArray(value.jobs)) return value.jobs;
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
 * Keep only fields the owner-dashboard mapper needs from bulk report rows.
 * Call immediately after each BT fetch so the raw payload can be GC'd.
 */
export function slimCoreReportRows(kind, payload) {
  const rows = asArray(payload);
  switch (kind) {
    case 'jobs': {
      const root = asRecord(payload);
      const nested = asRecord(root?.data);
      const list = Array.isArray(nested?.jobs)
        ? nested.jobs
        : Array.isArray(root?.jobs)
          ? root.jobs
          : rows;
      return {
        data: {
          jobs: list
            .map((row) => {
              const rec = asRecord(row);
              if (!rec) return null;
              return {
                jobID: rec.jobID ?? rec.jobId,
                jobName: rec.jobName ?? rec.name,
                jobStatus: rec.jobStatus,
                projectManagers: rec.projectManagers ?? rec.projectManager,
              };
            })
            .filter(Boolean),
        },
      };
    }
    case 'wip':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          jobName: rec.jobName ?? rec.name,
          jobStatus: rec.jobStatus,
          projectManagers: rec.projectManagers ?? rec.projectManager,
          contractPrice: rec.contractPrice ?? rec.revisedContractPrice,
          amountInvoiced: rec.amountInvoiced,
          percentComplete: rec.percentComplete,
          earnedRevenue: rec.earnedRevenue,
          projectedMargin: rec.projectedMargin,
          amountRemaining: rec.amountRemaining,
        };
      }).filter(Boolean);
    case 'profitability':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          jobName: rec.jobName ?? rec.name,
          jobStatus: rec.jobStatus,
          revisedClientPrice: rec.revisedClientPrice ?? rec.revisedContractPrice ?? rec.contractPrice,
          contractPrice: rec.contractPrice,
          projectManagers: rec.projectManagers ?? rec.projectManager,
        };
      }).filter(Boolean);
    case 'changeOrderProfit':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          jobName: rec.jobName ?? rec.name,
          price: rec.price ?? rec.changeOrderPrice ?? rec.revenue,
          profit: rec.profit ?? rec.changeOrderProfit,
        };
      }).filter(Boolean);
    case 'dailyLogs':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          jobName: rec.jobName ?? rec.name,
          jobStatus: rec.jobStatus,
          dailyLogCount: rec.dailyLogCount ?? rec.logCount,
          openedDate: rec.openedDate ?? rec.openDate ?? rec.jobOpenedDate,
          projectManagers: rec.projectManagers ?? rec.projectManager,
        };
      }).filter(Boolean);
    case 'schedulePercentComplete':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          jobName: rec.jobName ?? rec.name,
          jobStatus: rec.jobStatus,
          projectedCompletionDate: rec.projectedCompletionDate ?? rec.actualCompletionDate,
          percentComplete: rec.percentComplete ?? rec.jobCompletionPercentage,
        };
      }).filter(Boolean);
    case 'baselineDuration':
      return rows.map((row) => {
        const rec = asRecord(row);
        if (!rec) return null;
        return {
          jobID: rec.jobID ?? rec.jobId,
          endDateSlip: rec.endDateSlip,
        };
      }).filter(Boolean);
    default:
      return payload;
  }
}

export function slimPastDueTasksFromEnvelope(tasksEnvelope, options = {}) {
  if (!tasksEnvelope) return { tasks: [] };
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  const rawTasks = asArray(asRecord(tasksEnvelope)?.tasks ?? tasksEnvelope);
  const pastDueTasks = rawTasks
    .map(slimTask)
    .filter((task) => {
      if (!task || task.isDeleted) return false;
      if (Number(task.status) !== 0) return false;
      const due = taskDueDay(task);
      return Boolean(due && due < today);
    });
  return {
    tasks: pastDueTasks,
    meta: asRecord(tasksEnvelope)?.meta,
  };
}

export function slimSelectionsByJob(selectionsByJob) {
  const out = {};
  for (const [jobId, rows] of Object.entries(selectionsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const pending = rows.map(slimSelection).filter(Boolean);
    if (pending.length) out[jobId] = pending;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} reports
 * @param {{ now?: Date }} [options]
 */
export function slimReportsForClient(reports, options = {}) {
  if (!reports || typeof reports !== 'object') return reports;
  const pastDueEnvelope = slimPastDueTasksFromEnvelope(reports.tasks, options);

  const baselineItemsByJob = {};
  for (const [jobId, rows] of Object.entries(reports.baselineItemsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const slimRows = rows.map(slimBaselineItem).filter(Boolean);
    if (slimRows.length) baselineItemsByJob[jobId] = slimRows;
  }

  return {
    ...reports,
    tasks: pastDueEnvelope,
    selectionsByJob: slimSelectionsByJob(reports.selectionsByJob),
    baselineItemsByJob,
    actionItemsByJob: reports.actionItemsByJob ?? {},
  };
}

export function estimateJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/** Vercel serverless response bodies should stay under ~4.5MB. */
export const MAX_CLIENT_PAYLOAD_BYTES = 4_000_000;
