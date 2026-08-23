import { isSelectionGreenStatus } from '../buildertrend/mapReports';
import { STAGE_TO_FUNNEL, SALES_PIPELINE_ID } from '../pipedrive/stageMap';
import type {
  DrillDealRow,
  DrillLogRow,
  DrillSelectionRow,
  DrillTaskRow,
  LiveDrilldown,
} from './drilldownTypes';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  const rec = asRecord(value);
  if (rec && typeof rec.value === 'number') return rec.value;
  return 0;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const rec = asRecord(value);
  if (!rec) return '';
  return str(rec.title ?? rec.name ?? rec.Message ?? rec.message);
}

function isoDate(value: unknown): string {
  if (!value) return '';
  const text = str(value);
  if (!text || text.startsWith('0001-01-01')) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

/** Mirrors BT SelectionStatusTag green/pending labels (simplified). */
export function selectionStatusLabel(status: unknown): string {
  const rec = asRecord(status);
  if (!rec) return 'Unknown';
  const code = num(rec.status);
  const choiceCount = num(rec.choiceCount);
  const tbd = num(rec.tbdPriceCount);
  const subPrice = num(rec.subPriceOutstandingCount);
  const maxSelected = num(rec.maxSelected);
  const deadline = isoDate(rec.deadline);
  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(deadline && deadline < today);

  if (code === 2) return 'Selected';
  if (code === 3) return maxSelected === 1 ? 'Selected' : 'Completed';
  if (code === -1) return 'Unreleased';
  if (code === 6) return expired ? 'Partially Complete AND Expired' : 'Partially Completed';
  if (code === 0) {
    const prefix = expired ? 'Expired: ' : 'Pending: ';
    if (choiceCount === 0) return `${prefix}No Choices`;
    if (subPrice > 0) return `${prefix}Vendor Price Out`;
    if (tbd > 0) return `${prefix}TBD Choices Remaining`;
    return `${prefix}Available`;
  }
  return `Status ${code}`;
}

function jobNameMap(jobs: Array<{ jobID?: number; jobId?: number; jobName?: string; NewJobName?: string }>) {
  const map = new Map<number, string>();
  for (const job of jobs) {
    const id = num(job.jobID ?? job.jobId);
    const name = str(job.jobName ?? job.NewJobName);
    if (id && name) map.set(id, name);
  }
  return map;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  for (const key of ['rowData', 'jobs', 'data', 'tasks', 'items']) {
    if (Array.isArray(rec[key])) return rec[key] as unknown[];
    const nested = asRecord(rec[key]);
    if (nested) {
      for (const inner of ['rowData', 'jobs', 'data', 'tasks']) {
        if (Array.isArray(nested[inner])) return nested[inner] as unknown[];
      }
    }
  }
  return [];
}

export function buildLiveDrilldown(input: {
  buildertrend: { pulledAt?: string; reports?: any };
  pipedrive?: { pulledAt?: string; reports?: any } | null;
  now?: Date;
}): LiveDrilldown {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const bt = input.buildertrend.reports ?? {};
  const names = jobNameMap(asArray(bt.jobs) as any);

  const selectionsByJobId: Record<string, DrillSelectionRow[]> = {};
  for (const [jobId, rows] of Object.entries(bt.selectionsByJob ?? {})) {
    if (!Array.isArray(rows)) continue;
    const pending: DrillSelectionRow[] = [];
    for (const row of rows) {
      const rec = asRecord(row);
      if (!rec || isSelectionGreenStatus(rec.status)) continue;
      const titleRec = asRecord(rec.title);
      pending.push({
        id: num(rec.id),
        jobId: num(jobId),
        jobName: names.get(num(jobId)) || str(jobId),
        title: str(titleRec?.title ?? rec.title),
        category: str(rec.category),
        location: str(rec.location),
        statusLabel: selectionStatusLabel(rec.status),
        deadline: isoDate(asRecord(rec.deadline)?.deadline ?? rec.deadline),
      });
    }
    if (pending.length) selectionsByJobId[String(jobId)] = pending;
  }

  const pastDueByJobId: Record<string, DrillTaskRow[]> = {};
  for (const row of asArray(asRecord(bt.tasks)?.tasks ?? bt.tasks)) {
    const task = asRecord(row);
    if (!task || task.isDeleted) continue;
    if (num(task.status) !== 0) continue;
    const due = isoDate(task.endDate ?? task.endDateTimeCalculated ?? task.baseEndDate);
    if (!due || due >= today) continue;
    const jobId = num(task.jobId ?? task.jobID);
    if (!jobId) continue;
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    const assignedTo = assignments
      .map((a) => str(asRecord(a)?.name ?? asRecord(a)?.fullName))
      .filter(Boolean)
      .join(', ');
    const list = pastDueByJobId[String(jobId)] ?? (pastDueByJobId[String(jobId)] = []);
    list.push({
      taskId: num(task.taskId ?? task.id),
      jobId,
      jobName: names.get(jobId) || str(jobId),
      title: str(task.title ?? task.name),
      endDate: due,
      status: num(task.status),
      assignedTo,
    });
  }

  const logsByJobId: Record<string, DrillLogRow[]> = {};
  for (const row of asArray(bt.userDailyLogsRecent)) {
    const rec = asRecord(row);
    if (!rec) continue;
    const jobId = num(rec.jobID ?? rec.jobId);
    if (!jobId) continue;
    const list = logsByJobId[String(jobId)] ?? (logsByJobId[String(jobId)] = []);
    list.push({
      jobId,
      jobName: str(rec.jobName) || names.get(jobId) || String(jobId),
      userName: str(rec.userName),
      dailyLogCount: num(rec.dailyLogCount ?? rec.logCount),
      lastLogDate: isoDate(rec.lastLogDate),
    });
  }

  const dealsByStage: Record<string, DrillDealRow[]> = {
    lead: [],
    proposal: [],
    'pre-contract': [],
    contract: [],
    closed: [],
  };
  const pd = input.pipedrive?.reports;
  if (pd) {
    const stages = Array.isArray(pd.stages) ? pd.stages : [];
    const stageName = (id: number) => str(stages.find((s: any) => s.id === id)?.name) || String(id);
    const stageProb = (id: number) => {
      const pct = num(stages.find((s: any) => s.id === id && !s.is_deleted)?.deal_probability);
      return pct > 1 ? pct : pct;
    };
    for (const deal of pd.openDeals ?? []) {
      if (deal.pipeline_id !== SALES_PIPELINE_ID) continue;
      const stageId = num(deal.stage_id);
      const funnel = STAGE_TO_FUNNEL[stageId];
      if (!funnel) continue;
      const value = num(deal.value);
      const dealProb = num(deal.probability);
      const probabilityPct = dealProb > 0 ? (dealProb > 1 ? dealProb : dealProb * 100) : stageProb(stageId);
      const pct = probabilityPct > 1 ? probabilityPct : probabilityPct * 100;
      dealsByStage[funnel].push({
        id: num(deal.id),
        title: str(deal.title),
        value,
        stageName: stageName(stageId),
        probabilityPct: pct,
        weightedValue: value * (pct / 100),
        expectedCloseDate: isoDate(deal.expected_close_date),
        status: str(deal.status) || 'open',
      });
    }
    for (const deal of pd.wonDeals ?? []) {
      const value = num(deal.value);
      dealsByStage.closed.push({
        id: num(deal.id),
        title: str(deal.title),
        value,
        stageName: 'Won',
        probabilityPct: 100,
        weightedValue: value,
        expectedCloseDate: isoDate(deal.won_time ?? deal.local_won_date),
        status: 'won',
      });
    }
  }

  return {
    generatedAt: input.pipedrive?.pulledAt || input.buildertrend.pulledAt || now.toISOString(),
    dealsByStage,
    selectionsByJobId,
    pastDueByJobId,
    logsByJobId,
  };
}

export function numericJobId(ownerJobId: string): string {
  return ownerJobId.replace(/^bt-/, '');
}
