import { describe, expect, it } from 'vitest';
import { estimatedTimeMetricsForJob } from './estimatedTimeMetrics';

describe('estimatedTimeMetricsForJob', () => {
  it('computes contract, permit, and slab pour to close from Gantt milestone dates', () => {
    const metrics = estimatedTimeMetricsForJob({
      firstScheduleStart: '2024-01-01',
      permittingEndDate: '2024-04-01',
      foundationStartDate: '2024-05-01',
      closingEndDate: '2025-01-01',
    });
    expect(metrics).toEqual([
      { id: 'contract-close', label: 'Est. contract to close', days: 366, deltaDays: 0 },
      { id: 'permit-close', label: 'Est. permit to close', days: 275, deltaDays: 0 },
      { id: 'slab-close', label: 'Est. slab pour to close', days: 245, deltaDays: 0 },
    ]);
  });

  it('returns empty when closing milestone is missing', () => {
    expect(
      estimatedTimeMetricsForJob({
        firstScheduleStart: '2024-01-01',
        permittingEndDate: '2024-04-01',
        foundationStartDate: '2024-05-01',
      }),
    ).toEqual([]);
  });

  it('omits metrics when start/end pair is incomplete', () => {
    const metrics = estimatedTimeMetricsForJob({
      closingEndDate: '2025-01-01',
      foundationStartDate: '2024-05-01',
    });
    expect(metrics.map((m) => m.id)).toEqual(['slab-close']);
  });
});
