import { formatCompactUsd, formatPct, phaseLabel, totalSlipDays } from './format';
import { enrichOwnerJobs, type DailyLogJobMetrics } from './dailyLogStandards';
import type {
  DateRangeId,
  KpiCard,
  OwnerDashboard,
  OwnerDashboardFilters,
  OwnerJob,
  PipelineStage,
  SalesPerformanceBar,
  TimeMetric,
} from './types';
import { PIPELINE_WEIGHTS } from './types';

export const PHASE_ORDER = ['construction', 'permitting', 'design', 'closeout'] as const;

type EnrichedOwnerJob = OwnerJob & DailyLogJobMetrics;

const SPARK_UP = [18, 19, 19.4, 20.1, 20.8, 21.6, 22.4, 23.5, 24];

function inDateRange(iso: string, range: DateRangeId, now: Date) {
  if (range === 'all') return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const t = date.getTime();
  if (range === '30d') return t >= now.getTime() - 30 * 86400000;
  if (range === '12mo') return t >= now.getTime() - 365 * 86400000;
  const start = new Date(now.getFullYear(), 0, 1);
  return t >= start.getTime();
}

export function filterJobs(jobs: OwnerJob[], filters: OwnerDashboardFilters, now = new Date()) {
  return jobs.filter((job) => job.status === filters.status && inDateRange(job.openedAt, filters.dateRange, now));
}

export function weightedPipelineValue(pipeline: PipelineStage[]) {
  return pipeline.reduce((sum, stage) => sum + stage.value * (PIPELINE_WEIGHTS[stage.id] ?? 0), 0);
}

function kpi(
  id: string,
  title: string,
  value: number,
  display: string,
  delta: number,
  extra?: Partial<KpiCard>,
): KpiCard {
  return {
    id,
    title,
    value,
    display,
    delta,
    deltaUnit: 'pct',
    deltaLabel: 'vs last month',
    sparkline: SPARK_UP,
    ...extra,
  };
}

export function roundPctParts(counts: number[]) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((count) => (count / total) * 100);
  const head = raw.slice(0, -1).map((pct) => Math.round(pct));
  const last = Math.round(100 - head.reduce((sum, n) => sum + n, 0));
  return [...head, last];
}

export function summarizeOwnerDashboard(input: {
  source: OwnerDashboard['source'];
  refreshedAt: string;
  filters: OwnerDashboardFilters;
  jobs: OwnerJob[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceBar[];
  timeMetrics: TimeMetric[];
  targetMarginPct: number;
  projectedMarginPct: number;
  rollingRevenue12Mo: number;
  /** Company-level weighted pipeline; defaults to stage value × PIPELINE_WEIGHTS. */
  weightedPipeline?: number;
  now?: Date;
}): OwnerDashboard {
  const now = input.now ?? new Date();
  const jobs = enrichOwnerJobs(filterJobs(input.jobs, input.filters, now), now);
  const jobCount = jobs.length;
  const totalContract = jobs.reduce((s, j) => s + j.contractPrice, 0);
  const totalRevenue = jobs.reduce((s, j) => s + j.revenueToDate, 0);
  const totalWip = jobs.reduce((s, j) => s + j.wip, 0);
  const pendingSelections = jobs.reduce((s, j) => s + j.pendingSelections, 0);
  const pastDueTasks = jobs.reduce((s, j) => s + j.pastDueTasks, 0);
  const logRecentDone = jobs.reduce((s, j) => s + (j.dailyLogsRecentDone ?? 0), 0);
  const logRecentExp = jobs.reduce((s, j) => s + j.dailyLogsRecentExpected, 0);
  const logLifetimeDone = jobs.reduce((s, j) => s + j.dailyLogsTotal, 0);
  const logLifetimeExp = jobs.reduce((s, j) => s + j.dailyLogsLifetimeDue, 0);
  const slipSum = jobs.reduce((s, j) => s + totalSlipDays(j.slip), 0);
  const weighted = input.weightedPipeline ?? weightedPipelineValue(input.pipeline);
  const marginDelta = input.projectedMarginPct - input.targetMarginPct;

  const phaseCountsRaw = PHASE_ORDER.map((phase) => jobs.filter((j) => j.phase === phase).length);
  const phasePcts = roundPctParts(phaseCountsRaw);
  const phaseCounts = PHASE_ORDER.map((phase, index) => ({
    phase,
    label: phaseLabel(phase),
    count: phaseCountsRaw[index]!,
    pct: phasePcts[index] ?? 0,
  }));

  const pms = [...new Set(jobs.map((j) => j.pm))];
  const pmScorecard = pms
    .map((pm) => {
      const rows = jobs.filter((j) => j.pm === pm);
      const recentDone = rows.reduce((s, j) => s + (j.dailyLogsRecentDone ?? 0), 0);
      const recentExp = rows.reduce((s, j) => s + j.dailyLogsRecentExpected, 0);
      const lifetimeDone = rows.reduce((s, j) => s + j.dailyLogsTotal, 0);
      const lifetimeExp = rows.reduce((s, j) => s + j.dailyLogsLifetimeDue, 0);
      const lifetimePct = lifetimeExp ? (lifetimeDone / lifetimeExp) * 100 : 0;
      return {
        pm,
        projects: rows.length,
        wip: rows.reduce((s, j) => s + j.wip, 0),
        dailyLogsRecentDone: recentDone,
        dailyLogsRecentExpected: recentExp,
        dailyLogRecentPct: recentExp ? (recentDone / recentExp) * 100 : 0,
        dailyLogLifetimePct: lifetimePct,
        pastDueTasks: rows.reduce((s, j) => s + j.pastDueTasks, 0),
      };
    })
    .sort((a, b) => a.pm.localeCompare(b.pm));

  const live = input.source === 'buildertrend';
  const trend = (mockDelta: number, mockSpark: number[], value: number) =>
    live ? { delta: 0, sparkline: [value, value] } : { delta: mockDelta, sparkline: mockSpark };
  const activeTrend = trend(9.1, [18, 19, 20, 20, 21, 22, 23, 24], jobCount);
  const wipTrend = trend(7.2, [14.2, 15.1, 15.8, 16.4, 16.9, 17.4, 18.1, 18.74], totalWip);
  const revenueTrend = trend(8.6, [11.2, 12.0, 12.6, 13.1, 13.7, 14.2, 14.7, 15.11], totalRevenue);
  const contractTrend = trend(6.3, [20.4, 21.2, 22.0, 22.8, 23.5, 24.2, 24.9, 25.65], totalContract);
  const pipelineTrend = trend(10.4, [16.8, 17.5, 18.4, 19.2, 20.1, 20.9, 21.8, 22.65], weighted);
  const marginTrend = live
    ? { sparkline: [input.projectedMarginPct, input.projectedMarginPct] }
    : { sparkline: [14.8, 15.2, 15.9, 16.4, 17.0, 17.5, 18.1, 18.6] };
  const rollingTrend = trend(9.7, [32.4, 34.1, 35.8, 37.2, 38.6, 40.1, 41.4, 42.82], input.rollingRevenue12Mo);

  const kpis: KpiCard[] = [
    kpi('active', 'Active Projects', jobCount, String(jobCount), activeTrend.delta, {
      sparkline: activeTrend.sparkline,
    }),
    kpi('wip', 'Total Work in Progress', totalWip, formatCompactUsd(totalWip), wipTrend.delta, {
      sparkline: wipTrend.sparkline,
    }),
    kpi('revenue', 'Revenue to Date', totalRevenue, formatCompactUsd(totalRevenue), revenueTrend.delta, {
      sparkline: revenueTrend.sparkline,
    }),
    kpi('contract', 'Total Contract Value', totalContract, formatCompactUsd(totalContract), contractTrend.delta, {
      sparkline: contractTrend.sparkline,
    }),
    kpi('pipeline', 'Weighted Pipeline', weighted, formatCompactUsd(weighted), pipelineTrend.delta, {
      sparkline: pipelineTrend.sparkline,
    }),
    kpi('margin', 'Target Margin vs Projected', input.projectedMarginPct, formatPct(input.projectedMarginPct), marginDelta, {
      deltaUnit: 'pts',
      detail: `${formatPct(input.targetMarginPct)} target vs ${formatPct(input.projectedMarginPct)} projected`,
      sparkline: marginTrend.sparkline,
    }),
    kpi('rolling', '12 Mo. Rolling Revenue', input.rollingRevenue12Mo, formatCompactUsd(input.rollingRevenue12Mo), rollingTrend.delta, {
      sparkline: rollingTrend.sparkline,
    }),
  ];

  return {
    source: input.source,
    refreshedAt: input.refreshedAt,
    filters: input.filters,
    kpis,
    phases: phaseCounts,
    timeMetrics: input.timeMetrics,
    pmScorecard,
    pipeline: input.pipeline,
    salesPerformance: input.salesPerformance,
    weightedPipeline: weighted,
    projects: jobs
      .map((job) => ({
        id: job.id,
        name: job.name,
        pm: job.pm,
        pendingSelections: job.pendingSelections,
        pastDueTasks: job.pastDueTasks,
        dailyLogsRecentDone: job.dailyLogsRecentDone,
        dailyLogsRecentExpected: job.dailyLogsRecentExpected,
        dailyLogsTotal: job.dailyLogsTotal,
        dailyLogLifetimePct: job.dailyLogLifetimePct,
        contractPrice: job.contractPrice,
        revenueToDate: job.revenueToDate,
        wip: job.wip,
        pctComplete: job.contractPrice ? (job.revenueToDate / job.contractPrice) * 100 : 0,
        estCloseDate: job.estCloseDate,
        phase: job.phase,
        slip: job.slip,
        totalSlip: totalSlipDays(job.slip),
        notes: job.notes,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    totals: {
      jobCount,
      avgTotalSlipDays: jobCount ? slipSum / jobCount : 0,
      totalRevenueToDate: totalRevenue,
      totalContract,
      totalWip,
      pendingSelections,
      pastDueTasks,
      avgDailyLogPct: logRecentExp ? (logRecentDone / logRecentExp) * 100 : 0,
      avgDailyLogLifetimePct: logLifetimeExp ? (logLifetimeDone / logLifetimeExp) * 100 : 0,
    },
  };
}
