import { describe, expect, it } from 'vitest';
import type { HousePlan, PlanRoomRect } from './buildPlan';
import {
  computePlanFidelityMetrics,
  computeWallBboxSqFt,
  evaluatePlanFidelity,
  matchRoomNamePatterns,
  parseEnvelopeCoveragePct,
  rasterFloorCoveragePct,
  type PlanFidelityThresholds,
} from './planFidelity';

function room(name: string, x: number, y: number, w: number, h: number): PlanRoomRect {
  return {
    id: `r-${name}`,
    name,
    roomType: 'Living room',
    x,
    y,
    w,
    h,
  };
}

function miniPlan(rooms: PlanRoomRect[]): HousePlan {
  return {
    id: 'test',
    name: 'Test',
    stories: 1,
    beds: 3,
    baths: 2,
    livingSqFt: rooms.reduce((s, r) => s + r.w * r.h, 0),
    sourceUrl: 'test',
    note: 'test fixture',
    floors: [{ id: 'f1', name: 'Floor 1', rooms }],
  };
}

describe('planFidelity metrics', () => {
  it('computes wall bbox from room spans', () => {
    const rooms = [room('A', 0, 0, 10, 10), room('B', 10, 0, 10, 10)];
    expect(computeWallBboxSqFt(rooms)).toBe(200);
  });

  it('raster coverage fills a simple rectangle plate', () => {
    const rooms = [room('Whole', 0, 0, 20, 10)];
    expect(rasterFloorCoveragePct(rooms, 0.5)).toBeGreaterThan(0.95);
  });

  it('parses envelope coverage from import warnings', () => {
    expect(
      parseEnvelopeCoveragePct([
        'Detected 21 enclosed room(s) via sealed-envelope flood-fill (62% wall-bbox coverage).',
      ]),
    ).toBeCloseTo(0.62);
  });

  it('matches expected room name patterns', () => {
    const { hits, missing } = matchRoomNamePatterns(
      ['3-CAR GARAGE', 'GREAT ROOM', 'KITCHEN'],
      ['GARAGE', 'GREAT', 'LANAI'],
    );
    expect(hits).toEqual(['GARAGE', 'GREAT']);
    expect(missing).toEqual(['LANAI']);
  });

  it('evaluates pass/fail against thresholds', () => {
    const plan = miniPlan([
      room('GARAGE', 0, 0, 20, 20),
      room('KITCHEN', 20, 0, 20, 20),
      room('GREAT ROOM', 0, 20, 40, 20),
    ]);
    const metrics = computePlanFidelityMetrics(plan, {
      expectedNamePatterns: ['GARAGE', 'KITCHEN', 'GREAT'],
      importWarnings: ['Detected 3 room(s) (75% wall-bbox coverage).'],
    });
    const thresholds: PlanFidelityThresholds = {
      minRoomCount: 3,
      minNamedHits: 3,
      minEnvelopeCoveragePct: 0.7,
      minLivingSqFt: 1000,
      minGrossRoomAreaSqFt: 1000,
      requiredNamePatterns: ['GARAGE', 'KITCHEN'],
    };
    const result = evaluatePlanFidelity(metrics, thresholds);
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('reports failures when envelope coverage drops', () => {
    const plan = miniPlan([room('Only', 0, 0, 10, 10)]);
    const metrics = computePlanFidelityMetrics(plan, {
      importWarnings: ['Detected 1 room(s) (20% wall-bbox coverage).'],
    });
    const result = evaluatePlanFidelity(metrics, {
      minRoomCount: 1,
      minNamedHits: 0,
      minEnvelopeCoveragePct: 0.5,
      minLivingSqFt: 0,
      minGrossRoomAreaSqFt: 0,
      requiredNamePatterns: [],
    });
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => /envelope coverage/i.test(f))).toBe(true);
  });
});
