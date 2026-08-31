/**
 * Synthetic multi-plan fidelity fixtures — Stillwater is the only real CAD package
 * in-repo; these fixtures keep the gate from overfitting a single envelope shape.
 */
import { describe, expect, it } from 'vitest';
import { roomsFromFloodFill } from './dxfRooms';
import { computePlanFidelityMetrics, evaluatePlanFidelity } from './planFidelity';
import type { HousePlan } from './buildPlan';

function boxPlan(rooms: { name: string; x: number; y: number; w: number; h: number }[]): HousePlan {
  return {
    id: 'synthetic',
    name: 'Synthetic',
    stories: 1,
    beds: 2,
    baths: 1,
    livingSqFt: rooms.reduce((s, r) => s + r.w * r.h, 0),
    sourceUrl: 'synthetic',
    note: 'Synthetic fidelity fixture',
    floors: [
      {
        id: 'f1',
        name: '1',
        rooms: rooms.map((r, i) => ({
          id: `r${i}`,
          name: r.name,
          roomType: 'Living room' as const,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
        })),
      },
    ],
  };
}

describe('synthetic multi-plan fidelity fixtures', () => {
  it('open-plan rectangle with labels covers the plate after flood-fill', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 40, y2: 0 },
      { x1: 40, y1: 0, x2: 40, y2: 24 },
      { x1: 40, y1: 24, x2: 0, y2: 24 },
      { x1: 0, y1: 24, x2: 0, y2: 0 },
    ];
    const soft = [{ x1: 20, y1: 1, x2: 20, y2: 23, linetype: 'DASHED', layer: 'WALLS INT' }];
    const { rooms, warnings } = roomsFromFloodFill(
      segs,
      [
        { x: 10, y: 12, text: 'KITCHEN' },
        { x: 30, y: 12, text: 'GREAT ROOM' },
      ],
      { softPartitions: soft },
    );
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    const plan = boxPlan(rooms.map((r) => ({ name: r.name, x: r.x, y: r.y, w: r.w, h: r.h })));
    plan.livingSqFt = rooms.reduce((s, r) => s + r.w * r.h, 0);
    const metrics = computePlanFidelityMetrics(plan, {
      expectedNamePatterns: ['KITCHEN', 'GREAT'],
      importWarnings: warnings,
    });
    const result = evaluatePlanFidelity(metrics, {
      minRoomCount: 2,
      minNamedHits: 2,
      minEnvelopeCoveragePct: 0.5,
      minLivingSqFt: 400,
      minGrossRoomAreaSqFt: 400,
      requiredNamePatterns: ['KITCHEN', 'GREAT'],
    });
    expect(result.pass).toBe(true);
  });

  it('two-cell ranch with garage + living meets basic coverage', () => {
    const segs = [
      { x1: 0, y1: 0, x2: 36, y2: 0 },
      { x1: 36, y1: 0, x2: 36, y2: 24 },
      { x1: 36, y1: 24, x2: 0, y2: 24 },
      { x1: 0, y1: 24, x2: 0, y2: 0 },
      { x1: 14, y1: 0, x2: 14, y2: 24 },
    ];
    const { rooms, warnings } = roomsFromFloodFill(segs, [
      { x: 7, y: 12, text: 'GARAGE' },
      { x: 25, y: 12, text: 'LIVING' },
    ]);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    const plan = boxPlan(rooms.map((r) => ({ name: r.name, x: r.x, y: r.y, w: r.w, h: r.h })));
    plan.livingSqFt = rooms.reduce((s, r) => s + r.w * r.h, 0);
    const metrics = computePlanFidelityMetrics(plan, {
      expectedNamePatterns: ['GARAGE', 'LIVING'],
      importWarnings: warnings,
    });
    expect(metrics.namedRoomHits.length).toBeGreaterThanOrEqual(2);
    expect(metrics.roomCount).toBeGreaterThanOrEqual(2);
  });
});
