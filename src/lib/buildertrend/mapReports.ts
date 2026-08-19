import {
  LIVE_PIPELINE,
  LIVE_TARGET_MARGIN_PCT,
  LIVE_TIME_METRICS,
} from './liveSnapshot';
import type { OwnerJob, OwnerPhase, PipelineStage, SalesPerformanceBar, TimeMetric } from './types';

const DESIGNER = /monique\s+lumley/i;
const TEST_JOB = /tate\s+test\s+job/i;

export type BuildertrendReports = {
  wip?: unknown;
  dailyLogs?: unknown;
  leads?: unknown;
  jobs?: unknown;
  jobsites?: unknown;
  leadStatus?: unknown;
};

export type MappedBuildertrendPull = {
  jobs: OwnerJob[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceBar[];
  timeMetrics: TimeMetric[];
  targetMarginPct: number;
  projectedMarginPct: number;
  rollingRevenue12Mo: number;
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
  onWip: boolean;
  pctComplete: number;
  logCount: number;
}): OwnerPhase {
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
  wip: number;
  pctComplete: number;
  earnedRevenue: number;
  projectedProfit: number;
  onWip: boolean;
  notes: string[];
};

function mergeJob(target: JobDraft, patch: Partial<JobDraft>) {
  if (patch.name && (!target.name || patch.name.length > target.name.length)) target.name = patch.name;
  if (patch.id && patch.id !== target.id && !target.id.startsWith('bt-')) target.id = patch.id;
  if (patch.pm && patch.pm !== 'Unassigned') target.pm = patch.pm;
  if (patch.status && patch.status !== 'open') target.status = patch.status;
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
}

function jobKey(name: string, jobId: unknown) {
  if (jobId != null && String(jobId).trim() && String(jobId) !== '0') return `id:${String(jobId).trim()}`;
  return `name:${name.toLowerCase()}`;
}

function ingest(jobs: Map<string, JobDraft>, row: Record<string, unknown>, kind: 'wip' | 'log' | 'job') {
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
      wip: 0,
      pctComplete: 0,
      earnedRevenue: 0,
      projectedProfit: 0,
      onWip: false,
      notes: [],
    } satisfies JobDraft);

  const pm = pickProjectManager(pick(row, 'projectManagers', 'projectManager', 'pm', 'PMs'));
  const status = mapStatus(pick(row, 'jobStatus', 'status'));
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
    const remaining = Math.max(0, contract - invoiced);
    const bits = [
      pct ? `BT ${Math.round(pct)}% complete` : '',
      contract === 0 && invoiced > 0 ? 'BT revised price $0' : '',
      invoiced > contract && contract > 0 ? 'invoiced above revised price' : '',
      invoiced === 0 && contract > 0 ? 'WIP report had no amount invoiced' : '',
    ].filter(Boolean);
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      pm,
      status,
      openedAt: start,
      completion,
      contractPrice: contract,
      revenueToDate: invoiced,
      wip: remaining,
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
      pm,
      status,
      openedAt: start,
      completion,
      lastLog,
      logCount,
      workDays,
      notes: logCount ? [`${logCount} daily logs`] : ['No daily logs'],
    });
  } else {
    mergeJob(draft, {
      name,
      id: slugId(name, jobId),
      pm,
      status,
      openedAt: start,
      completion,
    });
  }

  jobs.set(key, draft);
  if (name) jobs.set(`name:${name.toLowerCase()}`, draft);
}

function leadDollars(reports: BuildertrendReports): number {
  const rows = [...asArray(reports.leads), ...asArray(reports.leadStatus)];
  let total = 0;
  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec) continue;
    const status = str(pick(rec, 'status', 'leadStatus', 'stage')).toLowerCase();
    if (status.includes('lost') || status.includes('no opp')) continue;
    const amount =
      num(pick(rec, 'estimatedRevenueMax', 'estimatedRevenue', 'estimatedRevenueMin', 'amount', 'value', 'opportunityValue')) ||
      num(asRecord(pick(rec, 'estimatedRevenue')));
    total += amount;
  }
  return total;
}

function toOwnerJob(draft: JobDraft, now: Date): OwnerJob {
  const openedAt = draft.openedAt || draft.lastLog || now.toISOString().slice(0, 10);
  const lastLogThisMonth = sameMonth(draft.lastLog, now);
  const daysOnJob = draft.workDays || daysBetween(openedAt, now);
  const phase = inferPhase({ onWip: draft.onWip, pctComplete: draft.pctComplete, logCount: draft.logCount });
  const expected = expectedLogs({
    logCount: draft.logCount,
    lastLogThisMonth,
    onWip: draft.onWip,
    daysOnJob,
    now,
  });
  const notes = [...new Set(draft.notes.filter(Boolean))];
  if (!draft.onWip) notes.unshift('Not on WIP report');
  if (lastLogThisMonth) notes.push(`Last daily log this month (${draft.lastLog})`);
  else if (draft.lastLog) notes.push(`Last daily log ${draft.lastLog}`);
  if (draft.pm !== 'Unassigned' && DESIGNER.test(String(draft.notes))) {
    notes.push('Designer Monique Lumley also on the job.');
  }
  return {
    id: draft.id,
    name: draft.name,
    pm: draft.pm,
    status: draft.status,
    phase,
    pendingSelections: 0,
    pastDueTasks: 0,
    dailyLogsThisMonth: lastLogThisMonth ? 1 : 0,
    dailyLogsExpected: expected,
    contractPrice: draft.contractPrice,
    revenueToDate: draft.revenueToDate,
    wip: draft.onWip ? draft.wip : 0,
    estCloseDate: inferCloseDate({
      completion: draft.completion,
      openedAt,
      pctComplete: draft.pctComplete,
      now,
    }),
    openedAt,
    slip: { permit: 0, selections: 0, purchasing: 0, construction: 0 },
    notes: notes.join(' · '),
  };
}

function timeMetricsFrom(jobs: JobDraft[], fallback: TimeMetric[]): TimeMetric[] {
  const days = jobs.map((job) => job.workDays).filter((value) => value > 0);
  if (!days.length) return fallback;
  const avg = Math.round(days.reduce((sum, n) => sum + n, 0) / days.length);
  return [
    { id: 'contract-close', label: 'Avg. days on job', days: avg, deltaDays: 0 },
    { id: 'permit-close', label: 'Longest job (days)', days: Math.max(...days), deltaDays: 0 },
    { id: 'slab-close', label: 'Shortest tracked job', days: Math.min(...days), deltaDays: 0 },
  ];
}

/** Map read-only Buildertrend report JSON into owner-dashboard jobs. Selections/to-dos/slip stay 0 when those lists are absent. */
export function mapBuildertrendReports(
  reports: BuildertrendReports,
  options?: { now?: Date; fallbackPipeline?: PipelineStage[] },
): MappedBuildertrendPull {
  const now = options?.now ?? new Date();
  const jobs = new Map<string, JobDraft>();
  for (const row of asArray(reports.jobs)) ingest(jobs, asRecord(row) ?? {}, 'job');
  for (const row of asArray(reports.jobsites)) ingest(jobs, asRecord(row) ?? {}, 'job');
  for (const row of asArray(reports.dailyLogs)) ingest(jobs, asRecord(row) ?? {}, 'log');
  for (const row of asArray(reports.wip)) ingest(jobs, asRecord(row) ?? {}, 'wip');

  const unique = [...new Map([...jobs.values()].map((job) => [job.name.toLowerCase(), job])).values()];
  const ownerJobs = unique.map((job) => toOwnerJob(job, now)).sort((a, b) => a.name.localeCompare(b.name));

  const wipJobs = unique.filter((job) => job.onWip);
  const totalRevised = wipJobs.reduce((sum, job) => sum + job.contractPrice, 0);
  const totalProfit = wipJobs.reduce((sum, job) => sum + job.projectedProfit, 0);
  const rolling = wipJobs.reduce((sum, job) => sum + job.earnedRevenue, 0);
  const totalWip = ownerJobs.filter((job) => job.status === 'open').reduce((sum, job) => sum + job.wip, 0);
  const soon = addMonths(now.toISOString().slice(0, 10), 3);
  const projectedClosings = ownerJobs
    .filter((job) => job.status === 'open' && job.estCloseDate && job.estCloseDate <= soon)
    .reduce((sum, job) => sum + job.wip, 0);
  const leadValue = leadDollars(reports);
  const pipeline =
    leadValue > 0
      ? [
          { id: 'lead', label: 'Lead', value: leadValue },
          { id: 'proposal', label: 'Proposal', value: 0 },
          { id: 'pre-contract', label: 'Pre-Contract', value: 0 },
          { id: 'contract', label: 'Contract', value: 0 },
          { id: 'closed', label: 'Closed / Won', value: 0 },
        ]
      : (options?.fallbackPipeline ?? LIVE_PIPELINE);

  return {
    jobs: ownerJobs,
    pipeline,
    salesPerformance: [
      { id: 'backlog', label: 'Signed Backlog', value: totalWip },
      { id: 'closings', label: 'Projected Closings', value: projectedClosings || totalWip },
      { id: 'signing', label: 'Expected Signing Value', value: pipeline[0]?.value ?? 0 },
    ],
    timeMetrics: timeMetricsFrom(unique, LIVE_TIME_METRICS),
    targetMarginPct: LIVE_TARGET_MARGIN_PCT,
    projectedMarginPct: totalRevised > 0 ? Math.round((totalProfit / totalRevised) * 1000) / 10 : 0,
    rollingRevenue12Mo: rolling,
  };
}
