import { describe, expect, it } from 'vitest';
import {
  clampInsertT,
  pointOnPolygonEdge,
  projectPointOntoPolygonOutline,
  projectPointOntoSegment,
  splitEdgeEndpoints,
} from './planCornerGhost';

const square: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 80 },
  { x: 0, y: 80 },
];

describe('planCornerGhost', () => {
  it('projects onto a segment with clamped t', () => {
    const hit = projectPointOntoSegment({ x: 40, y: -20 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(hit.t).toBeCloseTo(0.4);
    expect(hit.point.x).toBeCloseTo(40);
    expect(hit.point.y).toBeCloseTo(0);
  });

  it('snaps an interior point onto the nearest outline edge', () => {
    const hit = projectPointOntoPolygonOutline(square, { x: 50, y: 10 });
    expect(hit).not.toBeNull();
    expect(hit!.edgeIndex).toBe(0);
    expect(hit!.t).toBeCloseTo(0.5);
    expect(hit!.point.y).toBeCloseTo(0);
  });

  it('can slide onto an adjacent edge', () => {
    const hit = projectPointOntoPolygonOutline(square, { x: 110, y: 40 });
    expect(hit).not.toBeNull();
    expect(hit!.edgeIndex).toBe(1);
    expect(hit!.point.x).toBeCloseTo(100);
    expect(hit!.t).toBeCloseTo(0.5);
  });

  it('clamps insert t away from existing vertices', () => {
    expect(clampInsertT(0, 100, 10)).toBeCloseTo(0.1);
    expect(clampInsertT(1, 100, 10)).toBeCloseTo(0.9);
    expect(clampInsertT(0.4, 100, 10)).toBeCloseTo(0.4);
  });

  it('builds split-edge endpoints for live L pills', () => {
    const split = splitEdgeEndpoints(square, 0, 0.25);
    expect(split).not.toBeNull();
    expect(split!.a).toEqual({ x: 0, y: 0 });
    expect(split!.b).toEqual({ x: 100, y: 0 });
    expect(split!.ghost.x).toBeCloseTo(25);
    expect(pointOnPolygonEdge(square, 2, 0.5)?.x).toBeCloseTo(50);
  });
});
