import { describe, expect, it } from 'vitest';
import { PIXELS_PER_METER } from './snapping';
import {
  exteriorCornerDir,
  samePlanPoint,
  screenHandleMeters,
  snapVertexDrag,
  vertexDragArmed,
  vertexDragGain,
  vertexSnapStepPx,
  wallDimWorldOffset,
} from './planVertexDrag';

describe('plan vertex drag', () => {
  it('uses a 3 in grid when the plan is zoomed out', () => {
    const step = vertexSnapStepPx(10);
    expect(step).toBeCloseTo(0.0254 * 3 * PIXELS_PER_METER, 5);
  });

  it('uses a finer grid when zoomed in', () => {
    expect(vertexSnapStepPx(280)).toBeCloseTo(0.0254 * PIXELS_PER_METER, 5);
  });

  it('snaps to another vertex axis so walls stay square', () => {
    const others = [{ x: 400, y: 200 }];
    const snapped = snapVertexDrag({ x: 403, y: 311 }, others, 12);
    expect(snapped.x).toBe(400);
  });

  it('waits for a screen-pixel threshold before arming the drag', () => {
    const start = { x: 0, y: 0 };
    const tiny = { x: 2, y: 0 };
    expect(vertexDragArmed(start, tiny, 40)).toBe(false);
    expect(vertexDragArmed(start, { x: 40, y: 0 }, 40)).toBe(true);
  });

  it('keeps corner handles readable when zoomed out', () => {
    expect(screenHandleMeters(8, 18)).toBeGreaterThan(0.2);
    expect(screenHandleMeters(200, 18)).toBeGreaterThanOrEqual(0.14);
  });

  it('treats near-identical plan points as unchanged', () => {
    expect(samePlanPoint({ x: 10, y: 10 }, { x: 10.2, y: 10.1 })).toBe(true);
    expect(samePlanPoint({ x: 10, y: 10 }, { x: 40, y: 10 })).toBe(false);
  });

  it('points corner handles outward from the room centroid', () => {
    const centroid = { x: 200, y: 200 };
    const dir = exteriorCornerDir({ x: 100, y: 300 }, { x: 100, y: 100 }, { x: 300, y: 100 }, centroid);
    expect(dir.x).toBeLessThan(0);
    expect(dir.y).toBeLessThan(0);
  });

  it('slows corner travel when the plan is zoomed out', () => {
    expect(vertexDragGain(12)).toBeLessThan(0.5);
    expect(vertexDragGain(80)).toBe(1);
  });

  it('offsets dim pills by more than half their screen size', () => {
    const z = 20;
    expect(wallDimWorldOffset(z)).toBeGreaterThan((22 + 16) / z);
  });
});
