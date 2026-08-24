import { describe, expect, it } from 'vitest';
import { mapPipedriveDeals, mergeSalesFromPipedrive } from './mapDeals';
import { pipedriveStageKey } from './stageMap';

const salesStages = [
  { id: 1, name: 'First Contact', order_nr: 0, pipeline_id: 1, deal_probability: 10 },
  { id: 2, name: 'Qualified', order_nr: 1, pipeline_id: 1, deal_probability: 25 },
  { id: 4, name: 'Homesite Secured', order_nr: 2, pipeline_id: 1, deal_probability: 40 },
  { id: 3, name: 'Meet with Eric', order_nr: 3, pipeline_id: 1, deal_probability: 55 },
  { id: 5, name: 'Pricing Proposal', order_nr: 4, pipeline_id: 1, deal_probability: 70 },
  { id: 17, name: 'Under Negotiation', order_nr: 5, pipeline_id: 1, deal_probability: 85 },
  { id: 6, name: 'Contract Sent', order_nr: 6, pipeline_id: 1, deal_probability: 100 },
];

describe('mapPipedriveDeals', () => {
  it('maps each Sales pipeline stage with deal counts and dollar totals', () => {
    const mapped = mapPipedriveDeals({
      stages: salesStages,
      openDeals: [
        { id: 1, value: 1_000_000, stage_id: 1, pipeline_id: 1, probability: null },
        { id: 2, value: 2_000_000, stage_id: 5, pipeline_id: 1, probability: null },
        { id: 3, value: 500_000, stage_id: 6, pipeline_id: 1, probability: null },
      ],
      wonDeals: [{ id: 9, value: 3_000_000, status: 'won' }],
    });

    expect(mapped.pipeline.map((s) => s.id)).toEqual(salesStages.map((s) => pipedriveStageKey(s.id)));
    expect(mapped.pipeline.find((s) => s.id === pipedriveStageKey(1))).toMatchObject({
      label: 'First Contact',
      dealCount: 1,
      value: 1_000_000,
    });
    expect(mapped.pipeline.find((s) => s.id === pipedriveStageKey(5))).toMatchObject({
      label: 'Pricing Proposal',
      dealCount: 1,
      value: 2_000_000,
    });
    expect(mapped.pipeline.find((s) => s.id === pipedriveStageKey(6))).toMatchObject({
      label: 'Contract Sent',
      dealCount: 1,
      value: 500_000,
    });
    expect(mapped.pipeline.some((s) => s.id === 'closed')).toBe(false);
    expect(mapped.weightedPipeline).toBe(100_000 + 1_400_000 + 500_000);
    expect(mapped.expectedSigning90d).toBe(500_000);
  });

  it('merges Pipedrive stages into a Buildertrend mapped pull', () => {
    const bt = {
      pipeline: [{ id: 'lead', label: 'Lead', value: 46_000_000 }],
      weightedPipeline: 21_000_000,
      salesPerformance: [
        { id: 'backlog', label: 'Signed Backlog', value: 7_000_000 },
        { id: 'closings', label: 'Projected Closings', value: 5_000_000 },
        { id: 'signing', label: 'Expected Signing Value', value: 46_000_000 },
      ],
    };
    const pd = mapPipedriveDeals({
      stages: salesStages,
      openDeals: [{ id: 1, value: 800_000, stage_id: 6, pipeline_id: 1 }],
      wonDeals: [],
    });
    const merged = mergeSalesFromPipedrive(bt, pd);
    expect(merged.pipeline.find((s) => s.id === pipedriveStageKey(6))?.value).toBe(800_000);
    expect(merged.weightedPipeline).toBe(800_000);
    expect(merged.salesPerformance.find((b) => b.id === 'backlog')?.value).toBe(7_000_000);
    expect(merged.salesPerformance.find((b) => b.id === 'signing')?.value).toBe(800_000);
  });
});
