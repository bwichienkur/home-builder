import {
  LIVE_PIPELINE,
  LIVE_TARGET_MARGIN_PCT,
  LIVE_TIME_METRICS,
} from './liveSnapshot';
import { calendarDaysBetween } from './estimatedTimeMetrics';
import type { OwnerJob, OwnerPhase, PipelineStage, SalesPerformanceBar, TimeMetric } from './types';

const DESIGNER = /monique\s+lumley/i;
const TEST_JOB = /tate\s+test\s+job/i;

export type BuildertrendReports = {
  wip?: unknown;
  dailyLogs?: unknown;
  userDailyLogsRecent?: unknown;
  schedulePercentComplete?: unknown;
  leads?: unknown;
  jobs?: unknown;
  jobsites?: unknown;
  leadStatus?: unknown;
  tasks?: unknown;
  actionItemsByJob?: Record<string, unknown>;
  /** Per-job selection rows from POST /api/Selections/Grid (List tab). */
  selectionsByJob?: Record<string, unknown[]>;
  /** jobId → Site Work schedule status from POST /api/Calendar/GanttChart. */
  siteWorkByJob?: Record<
    string,
    { started?: boolean; title?: string; percentComplete?: number; isComplete?: boolean; startDate?: string }
  >;
  /**
   * jobId → schedule milestones from GanttChart (Site Work, Permitting, Foundation, Closing,
   * first item start). Used for status overview, daily-log eligibility, and time metrics.
   */
  scheduleByJob?: Record<
    string,
    {
      firstItemStartDate?: string;
      siteWorkStarted?: boolean | null;
      foundationStarted?: boolean | null;
      currentItem?: { title?: string; percentComplete?: number; startDate?: string; endDate?: string } | null;
      siteWork?: { title?: string; started?: boolean; percentComplete?: number; isComplete?: boolean; startDate?: string; endDate?: string } | null;
      permitting?: { title?: string; startDate?: string; endDate?: string } | null;
      foundation?: { title?: string; startDate?: string; endDate?: string; started?: boolean } | null;
      closing?: { title?: string; startDate?: string; endDate?: string } | null;
    }
  >;
  /** jobId → total endDateSlip from Baseline vs. actual duration by job report. */
  baselineDuration?: unknown;
  /** jobId → Permit / Selections / Construction slip from Schedule → Baseline. */
  baselineSlipByJob?: Record<string, { permit?: number; selections?: number; construction?: number }>;
  /** Profitability report (Open + Closed + Warranty) — revised client price per job. */
  profitability?: unknown;
  /** jobId → contract price from Jobs → Job Info (fallback when not sent to budget). */
  jobInfoContractByJob?: Record<string, number>;
  /** Change order profit report — CO revenue and profit per job. */
  changeOrderProfit?: unknown;
  /**
   * Cash flow report — trailing/leading 7/14/30 inflows & outflows per job.
   * `cashflowType` 1 = Money In (owner draws / receivables), 2 = Money Out.
   */
  cashflow?: unknown;
};

export type MappedBuildertrendPull = {
  jobs: OwnerJob[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceBar[];
  timeMetrics: TimeMetric[];
  targetMarginPct: number;
  projectedMarginPct: number;
  rollingRevenue12Mo: number;
  /** Sum of confidence × estimated revenue min from lead opportunities. */
  weightedPipeline?: number;
};

export function weekdaysElapsedInMonth(now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const last = now.getDate();
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    const weekday = new Date(year, month, day).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  for (const key of ['rowData', 'jobs', 'items', 'data', 'records', 'results']) {
    const inner = rec[key];
    if (Array.isArray(inner)) return inner;
    const nested = asRecord(inner);
    if (nested) {
      for (const innerKey of ['rowData', 'jobs', 'items', 'data', 'records']) {
        if (Array.isArray(nested[innerKey])) return nested[innerKey] as unknown[];
      }
    }
  }
  return [];
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  const rec = asRecord(value);
  if (rec) {
    if (typeof rec.value === 'number') return rec.value;
    if (typeof rec.amount === 'number') return rec.amount;
  }
  return 0;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const rec = asRecord(value);
  if (!rec) return '';
  return str(rec.name ?? rec.title ?? rec.displayName ?? rec.jobName ?? rec.fullName);
}

function pick(rec: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!rec) return undefined;
  for (const key of keys) {
    if (rec[key] != null && rec[key] !== '') return rec[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(rec)) {
      if (k.toLowerCase() === lower && v != null && v !== '') return v;
    }
  }
  return undefined;
}

function isoDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = str(value);
  if (!text || text.startsWith('0001-01-01')) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function sameMonth(iso: string, now: Date) {
  if (!iso) return false;
  const date = new Date(`${iso}T12:00:00`);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function daysBetween(startIso: string, now: Date) {
  if (!startIso) return 0;
  const start = new Date(`${startIso}T12:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / 86_400_000));
}

function slugId(name: string, jobId: unknown) {
  if (jobId != null && String(jobId).trim() && String(jobId) !== '0') return `bt-${String(jobId).trim()}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `bt-${slug || 'job'}`;
}

function namesFrom(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => namesFrom(item)).filter(Boolean);
  const text = str(value);
  if (!text) return [];
  return text
    .split(/\s*(?:,|&|\/|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function pickProjectManager(value: unknown): string {
  const names = namesFrom(value).filter((name) => name && !/^unassigned$/i.test(name));
  const withoutDesigner = names.filter((name) => !DESIGNER.test(name));
  const chosen = (withoutDesigner.length ? withoutDesigner : names)[0];
  return chosen || 'Unassigned';
}

function mapStatus(value: unknown): OwnerJob['status'] {
  const text = str(value).toLowerCase();
  if (text.includes('warrant')) return 'warranty';
  if (text.includes('close') || text.includes('complete') || text === 'closed') return 'closed';
  return 'open';
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function inferPhase(input: {
  siteWorkStarted: boolean | null;
  onWip: boolean;
  pctComplete: number;
  logCount: number;
}): OwnerPhase {
  // Owner rule: Design/Permitting = Site Work not started; Construction = all other open jobs.
  if (input.siteWorkStarted === false) return 'design';
  if (input.siteWorkStarted === true) return 'construction';
  // Fallback when schedule pull is missing (mock / partial caches).
  if (input.pctComplete >= 90) return 'closeout';
  if (input.onWip && input.pctComplete >= 15) return 'construction';
  if (input.onWip) return 'design';
  if (input.logCount <= 0) return 'design';
  if (input.logCount >= 50) return 'construction';
  return 'permitting';
}

function inferCloseDate(input: { completion: string; openedAt: string; pctComplete: number; now: Date }) {
  if (input.completion) return input.completion;
  const today = input.now.toISOString().slice(0, 10);
  if (input.pctComplete >= 90) return addMonths(today, 1);
  if (input.pctComplete > 0) {
    const remaining = Math.max(1, Math.round((100 - input.pctComplete) / 15));
    return addMonths(today, remaining);
  }
  if (input.openedAt) return addMonths(input.openedAt, 6);
  return addMonths(today, 12);
}

function expectedLogs(input: {
  logCount: number;
  lastLogThisMonth: boolean;
  onWip: boolean;
  daysOnJob: number;
  now: Date;
}) {
  if (input.logCount <= 0) return 0;
  const weekdays = weekdaysElapsedInMonth(input.now);
  if (input.lastLogThisMonth && (input.onWip || input.logCount >= 10 || input.daysOnJob > 90)) return weekdays;
  if (input.lastLogThisMonth) return 4;
  if (input.onWip || input.logCount >= 20) return weekdays;
  return 4;
}

type JobDraft = {
  key: string;
  id: string;
  jobId?: number;
  name: string;
  pm: string;
  status: OwnerJob['status'];
  openedAt: string;
  completion: string;
  lastLog: string;
  logCount: number;
  workDays: number;
  contractPrice: number;
  revenueToDate: number;
  /** Trailing 30d Money In from Cash flow report. */
  revenueLast30d: number;
  wip: number;
  changeOrderRevenue: number;
  changeOrderProfit: number;
  pctComplete: number;
  earnedRevenue: number;
  projectedProfit: number;
  onWip: boolean;
  pendingSelections: number;
  pastDueTasks: number;
  dailyLogsRecentDone: number | null;
  /** Logs in the rolling window authored by this job’s assigned PM. */
  dailyLogsRecentPmDone: number | null;
  /** null = no Site Work schedule item (or schedule not pulled). */
  siteWorkStarted: boolean | null;
  /** null = no Foundation schedule item (or schedule not pulled). */
  foundationStarted: boolean | null;
  firstScheduleStart: string;
  permittingEndDate: string;
  foundationStartDate: string;
  closingEndDate: string;
  /** Title of the current in-progress Gantt schedule item (when known). */
  currentScheduleItem: string;
  slip: { permit: number; selections: number; construction: number };
  /** Total end-date slip from Baseline vs. actual duration report. */
  totalSlip: number | null;
  notes: string[];
  /** Set from job picker; blocks other reports from overriding status/jobId. */
  pickerStatus?: OwnerJob['status'];
  pickerJobId?: number;
};

function mergeJob(target: JobDraft, patch: Partial<JobDraft> & { fromPicker?: boolean }) {
  if (patch.name && (!target.name || patch.name.length > target.name.length)) target.name = patch.name;
  if (patch.id && patch.id !== target.id && !target.id.startsWith('bt-')) target.id = patch.id;
  if (patch.pm && patch.pm !== 'Unassigned') target.pm = patch.pm;
  if (patch.fromPicker) {
    if (patch.status) {
      target.pickerStatus = patch.status;
      target.status = patch.status;
    }
    if (patch.jobId != null) {
      target.pickerJobId = patch.jobId;
      target.jobId = patch.jobId;
    }
  } else {
    if (patch.status && target.pickerStatus == null && patch.status !== 'open') target.status = patch.status;
    if (patch.jobId != null && target.pickerJobId == null) target.jobId = patch.jobId;
  }
  if (patch.openedAt && (!target.openedAt || patch.openedAt < target.openedAt)) target.openedAt = patch.openedAt;
  if (patch.completion) target.completion = patch.completion;
  if (patch.lastLog && (!target.lastLog || patch.lastLog > target.lastLog)) target.lastLog = patch.lastLog;
  if ((patch.logCount ?? 0) > target.logCount) target.logCount = patch.logCount ?? 0;
  if ((patch.workDays ?? 0) > target.workDays) target.workDays = patch.workDays ?? 0;
  if (patch.onWip) target.onWip = true;
  if ((patch.contractPrice ?? 0) > 0) target.contractPrice = patch.contractPrice ?? 0;
  if ((patch.revenueToDate ?? 0) > 0) target.revenueToDate = patch.revenueToDate ?? 0;
  if (patch.wip != null && (patch.onWip || patch.wip > 0)) target.wip = patch.wip;
  if ((patch.pctComplete ?? 0) > target.pctComplete) target.pctComplete = patch.pctComplete ?? 0;
  if ((patch.earnedRevenue ?? 0) > 0) target.earnedRevenue = patch.earnedRevenue ?? 0;
  if (patch.projectedProfit != null) target.projectedProfit = patch.projectedProfit;
  if (patch.notes?.length) target.notes.push(...patch.notes);
  if ((patch.pendingSelections ?? 0) > target.pendingSelections) target.pendingSelections = patch.pendingSelections ?? 0;
  if ((patch.pastDueTasks ?? 0) > target.pastDueTasks) target.pastDueTasks = patch.pastDueTasks ?? 0;
  if (patch.dailyLogsRecentDone != null) target.dailyLogsRecentDone = patch.dailyLogsRecentDone;
  if (patch.dailyLogsRecentPmDone != null) target.dailyLogsRecentPmDone = patch.dailyLogsRecentPmDone;
  if (patch.siteWorkStarted != null) target.siteWorkStarted = patch.siteWorkStarted;
  if (patch.foundationStarted != null) target.foundationStarted = patch.foundationStarted;
  if (patch.firstScheduleStart) target.firstScheduleStart = patch.firstScheduleStart;
  if (patch.permittingEndDate) target.permittingEndDate = patch.permittingEndDate;
  if (patch.foundationStartDate) target.foundationStartDate = patch.foundationStartDate;
  if (patch.closingEndDate) target.closingEndDate = patch.closingEndDate;
  if (patch.currentScheduleItem) target.currentScheduleItem = patch.currentScheduleItem;
  if (patch.slip) target.slip = { ...target.slip, ...patch.slip };
  if (patch.totalSlip != null) target.totalSlip = patch.totalSlip;
}

function jobKey(name: string, jobId: unknown) {
  if (jobId != null && String(jobId).trim() && String(jobId) !== '0') return `id:${String(jobId).trim()}`;
  return `name:${name.toLowerCase()}`;
}

function ingest(jobs: Map<string, JobDraft>, row: Record<string, unknown>, kind: 'picker' | 'wip' | 'log' | 'job') {
  const name = str(pick(row, 'jobName', 'name', 'title', 'NewJobName', 'job'));
  if (!name || TEST_JOB.test(name) || /template/i.test(name)) return;
  const jobId = pick(row, 'jobID', 'jobId', 'id', 'jobsiteId');
  const key = jobKey(name, jobId);
  const existing = jobs.get(key) ?? jobs.get(`name:${name.toLowerCase()}`);
  const draft: JobDraft =
    existing ??
    ({
      key,
      id: slugId(name, jobId),
      jobId: num(jobId) || undefined,
      name,
      pm: 'Unassigned',
      status: 'open',
      openedAt: '',
      completion: '',
      lastLog: '',
      logCount: 0,
      workDays: 0,
      contractPrice: 0,
      revenueToDate: 0,
      revenueLast30d: 0,
      wip: 0,
      changeOrderRevenue: 0,
      changeOrderProfit: 0,
      pctComplete: 0,
      earnedRevenue: 0,
      projectedProfit: 0,
      onWip: false,
      pendingSelections: 0,
      pastDueTasks: 0,
      dailyLogsRecentDone: null,
      dailyLogsRecentPmDone: null,
      siteWorkStarted: null,
      foundationStarted: null,
      firstScheduleStart: '',
      permittingEndDate: '',
      foundationStartDate: '',
      closingEndDate: '',
      currentScheduleItem: '',
      slip: { permit: 0, selections: 0, construction: 0 },
      totalSlip: null,
      notes: [],
    } satisfies JobDraft);

  const pm = pickProjectManager(pick(row, 'projectManagers', 'projectManager', 'pm', 'PMs'));
  const status = mapStatus(pick(row, 'jobStatus', 'status'));
  const numericJobId = num(pick(row, 'jobID', 'jobId', 'id', 'jobsiteId')) || undefined;
  const start = isoDate(pick(row, 'actualStartDate', 'startDate', 'projectedStartDate', 'createdDate', 'openedAt', 'dateCreated'));
  const completion = isoDate(pick(row, 'actualCompletionDate', 'completionDate', 'estCloseDate'));
  const lastLog = isoDate(pick(row, 'lastDailyLogDate', 'lastLogDate'));
  const logCount = num(pick(row, 'totalDailyLogEntries', 'dailyLogCount', 'logCount'));
  const workDays = num(pick(row, 'totalWorkDays', 'workDays', 'daysOnJob'));

  if (kind === 'wip') {
    const contract = num(pick(row, 'totalRevisedPrice', 'revisedClientPrice', 'revisedPrice', 'contractPrice'));
    const invoiced = num(pick(row, 'amountInvoiced', 'invoiced', 'revenueToDate'));
    const pct = num(pick(row, 'jobCompletionPercentage', 'percentComplete', 'pctComplete'));
    const earned = num(pick(row, 'earnedRevenue'));
    const profit = num(pick(row, 'projectedProfit'));
    const bits = [
      pct ? `BT ${Math.round(pct)}% complete` : '',
      contract === 0 && invoiced > 0 ? 'BT revised price $0' : '',
      invoiced > contract && contract > 0 ? 'invoiced above revised price' : '',
      invoiced === 0 && contract > 0 ? 'WIP report had no amount invoiced' : '',
    ].filter(Boolean);
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      jobId: numericJobId,
      pm,
      openedAt: start,
      completion,
      contractPrice: contract,
      revenueToDate: invoiced,
      wip: contract,
      pctComplete: pct,
      earnedRevenue: earned,
      projectedProfit: profit,
      onWip: true,
      notes: bits,
    });
  } else if (kind === 'log') {
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      jobId: numericJobId,
      pm,
      status,
      openedAt: start,
      completion,
      lastLog,
      logCount,
      workDays,
      notes: logCount ? [`${logCount} daily logs`] : ['No daily logs'],
    });
  } else if (kind === 'picker') {
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      jobId: numericJobId,
      pm,
      status,
      openedAt: start,
      completion,
      fromPicker: true,
    });
  } else {
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      jobId: numericJobId,
      pm,
      status,
      openedAt: start,
      completion,
    });
  }

  jobs.set(key, draft);
  if (name) jobs.set(`name:${name.toLowerCase()}`, draft);
}

function taskDueIso(task: Record<string, unknown>) {
  return isoDate(pick(task, 'endDate', 'endDateTimeCalculated', 'baseEndDate', 'dueDate'));
}

function isIncompleteTask(task: Record<string, unknown>) {
  // PM → Tasks filter: Status includes “Not completed” (BT status code 0).
  const status = num(pick(task, 'status', 'taskStatus'));
  if (status === 0) return true;
  const label = str(pick(task, 'statusName', 'statusLabel')).toLowerCase();
  return label.includes('not complete') || label.includes('incomplete') || label.includes('open');
}

export function pastDueTasksByJob(reports: BuildertrendReports, now = new Date()) {
  // Due date is before today (matches Tasks list filter “Due date / is before / today’s date”).
  const today = now.toISOString().slice(0, 10);
  const counts = new Map<number, number>();
  for (const row of asArray(asRecord(reports.tasks)?.tasks ?? reports.tasks)) {
    const task = asRecord(row);
    if (!task || task.isDeleted) continue;
    if (!isIncompleteTask(task)) continue;
    const due = taskDueIso(task);
    if (!due || due >= today) continue;
    const jobId = num(pick(task, 'jobId', 'jobID'));
    if (!jobId) continue;
    counts.set(jobId, (counts.get(jobId) ?? 0) + 1);
  }
  return counts;
}

function recentDailyLogsByJob(reports: BuildertrendReports) {
  const counts = new Map<number, number>();
  for (const row of asArray(reports.userDailyLogsRecent)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    const count = num(pick(rec, 'dailyLogCount', 'logCount'));
    if (!jobId) continue;
    counts.set(jobId, (counts.get(jobId) ?? 0) + count);
  }
  return counts;
}

/** Normalize person names for PM ↔ Logged-by matching. */
export function normalizePersonName(name: string) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** jobId → (normalized userName → log count) from the rolling user-daily-logs report. */
export function recentDailyLogsByJobAndUser(reports: BuildertrendReports) {
  const byJob = new Map<number, Map<string, number>>();
  for (const row of asArray(reports.userDailyLogsRecent)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    const user = normalizePersonName(str(pick(rec, 'userName', 'name', 'fullName')));
    const count = num(pick(rec, 'dailyLogCount', 'logCount'));
    if (!jobId || !user) continue;
    const users = byJob.get(jobId) ?? new Map<string, number>();
    users.set(user, (users.get(user) ?? 0) + count);
    byJob.set(jobId, users);
  }
  return byJob;
}

/** BT green (success) tags: Selected (2) and BuilderOverride (3) — UI label "Selected" or "Completed". */
export function isSelectionGreenStatus(status: unknown): boolean {
  const rec = asRecord(status);
  if (!rec) return false;
  const code = num(pick(rec, 'status'));
  return code === 2 || code === 3;
}

/** @deprecated Use isSelectionGreenStatus */
export const isSelectionMarkedSelected = isSelectionGreenStatus;

export function pendingSelectionsByJob(reports: BuildertrendReports) {
  const counts = new Map<number, number>();
  const byJob = reports.selectionsByJob ?? {};
  for (const [jobId, rows] of Object.entries(byJob)) {
    if (!Array.isArray(rows)) continue;
    const pending = rows.filter((row) => !isSelectionGreenStatus(asRecord(row)?.status)).length;
    counts.set(Number(jobId), pending);
  }
  return counts;
}

function scheduleRowsByJob(reports: BuildertrendReports) {
  const rows = new Map<number, { completion: string; pct: number }>();
  for (const row of asArray(reports.schedulePercentComplete)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    if (!jobId) continue;
    rows.set(jobId, {
      completion: isoDate(pick(rec, 'projectedCompletionDate', 'actualCompletionDate')),
      pct: num(pick(rec, 'percentComplete', 'jobCompletionPercentage')),
    });
  }
  return rows;
}

function revisedPriceFromRow(row: Record<string, unknown>): number {
  return num(pick(row, 'revisedClientPrice', 'totalRevisedPrice', 'revisedPrice', 'contractPrice'));
}

function profitabilityRevisedByJob(reports: BuildertrendReports) {
  const byJob = new Map<number, number>();
  for (const row of asArray(reports.profitability)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    if (!jobId) continue;
    const revised = revisedPriceFromRow(rec);
    if (revised > 0) byJob.set(jobId, revised);
  }
  return byJob;
}

/**
 * Expected revenue (contract + change orders):
 * 1. Profitability revised client price (includes COs; Open/Closed/Warranty)
 * 2. Job Info contract price when not yet sent to budget
 * 3. WIP `totalRevisedPrice` when present (open jobs on WIP report)
 * 4. $0 (e.g. design-only contracts like Morris)
 */
export function resolveJobContractPrice(
  jobId: number | undefined,
  reports: BuildertrendReports,
  profitabilityByJob?: Map<number, number>,
): number {
  if (!jobId) return 0;
  const profMap = profitabilityByJob ?? profitabilityRevisedByJob(reports);
  const revised = profMap.get(jobId) ?? 0;
  if (revised > 0) return revised;
  const jobInfo = num(reports.jobInfoContractByJob?.[String(jobId)]);
  if (jobInfo > 0) return jobInfo;
  return 0;
}

function applyContractResolution(jobs: Map<string, JobDraft>, reports: BuildertrendReports) {
  const profMap = profitabilityRevisedByJob(reports);
  for (const draft of jobs.values()) {
    const wipContract = draft.contractPrice;
    let resolved = resolveJobContractPrice(draft.jobId, reports, profMap);
    if (resolved <= 0 && wipContract > 0) resolved = wipContract;
    draft.contractPrice = resolved;
    draft.wip = draft.status === 'open' ? resolved : 0;
  }
}

function baselineTotalSlipByJob(reports: BuildertrendReports) {
  const byJob = new Map<number, number>();
  for (const row of asArray(reports.baselineDuration)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    if (!jobId) continue;
    byJob.set(jobId, Math.round(num(pick(rec, 'endDateSlip'))));
  }
  return byJob;
}

function changeOrderByJob(reports: BuildertrendReports) {
  const byJob = new Map<number, { revenue: number; profit: number }>();
  for (const row of asArray(reports.changeOrderProfit)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const name = str(pick(rec, 'jobName', 'name'));
    if (TEST_JOB.test(name) || /template/i.test(name)) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    if (!jobId) continue;
    byJob.set(jobId, {
      revenue: num(pick(rec, 'price', 'changeOrderPrice', 'revenue')),
      profit: num(pick(rec, 'profit', 'changeOrderProfit')),
    });
  }
  return byJob;
}

/** BT Cash flow Money In (`cashflowType` 1) trailing-30-day total per job. */
function cashflowMoneyInLast30dByJob(reports: BuildertrendReports) {
  const byJob = new Map<number, number>();
  for (const row of asArray(reports.cashflow)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const cashflowType = num(pick(rec, 'cashflowType', 'cashFlowType', 'type'));
    // 1 = Money In (owner draws / receivables); 2 = Money Out (payables).
    if (cashflowType !== 1) continue;
    const name = str(pick(rec, 'jobName', 'name'));
    if (TEST_JOB.test(name) || /template/i.test(name)) continue;
    const jobId = num(pick(rec, 'jobID', 'jobId'));
    if (!jobId) continue;
    const cumulative = pick(rec, 'trailing30Cumulative', 'trailingThirtyCumulative');
    const amount =
      cumulative != null
        ? num(cumulative)
        : num(pick(rec, 'trailing30')) + num(pick(rec, 'trailing14')) + num(pick(rec, 'trailing7'));
    byJob.set(jobId, amount);
  }
  return byJob;
}

/** Open-job change order revenue and portfolio profit % from the BT Change order profit report. */
export function openChangeOrderMetrics(jobs: Iterable<JobDraft | OwnerJob>) {
  let revenue = 0;
  let profit = 0;
  for (const job of jobs) {
    if (job.status !== 'open') continue;
    revenue += job.changeOrderRevenue ?? 0;
    profit += job.changeOrderProfit ?? 0;
  }
  const profitPct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  return { revenue, profitPct };
}

function applyJobEnrichment(jobs: Map<string, JobDraft>, reports: BuildertrendReports, now: Date) {
  const recent = recentDailyLogsByJob(reports);
  const recentByUser = recentDailyLogsByJobAndUser(reports);
  const pastDue = pastDueTasksByJob(reports, now);
  const selections = pendingSelectionsByJob(reports);
  const schedule = scheduleRowsByJob(reports);
  const scheduleByJob = reports.scheduleByJob ?? {};
  const siteWork = reports.siteWorkByJob ?? {};
  const baselineSlip = reports.baselineSlipByJob ?? {};
  const totalSlipByJob = baselineTotalSlipByJob(reports);
  const changeOrders = changeOrderByJob(reports);
  const revenueLast30d = cashflowMoneyInLast30dByJob(reports);
  for (const draft of jobs.values()) {
    if (!draft.jobId) continue;
    if (recent.has(draft.jobId)) draft.dailyLogsRecentDone = recent.get(draft.jobId)!;
    const pmKey = normalizePersonName(draft.pm);
    if (pmKey && recentByUser.has(draft.jobId)) {
      draft.dailyLogsRecentPmDone = recentByUser.get(draft.jobId)!.get(pmKey) ?? 0;
    }
    if (pastDue.has(draft.jobId)) draft.pastDueTasks = pastDue.get(draft.jobId)!;
    if (selections.has(draft.jobId)) draft.pendingSelections = selections.get(draft.jobId)!;
    const sched = schedule.get(draft.jobId);
    if (sched) {
      if (sched.completion) draft.completion = sched.completion;
      if (sched.pct > 0) draft.pctComplete = Math.max(draft.pctComplete, sched.pct);
    }
    const milestones = scheduleByJob[String(draft.jobId)];
    if (milestones) {
      if (typeof milestones.siteWorkStarted === 'boolean') draft.siteWorkStarted = milestones.siteWorkStarted;
      else if (milestones.siteWork && typeof milestones.siteWork.started === 'boolean') {
        draft.siteWorkStarted = milestones.siteWork.started;
      }
      if (typeof milestones.foundationStarted === 'boolean') draft.foundationStarted = milestones.foundationStarted;
      if (milestones.firstItemStartDate) draft.firstScheduleStart = milestones.firstItemStartDate;
      if (milestones.permitting?.endDate) draft.permittingEndDate = milestones.permitting.endDate;
      if (milestones.foundation?.startDate) draft.foundationStartDate = milestones.foundation.startDate;
      if (milestones.closing?.endDate) draft.closingEndDate = milestones.closing.endDate;
      if (milestones.currentItem?.title) draft.currentScheduleItem = String(milestones.currentItem.title).trim();
    } else {
      const sw = siteWork[String(draft.jobId)];
      if (sw && typeof sw.started === 'boolean') draft.siteWorkStarted = sw.started;
    }
    const slipRow = baselineSlip[String(draft.jobId)];
    if (slipRow) {
      draft.slip = {
        permit: Math.round(Number(slipRow.permit) || 0),
        selections: Math.round(Number(slipRow.selections) || 0),
        construction: Math.round(Number(slipRow.construction) || 0),
      };
    }
    if (totalSlipByJob.has(draft.jobId)) draft.totalSlip = totalSlipByJob.get(draft.jobId)!;
    const co = changeOrders.get(draft.jobId);
    if (co) {
      draft.changeOrderRevenue = co.revenue;
      draft.changeOrderProfit = co.profit;
    }
    if (revenueLast30d.has(draft.jobId)) draft.revenueLast30d = revenueLast30d.get(draft.jobId)!;
  }
}

function ingestSchedule(jobs: Map<string, JobDraft>, row: Record<string, unknown>) {
  const name = str(pick(row, 'jobName', 'name', 'title', 'NewJobName', 'job'));
  if (!name || TEST_JOB.test(name) || /template/i.test(name)) return;
  const jobId = pick(row, 'jobID', 'jobId', 'id', 'jobsiteId');
  const key = jobKey(name, jobId);
  const existing = jobs.get(key) ?? jobs.get(`name:${name.toLowerCase()}`);
  const draft: JobDraft =
    existing ??
    ({
      key,
      id: slugId(name, jobId),
      jobId: num(jobId) || undefined,
      name,
      pm: pickProjectManager(pick(row, 'projectManagers', 'projectManager', 'pm', 'PMs')),
      status: mapStatus(pick(row, 'jobStatus', 'status')),
      openedAt: '',
      completion: isoDate(pick(row, 'projectedCompletionDate', 'actualCompletionDate')),
      lastLog: '',
      logCount: 0,
      workDays: 0,
      contractPrice: 0,
      revenueToDate: 0,
      revenueLast30d: 0,
      wip: 0,
      changeOrderRevenue: 0,
      changeOrderProfit: 0,
      pctComplete: num(pick(row, 'percentComplete', 'jobCompletionPercentage')),
      earnedRevenue: 0,
      projectedProfit: 0,
      onWip: false,
      pendingSelections: 0,
      pastDueTasks: 0,
      dailyLogsRecentDone: null,
      dailyLogsRecentPmDone: null,
      siteWorkStarted: null,
      foundationStarted: null,
      firstScheduleStart: '',
      permittingEndDate: '',
      foundationStartDate: '',
      closingEndDate: '',
      currentScheduleItem: '',
      slip: { permit: 0, selections: 0, construction: 0 },
      totalSlip: null,
      notes: [],
    } satisfies JobDraft);
  mergeJob(draft, {
    name,
    id: slugId(name, jobId),
    jobId: num(jobId) || undefined,
    pm: pickProjectManager(pick(row, 'projectManagers', 'projectManager', 'pm', 'PMs')),
    completion: isoDate(pick(row, 'projectedCompletionDate', 'actualCompletionDate')),
    pctComplete: num(pick(row, 'percentComplete', 'jobCompletionPercentage')),
  });
  jobs.set(key, draft);
  if (name) jobs.set(`name:${name.toLowerCase()}`, draft);
}

/** Lead Opportunities rows: confidence × estimatedRevenueMin (Sales → Lead Opportunities). */
function leadOpportunityRows(reports: BuildertrendReports) {
  const fromLeads = asArray(reports.leads);
  // Prefer nested Lead Opportunities grid rows when present.
  const nested = asRecord(reports.leads);
  const nestedRows = nested ? asArray(nested.data) : [];
  const rows = nestedRows.length ? nestedRows : fromLeads;
  return rows
    .map((row) => asRecord(row))
    .filter((rec): rec is Record<string, unknown> => Boolean(rec && (pick(rec, 'estimatedRevenueMin', 'confidence') != null || pick(rec, 'opportunityTitle', 'id'))));
}

function isOpenLeadOpportunity(rec: Record<string, unknown>) {
  const statusRaw = pick(rec, 'leadStatus', 'status', 'stage');
  if (typeof statusRaw === 'number') {
    // BT Lead Opportunities: 0 = Open (matches List view “Open”).
    return statusRaw === 0;
  }
  const status = str(statusRaw).toLowerCase();
  if (!status) return true;
  if (status.includes('lost') || status.includes('no opp') || status.includes('sold') || status.includes('closed')) return false;
  return status.includes('open') || status === '0';
}

export function weightedLeadPipeline(reports: BuildertrendReports) {
  let weighted = 0;
  let rawLead = 0;
  for (const rec of leadOpportunityRows(reports)) {
    if (!isOpenLeadOpportunity(rec)) continue;
    const min = num(pick(rec, 'estimatedRevenueMin', 'estimatedRevenue', 'amount', 'value'));
    const confidenceRaw = num(pick(rec, 'confidence', 'confidencePct', 'confidencePercentage'));
    const confidence = confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw;
    rawLead += min;
    if (min > 0 && confidence > 0) weighted += min * confidence;
  }
  return { weighted, rawLead };
}

function toOwnerJob(draft: JobDraft, now: Date): OwnerJob {
  const openedAt = draft.openedAt || draft.lastLog || now.toISOString().slice(0, 10);
  const phase = inferPhase({
    siteWorkStarted: draft.siteWorkStarted,
    onWip: draft.onWip,
    pctComplete: draft.pctComplete,
    logCount: draft.logCount,
  });
  return {
    id: draft.id,
    name: draft.name,
    pm: draft.pm,
    status: draft.status,
    phase,
    pendingSelections: draft.pendingSelections,
    pastDueTasks: draft.pastDueTasks,
    dailyLogsTotal: draft.logCount || undefined,
    dailyLogsRecentDone: draft.dailyLogsRecentDone,
    dailyLogsRecentPmDone: draft.dailyLogsRecentPmDone,
    foundationStarted: draft.foundationStarted,
    contractPrice: draft.contractPrice,
    revenueToDate: draft.revenueToDate,
    revenueLast30d: draft.revenueLast30d,
    wip: draft.wip,
    changeOrderRevenue: draft.changeOrderRevenue || undefined,
    changeOrderProfit: draft.changeOrderProfit || undefined,
    estCloseDate: inferCloseDate({
      completion: draft.completion,
      openedAt,
      pctComplete: draft.pctComplete,
      now,
    }),
    estFirstScheduleStart: draft.firstScheduleStart || undefined,
    estPermittingEnd: draft.permittingEndDate || undefined,
    estFoundationStart: draft.foundationStartDate || undefined,
    estClosingEnd: draft.closingEndDate || undefined,
    openedAt,
    slip: draft.slip,
    totalSlip: draft.totalSlip ?? undefined,
    notes: draft.currentScheduleItem || '',
  };
}

function calendarDaysBetweenLocal(start: string, end: string): number | null {
  return calendarDaysBetween(start, end);
}

function averageDays(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
}

/**
 * Closed + Warranty only.
 * Contract→close: first schedule item start → Closing end.
 * Permit→close: Permitting end → Closing end.
 * Slab→close: Foundation start → Closing end.
 */
function timeMetricsFrom(jobs: JobDraft[], fallback: TimeMetric[]): TimeMetric[] {
  const closed = jobs.filter((job) => job.status === 'closed' || job.status === 'warranty');
  const contract: number[] = [];
  const permit: number[] = [];
  const slab: number[] = [];
  for (const job of closed) {
    if (!job.closingEndDate) continue;
    const contractDays = calendarDaysBetweenLocal(job.firstScheduleStart, job.closingEndDate);
    if (contractDays != null && contractDays >= 0) contract.push(contractDays);
    const permitDays = calendarDaysBetweenLocal(job.permittingEndDate, job.closingEndDate);
    if (permitDays != null && permitDays >= 0) permit.push(permitDays);
    const slabDays = calendarDaysBetweenLocal(job.foundationStartDate, job.closingEndDate);
    if (slabDays != null && slabDays >= 0) slab.push(slabDays);
  }
  const fallbackById = Object.fromEntries(fallback.map((row) => [row.id, row]));
  return [
    {
      id: 'contract-close',
      label: 'Contract to Close',
      days: averageDays(contract) ?? fallbackById['contract-close']?.days ?? 0,
      deltaDays: 0,
    },
    {
      id: 'permit-close',
      label: 'Permit to Close',
      days: averageDays(permit) ?? fallbackById['permit-close']?.days ?? 0,
      deltaDays: 0,
    },
    {
      id: 'slab-close',
      label: 'Slab Pour to Close',
      days: averageDays(slab) ?? fallbackById['slab-close']?.days ?? 0,
      deltaDays: 0,
    },
  ];
}

/** Map read-only Buildertrend report JSON into owner-dashboard jobs. Selections/to-dos/slip stay 0 when those lists are absent. */
export function mapBuildertrendReports(
  reports: BuildertrendReports,
  options?: { now?: Date; fallbackPipeline?: PipelineStage[] },
): MappedBuildertrendPull {
  const now = options?.now ?? new Date();
  const jobs = new Map<string, JobDraft>();
  for (const row of asArray(reports.jobs)) ingest(jobs, asRecord(row) ?? {}, 'picker');
  for (const row of asArray(reports.jobsites)) ingest(jobs, asRecord(row) ?? {}, 'job');
  for (const row of asArray(reports.dailyLogs)) ingest(jobs, asRecord(row) ?? {}, 'log');
  for (const row of asArray(reports.wip)) ingest(jobs, asRecord(row) ?? {}, 'wip');
  for (const row of asArray(reports.profitability)) ingest(jobs, asRecord(row) ?? {}, 'job');
  for (const row of asArray(reports.schedulePercentComplete)) ingestSchedule(jobs, asRecord(row) ?? {});

  applyJobEnrichment(jobs, reports, now);
  applyContractResolution(jobs, reports);
  const unique = [...new Map([...jobs.values()].map((job) => [job.name.toLowerCase(), job])).values()];
  const schedulePulled =
    Object.keys(reports.scheduleByJob ?? {}).length > 0 || Object.keys(reports.siteWorkByJob ?? {}).length > 0;
  // When Site Work schedule data is present, omit open jobs that have no Site Work item
  // (e.g. scratch jobs) so status overview matches owner active-job counts.
  const forDashboard = schedulePulled
    ? unique.filter((job) => job.status !== 'open' || job.siteWorkStarted != null)
    : unique;
  const ownerJobs = forDashboard.map((job) => toOwnerJob(job, now)).sort((a, b) => a.name.localeCompare(b.name));

  const wipJobs = forDashboard.filter((job) => job.onWip);
  const totalRevised = wipJobs.reduce((sum, job) => sum + job.contractPrice, 0);
  const totalProfit = wipJobs.reduce((sum, job) => sum + job.projectedProfit, 0);
  const rolling = wipJobs.reduce((sum, job) => sum + job.earnedRevenue, 0);
  const totalWip = ownerJobs.filter((job) => job.status === 'open').reduce((sum, job) => sum + job.wip, 0);
  const soon = addMonths(now.toISOString().slice(0, 10), 3);
  const projectedClosings = ownerJobs
    .filter((job) => job.status === 'open' && job.estCloseDate && job.estCloseDate <= soon)
    .reduce((sum, job) => sum + job.wip, 0);
  const { weighted: weightedLead, rawLead } = weightedLeadPipeline(reports);
  const pipeline =
    rawLead > 0
      ? [
          { id: 'lead', label: 'Lead', value: rawLead },
          { id: 'proposal', label: 'Proposal', value: 0 },
          { id: 'pre-contract', label: 'Pre-Contract', value: 0 },
          { id: 'contract', label: 'Contract', value: 0 },
          { id: 'closed', label: 'Closed / Won', value: 0 },
        ]
      : (options?.fallbackPipeline ?? LIVE_PIPELINE);

  return {
    jobs: ownerJobs,
    pipeline,
    weightedPipeline: weightedLead || undefined,
    salesPerformance: [
      { id: 'backlog', label: 'Signed Backlog', value: totalWip },
      { id: 'closings', label: 'Projected Closings', value: projectedClosings || totalWip },
      { id: 'signing', label: 'Expected Signing Value', value: pipeline[0]?.value ?? 0 },
    ],
    timeMetrics: timeMetricsFrom(forDashboard, LIVE_TIME_METRICS),
    targetMarginPct: LIVE_TARGET_MARGIN_PCT,
    projectedMarginPct: totalRevised > 0 ? Math.round((totalProfit / totalRevised) * 1000) / 10 : 0,
    rollingRevenue12Mo: rolling,
  };
}
