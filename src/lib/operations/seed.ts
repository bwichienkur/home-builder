import {
  LIVE_JOBS,
  LIVE_PROJECTED_MARGIN_PCT,
  LIVE_ROLLING_REVENUE_12MO,
  LIVE_SNAPSHOT_AT,
  LIVE_TARGET_MARGIN_PCT,
  LIVE_WEIGHTED_PIPELINE,
} from '../buildertrend/liveSnapshot';
import { LIVE_DRILLDOWN } from '../buildertrend/liveDrilldown';
import type {
  OpsCashflowEntry,
  OpsDailyLog,
  OpsDeal,
  OpsDealStage,
  OpsJob,
  OpsPerson,
  OpsScheduleItem,
  OpsSelection,
  OpsSnapshot,
  OpsTask,
} from './types';

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function ownerJobId(numericJobId: number | string): string {
  const raw = String(numericJobId);
  return raw.startsWith('bt-') ? raw : `bt-${raw}`;
}

/** Map Pipedrive / pipeline stage labels onto OpsDealStage buckets. */
export function mapExternalDealStage(stageKey: string, stageName: string): OpsDealStage {
  const name = stageName.toLowerCase();
  if (name.includes('lost')) return 'lost';
  if (name.includes('won') || name.includes('closed')) return 'closed';
  if (name.includes('contract sent') || name.includes('negotiat')) return 'contract';
  if (name.includes('proposal') || name.includes('pricing')) return 'proposal';
  if (name.includes('homesite') || name.includes('meet with') || name.includes('pre-contract')) return 'pre-contract';
  if (name.includes('qualified') || name.includes('first contact') || name.includes('lead')) return 'lead';
  // Fallback by Pipedrive stage id order used in OCH Sales pipeline.
  const idMatch = /^pd-(\d+)$/.exec(stageKey);
  const n = idMatch ? Number(idMatch[1]) : 0;
  if (n === 6 || n === 17) return 'contract';
  if (n === 5) return 'proposal';
  if (n === 3 || n === 4) return 'pre-contract';
  return 'lead';
}

function selectionStatus(label: string): OpsSelection['status'] {
  const lower = label.toLowerCase();
  if (lower.includes('completed') || lower === 'completed') return 'completed';
  if (lower.includes('selected') || lower === 'selected') return 'selected';
  return 'pending';
}

/**
 * Build a native store seed from the baked Owner Dashboard snapshot + LIVE_DRILLDOWN rows
 * (full pending selections, past-due tasks, Pipedrive deals; logs expanded from user×job aggregates).
 */
export function seedOpsFromLiveSnapshot(): OpsSnapshot {
  const updatedAt = nowIso();
  const jobs: OpsJob[] = LIVE_JOBS.map((job) => ({
    id: job.id,
    name: job.name,
    pm: job.pm,
    status: job.status,
    phase: job.phase,
    openedAt: job.openedAt,
    estCloseDate: job.estCloseDate,
    notes: job.notes,
    foundationStarted: job.foundationStarted ?? null,
    estFirstScheduleStart: job.estFirstScheduleStart,
    estPermittingEnd: job.estPermittingEnd,
    estFoundationStart: job.estFoundationStart,
    estClosingEnd: job.estClosingEnd,
    currentScheduleItem: job.notes || undefined,
    contractPrice: job.contractPrice,
    revenueToDate: job.revenueToDate,
    revenueLast30d: job.revenueLast30d ?? 0,
    wip: job.wip,
    changeOrderRevenue: job.changeOrderRevenue ?? 0,
    changeOrderProfit: job.changeOrderProfit ?? 0,
    slip: { ...job.slip },
    totalSlip: job.totalSlip ?? 0,
    updatedAt,
  }));

  const jobIdSet = new Set(jobs.map((j) => j.id));
  const peopleMap = new Map<string, OpsPerson>();
  for (const job of jobs) {
    const name = job.pm?.trim();
    if (!name || /unassigned/i.test(name)) continue;
    if (!peopleMap.has(name.toLowerCase())) {
      peopleMap.set(name.toLowerCase(), {
        id: id('person'),
        name,
        role: 'pm',
        updatedAt,
      });
    }
  }

  const selections: OpsSelection[] = [];
  for (const rows of Object.values(LIVE_DRILLDOWN.selectionsByJobId)) {
    for (const row of rows) {
      const jobId = ownerJobId(row.jobId);
      if (!jobIdSet.has(jobId) && !LIVE_JOBS.some((j) => j.id === jobId)) {
        // Still import orphaned drilldown rows so counts match reporting.
      }
      selections.push({
        id: `sel-${row.id}`,
        jobId,
        title: row.title || `Selection ${row.id}`,
        category: row.category || '',
        location: row.location || '',
        status: selectionStatus(row.statusLabel || ''),
        deadline: row.deadline || '',
        updatedAt,
      });
    }
  }

  const tasks: OpsTask[] = [];
  for (const rows of Object.values(LIVE_DRILLDOWN.pastDueByJobId)) {
    for (const row of rows) {
      const jobId = ownerJobId(row.jobId);
      tasks.push({
        id: `task-${row.taskId}`,
        jobId,
        title: row.title || `Task ${row.taskId}`,
        assignee: row.assignedTo || '',
        dueDate: row.endDate || '',
        status: 'incomplete',
        updatedAt,
      });
    }
  }

  const logs: OpsDailyLog[] = [];
  for (const rows of Object.values(LIVE_DRILLDOWN.logsByJobId)) {
    for (const row of rows) {
      const jobId = ownerJobId(row.jobId);
      const count = Math.max(1, Math.min(row.dailyLogCount || 1, 28));
      const last = row.lastLogDate ? new Date(`${row.lastLogDate}T12:00:00Z`) : new Date();
      for (let i = 0; i < count; i += 1) {
        const day = new Date(last);
        day.setUTCDate(day.getUTCDate() - i);
        logs.push({
          id: id('log'),
          jobId,
          date: day.toISOString().slice(0, 10),
          author: row.userName || 'User',
          isPm: Boolean(jobs.find((j) => j.id === jobId)?.pm === row.userName),
          note: i === 0 ? `Imported from BT user×job log aggregate (${row.dailyLogCount} in window)` : undefined,
          updatedAt,
        });
      }
    }
  }

  const deals: OpsDeal[] = [];
  for (const [stageKey, rows] of Object.entries(LIVE_DRILLDOWN.dealsByStage)) {
    for (const row of rows) {
      const stage = mapExternalDealStage(stageKey, row.stageName || '');
      deals.push({
        id: `deal-${row.id}`,
        title: row.title || `Deal ${row.id}`,
        stage,
        value: row.value || 0,
        confidence: Math.round(row.probabilityPct || 0),
        owner: 'Sales',
        expectedCloseDate: row.expectedCloseDate || '',
        updatedAt,
      });
    }
  }

  const scheduleItems: OpsScheduleItem[] = [];
  for (const [numericId, rows] of Object.entries(LIVE_DRILLDOWN.baselineSlipByJobId)) {
    const jobId = ownerJobId(numericId);
    let i = 0;
    for (const row of rows) {
      i += 1;
      scheduleItems.push({
        id: `sched-${numericId}-${i}`,
        jobId,
        title: row.title || `Schedule item ${i}`,
        endDateSlip: row.endDateSlip || 0,
        durationSlip: row.durationSlip || 0,
        expectedStartDate: row.expectedStartDate || '',
        actualStartDate: row.actualStartDate || '',
        expectedEndDate: row.expectedEndDate || '',
        actualEndDate: row.actualEndDate || '',
        completed: Boolean(row.completed),
        updatedAt,
      });
    }
  }

  // One Money In stub per job from trailing-30d revenue (editable cashflow ledger).
  const cashflow: OpsCashflowEntry[] = jobs
    .filter((j) => j.revenueLast30d > 0)
    .map((j) => ({
      id: id('cf'),
      jobId: j.id,
      date: updatedAt.slice(0, 10),
      amount: j.revenueLast30d,
      type: 'money_in' as const,
      note: 'Seeded from BT Cash flow trailing 30d Money In',
      updatedAt,
    }));

  return {
    version: 1,
    settings: {
      targetMarginPct: LIVE_TARGET_MARGIN_PCT,
      projectedMarginPct: LIVE_PROJECTED_MARGIN_PCT,
      rollingRevenue12Mo: LIVE_ROLLING_REVENUE_12MO || LIVE_WEIGHTED_PIPELINE,
      refreshedAt: LIVE_SNAPSHOT_AT || LIVE_DRILLDOWN.generatedAt,
    },
    jobs,
    logs,
    tasks,
    selections,
    deals,
    people: [...peopleMap.values()],
    scheduleItems,
    cashflow,
  };
}

export { id as newOpsId };
