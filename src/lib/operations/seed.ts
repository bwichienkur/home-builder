import { LIVE_JOBS, LIVE_PIPELINE, LIVE_PROJECTED_MARGIN_PCT, LIVE_ROLLING_REVENUE_12MO, LIVE_SNAPSHOT_AT, LIVE_TARGET_MARGIN_PCT, LIVE_WEIGHTED_PIPELINE } from '../buildertrend/liveSnapshot';
import type { OpsDeal, OpsDealStage, OpsJob, OpsPerson, OpsSnapshot } from './types';

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const STAGE_FROM_PIPELINE: Record<string, OpsDealStage> = {
  lead: 'lead',
  proposal: 'proposal',
  'pre-contract': 'pre-contract',
  contract: 'contract',
  closed: 'closed',
};

/** Build a native store seed from the baked Owner Dashboard snapshot. */
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

  // Approximate deals from pipeline stage totals (placeholder opportunities).
  const deals: OpsDeal[] = [];
  for (const stage of LIVE_PIPELINE) {
    const dealStage = STAGE_FROM_PIPELINE[stage.id] ?? 'lead';
    if (stage.value <= 0) continue;
    const count = Math.max(1, stage.dealCount ?? 1);
    const each = stage.value / count;
    for (let i = 0; i < count; i += 1) {
      deals.push({
        id: id('deal'),
        title: `${stage.label} opportunity ${i + 1}`,
        stage: dealStage,
        value: Math.round(each),
        confidence: dealStage === 'lead' ? 10 : dealStage === 'proposal' ? 25 : dealStage === 'pre-contract' ? 45 : dealStage === 'contract' ? 80 : 100,
        owner: 'Sales',
        updatedAt,
      });
    }
  }

  // Seed synthetic child rows from LIVE_JOBS counts (not stored on OpsJob).
  const logs = [];
  const tasks = [];
  const selections = [];
  for (const source of LIVE_JOBS) {
    const recent = source.dailyLogsRecentDone ?? 0;
    for (let i = 0; i < Math.min(recent, 8); i += 1) {
      const day = new Date();
      day.setDate(day.getDate() - i * 2);
      logs.push({
        id: id('log'),
        jobId: source.id,
        date: day.toISOString().slice(0, 10),
        author: source.pm || 'PM',
        isPm: true,
        note: 'Seeded from snapshot daily-log count',
        updatedAt,
      });
    }
    for (let i = 0; i < Math.min(source.pastDueTasks, 5); i += 1) {
      const due = new Date();
      due.setDate(due.getDate() - (i + 1));
      tasks.push({
        id: id('task'),
        jobId: source.id,
        title: `Past-due task ${i + 1}`,
        assignee: source.pm || '',
        dueDate: due.toISOString().slice(0, 10),
        status: 'incomplete' as const,
        updatedAt,
      });
    }
    for (let i = 0; i < Math.min(source.pendingSelections, 5); i += 1) {
      selections.push({
        id: id('sel'),
        jobId: source.id,
        title: `Pending selection ${i + 1}`,
        category: 'General',
        location: '',
        status: 'pending' as const,
        deadline: '',
        updatedAt,
      });
    }
  }

  return {
    version: 1,
    settings: {
      targetMarginPct: LIVE_TARGET_MARGIN_PCT,
      projectedMarginPct: LIVE_PROJECTED_MARGIN_PCT,
      rollingRevenue12Mo: LIVE_ROLLING_REVENUE_12MO || LIVE_WEIGHTED_PIPELINE,
      refreshedAt: LIVE_SNAPSHOT_AT,
    },
    jobs,
    logs,
    tasks,
    selections,
    deals,
    people: [...peopleMap.values()],
  };
}

export { id as newOpsId };
