import { PIPELINE_WEIGHTS } from '../buildertrend/types';
import type { OwnerJob, PipelineStage, SalesPerformanceBar, TimeMetric } from '../buildertrend/types';
import { LIVE_TIME_METRICS } from '../buildertrend/liveSnapshot';
import type { OpsDeal, OpsSnapshot } from './types';

const ROLLING_DAYS = 28;

function isoDay(value: string) {
  return value ? value.slice(0, 10) : '';
}

function daysAgo(n: number, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Map native ops store → OwnerJob[] + sales inputs for summarizeOwnerDashboard. */
export function mapOpsSnapshotToDashboardInputs(snapshot: OpsSnapshot, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const windowStart = daysAgo(ROLLING_DAYS, now);

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

      return {
        id: job.id,
        name: job.name,
        pm: job.pm,
        status: job.status,
        phase: job.phase,
        pendingSelections,
        pastDueTasks,
        dailyLogsTotal: jobLogs.length,
        dailyLogsRecentDone: recentLogs.length,
        dailyLogsRecentPmDone: recentPm.length,
        foundationStarted: job.foundationStarted,
        estFirstScheduleStart: job.estFirstScheduleStart,
        estPermittingEnd: job.estPermittingEnd,
        estFoundationStart: job.estFoundationStart,
        estClosingEnd: job.estClosingEnd,
        contractPrice: job.contractPrice,
        revenueToDate: job.revenueToDate,
        revenueLast30d: job.revenueLast30d,
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
      value: rows.reduce((s, d) => s + d.value * ((PIPELINE_WEIGHTS[stage] ?? 0)), 0),
      dealCount: rows.length,
    };
  });

  // Sales performance: unweighted open pipeline by stage label (simple bars).
  const salesPerformance: SalesPerformanceBar[] = stageOrder
    .filter((s) => s !== 'closed')
    .map((stage) => {
      const rows = openDeals.filter((d) => d.stage === stage);
      return {
        id: stage,
        label: labels[stage],
        value: rows.reduce((s, d) => s + d.value, 0),
      };
    });

  const weightedPipeline = openDeals
    .filter((d) => d.stage !== 'closed')
    .reduce((sum, d) => sum + d.value * (d.confidence / 100), 0);

  const timeMetrics: TimeMetric[] = LIVE_TIME_METRICS.map((m) => ({ ...m }));

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
