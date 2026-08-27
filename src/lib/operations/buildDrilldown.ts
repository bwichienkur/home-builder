import { numericJobId } from '../dashboard/buildDrilldown';
import type {
  DrillBaselineSlipRow,
  DrillDealRow,
  DrillLogRow,
  DrillSelectionRow,
  DrillTaskRow,
  LiveDrilldown,
} from '../dashboard/drilldownTypes';
import type { OpsSnapshot } from './types';

/** Map native Operations store → LiveDrilldown for Owner Dashboard detail pages. */
export function buildOpsDrilldown(snapshot: OpsSnapshot, now = new Date()): LiveDrilldown {
  const today = now.toISOString().slice(0, 10);
  const jobName = new Map(snapshot.jobs.map((j) => [j.id, j.name]));

  const selectionsByJobId: Record<string, DrillSelectionRow[]> = {};
  for (const row of snapshot.selections) {
    if (row.status !== 'pending') continue;
    const key = numericJobId(row.jobId);
    const list = selectionsByJobId[key] ?? (selectionsByJobId[key] = []);
    list.push({
      id: hashId(row.id),
      jobId: Number(key) || 0,
      jobName: jobName.get(row.jobId) ?? row.jobId,
      title: row.title,
      category: row.category,
      location: row.location,
      statusLabel: 'Pending',
      deadline: row.deadline || '',
    });
  }

  const pastDueByJobId: Record<string, DrillTaskRow[]> = {};
  for (const row of snapshot.tasks) {
    if (row.status !== 'incomplete') continue;
    const due = row.dueDate.slice(0, 10);
    if (!due || due >= today) continue;
    const key = numericJobId(row.jobId);
    const list = pastDueByJobId[key] ?? (pastDueByJobId[key] = []);
    list.push({
      taskId: hashId(row.id),
      jobId: Number(key) || 0,
      jobName: jobName.get(row.jobId) ?? row.jobId,
      title: row.title,
      endDate: due,
      status: 0,
      assignedTo: row.assignee,
    });
  }

  const logsByJobId: Record<string, DrillLogRow[]> = {};
  const logsGrouped = new Map<string, { count: number; last: string; user: string }>();
  for (const row of snapshot.logs) {
    const key = `${row.jobId}::${row.author}`;
    const prev = logsGrouped.get(key);
    const day = row.date.slice(0, 10);
    if (!prev) {
      logsGrouped.set(key, { count: 1, last: day, user: row.author });
    } else {
      prev.count += 1;
      if (day > prev.last) prev.last = day;
    }
  }
  for (const [combo, agg] of logsGrouped) {
    const jobId = combo.split('::')[0]!;
    const key = numericJobId(jobId);
    const list = logsByJobId[key] ?? (logsByJobId[key] = []);
    list.push({
      jobId: Number(key) || 0,
      jobName: jobName.get(jobId) ?? jobId,
      userName: agg.user,
      dailyLogCount: agg.count,
      lastLogDate: agg.last,
    });
  }

  const dealsByStage: Record<string, DrillDealRow[]> = {};
  for (const deal of snapshot.deals) {
    if (deal.archived || deal.stage === 'lost') continue;
    const list = dealsByStage[deal.stage] ?? (dealsByStage[deal.stage] = []);
    list.push({
      id: hashId(deal.id),
      title: deal.title,
      value: deal.value,
      stageName: deal.stage,
      probabilityPct: deal.confidence,
      weightedValue: Math.round(deal.value * (deal.confidence / 100)),
      expectedCloseDate: deal.expectedCloseDate || '',
      status: deal.stage === 'closed' ? 'won' : 'open',
    });
  }

  const baselineSlipByJobId: Record<string, DrillBaselineSlipRow[]> = {};
  for (const row of snapshot.scheduleItems ?? []) {
    const key = numericJobId(row.jobId);
    const list = baselineSlipByJobId[key] ?? (baselineSlipByJobId[key] = []);
    list.push({
      title: row.title,
      endDateSlip: row.endDateSlip,
      durationSlip: row.durationSlip,
      expectedStartDate: row.expectedStartDate,
      actualStartDate: row.actualStartDate,
      expectedEndDate: row.expectedEndDate,
      actualEndDate: row.actualEndDate,
      completed: row.completed,
    });
  }

  return {
    generatedAt: snapshot.settings.refreshedAt,
    dealsByStage,
    selectionsByJobId,
    pastDueByJobId,
    logsByJobId,
    baselineSlipByJobId,
  };
}

function hashId(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
