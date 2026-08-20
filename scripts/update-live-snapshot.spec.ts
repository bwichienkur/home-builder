import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapBuildertrendReports } from '../src/lib/buildertrend/mapReports';
import { LIVE_TARGET_MARGIN_PCT } from '../src/lib/buildertrend/liveSnapshot';

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

describe('update live snapshot from Buildertrend cache', () => {
  it('writes src/lib/buildertrend/liveSnapshot.ts', () => {
    const cachePath = path.join(process.cwd(), 'data/buildertrend-cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as { pulledAt: string; reports: unknown };
    const mapped = mapBuildertrendReports(cache.reports as any, { now: new Date(cache.pulledAt) });
    const openJobs = mapped.jobs.filter((job) => job.status === 'open');
    expect(openJobs.length).toBeGreaterThan(0);

    const jobBlocks = openJobs.map((job) => jobToTs(job as unknown as Record<string, unknown>, '  ')).join(',\n');
    const pulledDate = new Date(cache.pulledAt).toISOString();

    const file = `import type { OwnerJob, PipelineStage, SalesPerformanceBar, TimeMetric } from './types';

/**
 * Read-only Olsen Custom Homes snapshot from Buildertrend.
 * Regenerate: BUILDERTREND_COOKIE=… npm run buildertrend:pull && npm run buildertrend:update-snapshot
 * Weighted pipeline = Lead Opportunities confidence × estimatedRevenueMin.
 * Past due = Tasks Status includes Not completed + due date before today.
 * Test job "**** Tate TEST JOB" omitted.
 */
const OPEN_JOBS: OwnerJob[] = [
${jobBlocks},
];

export const LIVE_JOBS: OwnerJob[] = OPEN_JOBS;

/** Lead Opportunities open estimated-revenue-min totals by stage (proposal+ left empty when BT has no buckets). */
export const LIVE_PIPELINE: PipelineStage[] = ${JSON.stringify(mapped.pipeline, null, 2)};

export const LIVE_SALES_PERFORMANCE: SalesPerformanceBar[] = ${JSON.stringify(mapped.salesPerformance, null, 2)};

export const LIVE_TIME_METRICS: TimeMetric[] = ${JSON.stringify(mapped.timeMetrics, null, 2)};

export const LIVE_TARGET_MARGIN_PCT = ${LIVE_TARGET_MARGIN_PCT};
export const LIVE_PROJECTED_MARGIN_PCT = ${mapped.projectedMarginPct};
export const LIVE_ROLLING_REVENUE_12MO = ${mapped.rollingRevenue12Mo};
/** Sales → Lead Opportunities: sum(confidence × estimatedRevenueMin). */
export const LIVE_WEIGHTED_PIPELINE = ${mapped.weightedPipeline ?? 0};
export const LIVE_SNAPSHOT_AT = '${pulledDate}';
`;

    writeFileSync(path.join(process.cwd(), 'src/lib/buildertrend/liveSnapshot.ts'), file);
    expect(mapped.weightedPipeline ?? 0).toBeGreaterThan(0);
    expect(mapped.jobs.some((j) => j.pastDueTasks > 0 || j.pendingSelections > 0)).toBe(true);
  });
});
