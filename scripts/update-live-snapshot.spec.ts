import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapBuildertrendReports } from '../src/lib/buildertrend/mapReports';
import { LIVE_TARGET_MARGIN_PCT } from '../src/lib/buildertrend/liveSnapshot';
import { buildLiveDrilldown } from '../src/lib/dashboard/buildDrilldown';
import { mapPipedriveDeals, mergeSalesFromPipedrive } from '../src/lib/pipedrive/mapDeals';

function jobToTs(job: Record<string, unknown>, indent: string) {
  const lines = [`${indent}{`];
  const fields: [string, unknown][] = [
    ['id', job.id],
    ['name', job.name],
    ['pm', job.pm],
    ['status', job.status],
    ['phase', job.phase],
    ['pendingSelections', job.pendingSelections],
    ['pastDueTasks', job.pastDueTasks],
  ];
  if (job.dailyLogsRecentDone != null) fields.push(['dailyLogsRecentDone', job.dailyLogsRecentDone]);
  if (job.dailyLogsTotal != null) fields.push(['dailyLogsTotal', job.dailyLogsTotal]);
  if (job.foundationStarted != null) fields.push(['foundationStarted', job.foundationStarted]);
  if (job.totalSlip != null) fields.push(['totalSlip', job.totalSlip]);
  if (job.changeOrderRevenue != null) fields.push(['changeOrderRevenue', job.changeOrderRevenue]);
  if (job.changeOrderProfit != null) fields.push(['changeOrderProfit', job.changeOrderProfit]);
  fields.push(
    ['contractPrice', job.contractPrice],
    ['revenueToDate', job.revenueToDate],
    ['wip', job.wip],
    ['estCloseDate', job.estCloseDate],
    ['openedAt', job.openedAt],
    ['slip', job.slip],
    ['notes', job.notes],
  );
  for (const [key, value] of fields) {
    lines.push(`${indent}  ${key}: ${JSON.stringify(value)},`);
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

describe('update live snapshot from Buildertrend (+ optional Pipedrive) cache', () => {
  it('writes src/lib/buildertrend/liveSnapshot.ts', () => {
    const cachePath = path.join(process.cwd(), 'data/buildertrend-cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as { pulledAt: string; reports: unknown };
    let mapped = mapBuildertrendReports(cache.reports as any, { now: new Date(cache.pulledAt) });

    const pdPath = path.join(process.cwd(), 'data/pipedrive-cache.json');
    let pdNote = 'Sales funnel still from BT Lead Opportunities when Pipedrive cache is absent.';
    if (existsSync(pdPath)) {
      const pdCache = JSON.parse(readFileSync(pdPath, 'utf8')) as { pulledAt: string; reports: any };
      const pd = mapPipedriveDeals(pdCache.reports, { now: new Date(pdCache.pulledAt) });
      mapped = mergeSalesFromPipedrive(mapped, pd);
      pdNote = `Sales funnel + weighted pipeline from Pipedrive Sales pipeline (pulled ${pdCache.pulledAt}).`;
    }

    const openJobs = mapped.jobs.filter((job) => job.status === 'open');
    expect(openJobs.length).toBeGreaterThan(0);

    const jobBlocks = openJobs.map((job) => jobToTs(job as unknown as Record<string, unknown>, '  ')).join(',\n');
    const pulledDate = new Date(cache.pulledAt).toISOString();

    const file = `import type { OwnerJob, PipelineStage, SalesPerformanceBar, TimeMetric } from './types';

/**
 * Read-only Olsen Custom Homes snapshot from Buildertrend (+ Pipedrive when available).
 * Regenerate:
 *   BUILDERTREND_COOKIE=… npm run buildertrend:pull
 *   PIPEDRIVE_API_TOKEN=… npm run pipedrive:pull
 *   npm run buildertrend:update-snapshot
 * Jobs / WIP / logs / tasks / selections = Buildertrend.
 * ${pdNote}
 * Past due = Tasks Status includes Not completed + due date before today.
 * Pending selections = per job, exclude green Selected/Completed (status 2 and 3).
 * Test job "**** Tate TEST JOB" omitted.
 */
const OPEN_JOBS: OwnerJob[] = [
${jobBlocks},
];

export const LIVE_JOBS: OwnerJob[] = OPEN_JOBS;

/** Sales funnel: Pipedrive Sales stages when PD cache present, else BT Lead Opportunities. */
export const LIVE_PIPELINE: PipelineStage[] = ${JSON.stringify(mapped.pipeline, null, 2)};

export const LIVE_SALES_PERFORMANCE: SalesPerformanceBar[] = ${JSON.stringify(mapped.salesPerformance, null, 2)};

export const LIVE_TIME_METRICS: TimeMetric[] = ${JSON.stringify(mapped.timeMetrics, null, 2)};

export const LIVE_TARGET_MARGIN_PCT = ${LIVE_TARGET_MARGIN_PCT};
export const LIVE_PROJECTED_MARGIN_PCT = ${mapped.projectedMarginPct};
export const LIVE_ROLLING_REVENUE_12MO = ${mapped.rollingRevenue12Mo};
/** Weighted pipeline: Pipedrive value × stage probability when PD cache present. */
export const LIVE_WEIGHTED_PIPELINE = ${mapped.weightedPipeline ?? 0};
export const LIVE_SNAPSHOT_AT = '${pulledDate}';
`;

    writeFileSync(path.join(process.cwd(), 'src/lib/buildertrend/liveSnapshot.ts'), file);

    const pdCache = existsSync(pdPath)
      ? (JSON.parse(readFileSync(pdPath, 'utf8')) as { pulledAt: string; reports: unknown })
      : null;
    const drilldown = buildLiveDrilldown({
      buildertrend: cache,
      pipedrive: pdCache,
      now: new Date(cache.pulledAt),
    });
    const drillFile = `import type { LiveDrilldown } from '../dashboard/drilldownTypes';

/**
 * Compact drill-down rows for clickable dashboard numbers.
 * Regenerated with liveSnapshot via \`npm run buildertrend:update-snapshot\`.
 * Pending selections exclude green Selected/Completed (status 2 and 3).
 * Past due = incomplete tasks with due date before pull day.
 * Daily logs = user×job rows from the rolling 4-week window.
 */
export const LIVE_DRILLDOWN: LiveDrilldown = ${JSON.stringify(drilldown, null, 2)};
`;
    writeFileSync(path.join(process.cwd(), 'src/lib/buildertrend/liveDrilldown.ts'), drillFile);
    expect(Object.keys(drilldown.selectionsByJobId).length).toBeGreaterThan(0);
    expect(Object.values(drilldown.dealsByStage).some((rows) => rows.length > 0)).toBe(true);

    expect(mapped.weightedPipeline ?? 0).toBeGreaterThan(0);
    expect(mapped.jobs.some((j) => j.pastDueTasks > 0 || j.pendingSelections > 0)).toBe(true);
  });
});
