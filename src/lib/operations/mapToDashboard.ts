import { calendarDaysBetween } from '../buildertrend/estimatedTimeMetrics';
import { LIVE_TIME_METRICS } from '../buildertrend/liveSnapshot';
import { PIPELINE_WEIGHTS } from '../buildertrend/types';
import type { OwnerJob, PipelineStage, SalesPerformanceBar, TimeMetric } from '../buildertrend/types';
import type { OpsDeal, OpsJob, OpsSnapshot } from './types';

const ROLLING_DAYS = 28;

function isoDay(value: string) {
  return value ? value.slice(0, 10) : '';
}

function daysAgo(n: number, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function addMonths(isoDate: string, months: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function averageDays(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((s, n) => s + n, 0) / values.length);
}

/**
 * Prefer averages from closed/warranty Ops jobs that have schedule milestones;
 * otherwise fall back to settings / baked LIVE_TIME_METRICS.
 */
export function timeMetricsFromOpsJobs(
  jobs: OpsJob[],
  fallback: TimeMetric[] = LIVE_TIME_METRICS,
): TimeMetric[] {
  const closed = jobs.filter((job) => !job.archived && (job.status === 'closed' || job.status === 'warranty'));
  const contract: number[] = [];
  const permit: number[] = [];
  const slab: number[] = [];
  for (const job of closed) {
    const close = job.estClosingEnd || job.estCloseDate;
    if (!close) continue;
    const contractDays = calendarDaysBetween(job.estFirstScheduleStart ?? '', close);
    if (contractDays != null && contractDays >= 0) contract.push(contractDays);
    const permitDays = calendarDaysBetween(job.estPermittingEnd ?? '', close);
    if (permitDays != null && permitDays >= 0) permit.push(permitDays);
    const slabDays = calendarDaysBetween(job.estFoundationStart ?? '', close);
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

function moneyInLast30d(snapshot: OpsSnapshot, jobId: string, windowStart: string, today: string) {
  const rows = (snapshot.cashflow ?? []).filter(
    (r) =>
      r.jobId === jobId &&
      r.type === 'money_in' &&
      isoDay(r.date) >= windowStart &&
      isoDay(r.date) <= today,
  );
  if (!rows.length) return null;
  return rows.reduce((s, r) => s + r.amount, 0);
}

/** Map native ops store → OwnerJob[] + sales inputs for summarizeOwnerDashboard. */
export function mapOpsSnapshotToDashboardInputs(snapshot: OpsSnapshot, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const windowStart = daysAgo(ROLLING_DAYS, now);
  const cashflowWindowStart = daysAgo(30, now);

  const jobs: OwnerJob[] = snapshot.jobs
    .filter((job) => !job.archived)
    .map((job) => {
      const jobLogs = snapshot.logs.filter((l) => l.jobId === job.id);
      const recentLogs = jobLogs.filter((l) => isoDay(l.date) >= windowStart && isoDay(l.date) <= today);
      const recentPm = recentLogs.filter((l) => l.isPm);
      const pastDueTasks = snapshot.tasks.filter(
        (t) => t.jobId === job.id && t.status === 'incomplete' && isoDay(t.dueDate) && isoDay(t.dueDate) < today,
      ).length;
      const pendingSelections = snapshot.selections.filter(
        (s) => s.jobId === job.id && s.status === 'pending',
      ).length;
      const fromCashflow = moneyInLast30d(snapshot, job.id, cashflowWindowStart, today);

      return {
        id: job.id,
        name: job.name,
        pm: job.pm,
        status: job.status,
        phase: job.phase,
        pendingSelections,
        pastDueTasks,
        dailyLogsTotal: job.lifetimeDailyLogCount ?? jobLogs.length,
        dailyLogsRecentDone: recentLogs.length,
        dailyLogsRecentPmDone: recentPm.length,
        foundationStarted: job.foundationStarted,
        estFirstScheduleStart: job.estFirstScheduleStart,
        estPermittingEnd: job.estPermittingEnd,
        estFoundationStart: job.estFoundationStart,
        estClosingEnd: job.estClosingEnd,
        contractPrice: job.contractPrice,
        revenueToDate: job.revenueToDate,
        revenueLast30d: fromCashflow ?? job.revenueLast30d,
        wip: job.wip,
        changeOrderRevenue: job.changeOrderRevenue,
        changeOrderProfit: job.changeOrderProfit,
        estCloseDate: job.estCloseDate,
        openedAt: job.openedAt,
        slip: { ...job.slip },
        totalSlip: job.totalSlip,
        notes: job.currentScheduleItem || job.notes || '',
      };
    });

  const openDeals = snapshot.deals.filter((d) => !d.archived && d.stage !== 'lost');
  const stageOrder: OpsDeal['stage'][] = ['lead', 'proposal', 'pre-contract', 'contract', 'closed'];
  const labels: Record<string, string> = {
    lead: 'Lead',
    proposal: 'Proposal',
    'pre-contract': 'Pre-contract',
    contract: 'Contract',
    closed: 'Closed',
  };

  const pipeline: PipelineStage[] = stageOrder.map((stage) => {
    const rows = openDeals.filter((d) => d.stage === stage);
    return {
      id: stage,
      label: labels[stage],
      value: rows.reduce((s, d) => s + d.value * (PIPELINE_WEIGHTS[stage] ?? 0), 0),
      dealCount: rows.length,
    };
  });

  const openJobs = jobs.filter((j) => j.status === 'open');
  const totalWip = openJobs.reduce((s, j) => s + j.wip, 0);
  const soon = addMonths(today, 3);
  const projectedClosings = openJobs
    .filter((j) => j.estCloseDate && j.estCloseDate <= soon)
    .reduce((s, j) => s + j.wip, 0);
  const leadValue = openDeals.filter((d) => d.stage === 'lead').reduce((s, d) => s + d.value, 0);

  const salesPerformance: SalesPerformanceBar[] = [
    { id: 'backlog', label: 'Signed Backlog', value: totalWip },
    { id: 'closings', label: 'Projected Closings', value: projectedClosings || totalWip },
    { id: 'signing', label: 'Expected Signing Value', value: leadValue },
  ];

  const weightedPipeline = openDeals
    .filter((d) => d.stage !== 'closed')
    .reduce((sum, d) => sum + d.value * (d.confidence / 100), 0);

  const timeMetrics = timeMetricsFromOpsJobs(
    snapshot.jobs,
    snapshot.settings.timeMetrics?.length ? snapshot.settings.timeMetrics : LIVE_TIME_METRICS,
  );

  return {
    jobs,
    pipeline,
    salesPerformance,
    timeMetrics,
    targetMarginPct: snapshot.settings.targetMarginPct,
    projectedMarginPct: snapshot.settings.projectedMarginPct,
    rollingRevenue12Mo: snapshot.settings.rollingRevenue12Mo,
    weightedPipeline: Math.round(weightedPipeline),
    refreshedAt: snapshot.settings.refreshedAt,
  };
}
