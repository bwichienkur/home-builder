import type { PipelineStage, SalesPerformanceBar } from '../buildertrend/types';
import { CONTRACT_SENT_STAGE_ID, pipedriveStageKey, SALES_PIPELINE_ID } from './stageMap';

export type PipedriveReports = {
  company?: { id?: number; name?: string; domain?: string };
  pipelines?: unknown[];
  stages?: Array<{
    id: number;
    name: string;
    order_nr: number;
    pipeline_id: number;
    deal_probability?: number;
    is_deleted?: boolean;
  }>;
  openDeals?: Array<{
    id: number;
    title?: string;
    value?: number | string;
    stage_id?: number;
    pipeline_id?: number;
    status?: string;
    probability?: number | null;
    expected_close_date?: string | null;
  }>;
  wonDeals?: Array<{
    id: number;
    value?: number | string;
    status?: string;
    won_time?: string | null;
    pipeline_id?: number;
  }>;
};

export type MappedPipedrivePull = {
  pipeline: PipelineStage[];
  weightedPipeline: number;
  /** Open Sales deals with expected_close_date within 90 days (falls back to Contract Sent $). */
  expectedSigning90d: number;
  salesPerformance: SalesPerformanceBar[];
  openDealCount: number;
  wonDealCount: number;
};

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stageProbability(reports: PipedriveReports, stageId: number | undefined): number {
  if (stageId == null) return 0;
  const stage = (reports.stages ?? []).find((row) => row.id === stageId && !row.is_deleted);
  const pct = num(stage?.deal_probability);
  return pct > 1 ? pct / 100 : pct;
}

function dealProbability(deal: { probability?: number | null; stage_id?: number }, reports: PipedriveReports): number {
  const raw = num(deal.probability);
  if (raw > 0) return raw > 1 ? raw / 100 : raw;
  return stageProbability(reports, deal.stage_id);
}

function salesPipelineStages(reports: PipedriveReports) {
  return (reports.stages ?? [])
    .filter((stage) => stage.pipeline_id === SALES_PIPELINE_ID && !stage.is_deleted)
    .sort((a, b) => a.order_nr - b.order_nr);
}

export function mapPipedriveDeals(reports: PipedriveReports, options?: { now?: Date }): MappedPipedrivePull {
  const now = options?.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);

  const weightedByStage = new Map<number, number>();
  const countByStage = new Map<number, number>();
  let weighted = 0;
  let expectedSigning = 0;
  let contractSent = 0;

  const openSales = (reports.openDeals ?? []).filter(
    (deal) => deal.pipeline_id === SALES_PIPELINE_ID || deal.pipeline_id == null,
  );

  for (const deal of openSales) {
    const stageId = deal.stage_id;
    if (stageId == null) continue;
    const value = num(deal.value);
    const dealWeighted = value * dealProbability(deal, reports);
    weightedByStage.set(stageId, (weightedByStage.get(stageId) ?? 0) + dealWeighted);
    countByStage.set(stageId, (countByStage.get(stageId) ?? 0) + 1);
    weighted += dealWeighted;
    if (stageId === CONTRACT_SENT_STAGE_ID) contractSent += value;
    const close = deal.expected_close_date;
    if (close && close >= today && close <= horizon) expectedSigning += value;
  }

  const pipeline: PipelineStage[] = salesPipelineStages(reports).map((stage) => ({
    id: pipedriveStageKey(stage.id),
    label: stage.name,
    /** Weighted deal value sum for this Pipedrive stage. */
    value: Math.round(weightedByStage.get(stage.id) ?? 0),
    dealCount: countByStage.get(stage.id) ?? 0,
  }));

  const signing = expectedSigning > 0 ? expectedSigning : contractSent;

  return {
    pipeline,
    weightedPipeline: Math.round(weighted),
    expectedSigning90d: Math.round(signing),
    salesPerformance: [{ id: 'signing', label: 'Expected Signing Value', value: Math.round(signing) }],
    openDealCount: openSales.length,
    wonDealCount: (reports.wonDeals ?? []).length,
  };
}

/** Prefer Pipedrive funnel stages; keep BT backlog/closings from jobs. */
export function mergeSalesFromPipedrive<T extends { pipeline: PipelineStage[]; weightedPipeline?: number; salesPerformance: SalesPerformanceBar[] }>(
  mapped: T,
  pipedrive: MappedPipedrivePull | null | undefined,
): T {
  if (!pipedrive || pipedrive.openDealCount <= 0) return mapped;
  const salesPerformance = mapped.salesPerformance.map((bar) => {
    if (bar.id === 'signing') return { ...bar, value: pipedrive.expectedSigning90d };
    return bar;
  });
  if (!salesPerformance.some((bar) => bar.id === 'signing')) {
    salesPerformance.push({ id: 'signing', label: 'Expected Signing Value', value: pipedrive.expectedSigning90d });
  }
  return {
    ...mapped,
    pipeline: pipedrive.pipeline,
    weightedPipeline: pipedrive.weightedPipeline,
    salesPerformance,
  };
}
