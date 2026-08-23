import { describe, expect, it } from 'vitest';
import { mapPipedriveDeals, mergeSalesFromPipedrive } from './mapDeals';

describe('mapPipedriveDeals', () => {
  it('buckets Sales open deals by stage and weights with stage probability', () => {
    const mapped = mapPipedriveDeals({
      stages: [
        { id: 1, name: 'First Contact', pipeline_id: 1, deal_probability: 10 },
        { id: 5, name: 'Pricing Proposal', pipeline_id: 1, deal_probability: 70 },
        { id: 6, name: 'Contract Sent', pipeline_id: 1, deal_probability: 100 },
      ],
      openDeals: [
        { id: 1, value: 1_000_000, stage_id: 1, pipeline_id: 1, probability: null },
        { id: 2, value: 2_000_000, stage_id: 5, pipeline_id: 1, probability: null },
        { id: 3, value: 500_000, stage_id: 6, pipeline_id: 1, probability: null },
      ],
      wonDeals: [{ id: 9, value: 3_000_000, status: 'won' }],
    });

    expect(mapped.pipeline.find((s) => s.id === 'lead')?.value).toBe(1_000_000);
    expect(mapped.pipeline.find((s) => s.id === 'proposal')?.value).toBe(2_000_000);
    expect(mapped.pipeline.find((s) => s.id === 'contract')?.value).toBe(500_000);
    expect(mapped.pipeline.find((s) => s.id === 'closed')?.value).toBe(3_000_000);
    // 1M×10% + 2M×70% + 500k×100%
    expect(mapped.weightedPipeline).toBe(100_000 + 1_400_000 + 500_000);
    expect(mapped.expectedSigning90d).toBe(500_000);
  });

  it('merges Pipedrive funnel into a Buildertrend mapped pull', () => {
    const bt = {
      pipeline: [
        { id: 'lead', label: 'Lead', value: 46_000_000 },
        { id: 'proposal', label: 'Proposal', value: 0 },
        { id: 'pre-contract', label: 'Pre-Contract', value: 0 },
        { id: 'contract', label: 'Contract', value: 0 },
        { id: 'closed', label: 'Closed / Won', value: 0 },
      ],
      weightedPipeline: 21_000_000,
      salesPerformance: [
        { id: 'backlog', label: 'Signed Backlog', value: 7_000_000 },
        { id: 'closings', label: 'Projected Closings', value: 5_000_000 },
        { id: 'signing', label: 'Expected Signing Value', value: 46_000_000 },
      ],
    };
    const pd = mapPipedriveDeals({
      stages: [{ id: 6, name: 'Contract Sent', pipeline_id: 1, deal_probability: 100 }],
      openDeals: [{ id: 1, value: 800_000, stage_id: 6, pipeline_id: 1 }],
      wonDeals: [],
    });
    const merged = mergeSalesFromPipedrive(bt, pd);
    expect(merged.pipeline.find((s) => s.id === 'contract')?.value).toBe(800_000);
    expect(merged.weightedPipeline).toBe(800_000);
    expect(merged.salesPerformance.find((b) => b.id === 'backlog')?.value).toBe(7_000_000);
    expect(merged.salesPerformance.find((b) => b.id === 'signing')?.value).toBe(800_000);
  });
});
