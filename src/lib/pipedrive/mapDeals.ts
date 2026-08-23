import type { PipelineStage, SalesPerformanceBar } from '../buildertrend/types';
import { STAGE_TO_FUNNEL, SALES_PIPELINE_ID } from './stageMap';

export type PipedriveReports = {
  company?: { id?: number; name?: string; domain?: string };
  pipelines?: unknown[];
  stages?: Array<{
    id: number;
    name: string;
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

function emptyFunnel(): Record<string, number> {
  return { lead: 0, proposal: 0, 'pre-contract': 0, contract: 0, closed: 0 };
}

export function mapPipedriveDeals(reports: PipedriveReports, options?: { now?: Date }): MappedPipedrivePull {
  const now = options?.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);

  const buckets = emptyFunnel();
  let weighted = 0;
  let expectedSigning = 0;
  let contractSent = 0;

  const openSales = (reports.openDeals ?? []).filter(
    (deal) => deal.pipeline_id === SALES_PIPELINE_ID || deal.pipeline_id == null,
  );

  for (const deal of openSales) {
    const value = num(deal.value);
    const funnelId = STAGE_TO_FUNNEL[deal.stage_id as keyof typeof STAGE_TO_FUNNEL];
    if (funnelId) buckets[funnelId] = (buckets[funnelId] ?? 0) + value;
    weighted += value * dealProbability(deal, reports);
    if (funnelId === 'contract') contractSent += value;
    const close = deal.expected_close_date;
    if (close && close >= today && close <= horizon) expectedSigning += value;
  }

  for (const deal of reports.wonDeals ?? []) {
    buckets.closed += num(deal.value);
  }

  const pipeline: PipelineStage[] = [
    { id: 'lead', label: 'Lead', value: buckets.lead },
    { id: 'proposal', label: 'Proposal', value: buckets.proposal },
    { id: 'pre-contract', label: 'Pre-Contract', value: buckets['pre-contract'] },
    { id: 'contract', label: 'Contract', value: buckets.contract },
    { id: 'closed', label: 'Closed / Won', value: buckets.closed },
  ];

  // Many Sales deals lack expected_close_date; Contract Sent is the nearest “about to sign” bucket.
  const signing = expectedSigning > 0 ? expectedSigning : contractSent;

  return {
    pipeline,
    weightedPipeline: Math.round(weighted),
    expectedSigning90d: Math.round(signing),
    salesPerformance: [
      { id: 'signing', label: 'Expected Signing Value', value: Math.round(signing) },
    ],
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
