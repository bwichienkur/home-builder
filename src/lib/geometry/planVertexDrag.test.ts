import { describe, expect, it } from 'vitest';
import { PIXELS_PER_METER } from './snapping';
import {
  applyVertexDrag,
  clampVertexDragTravel,
  exteriorCornerDir,
  samePlanPoint,
  screenHandleMeters,
  snapVertexDrag,
  VERTEX_DRAG_MAX_M,
  vertexDragArmed,
  vertexDragGain,
  vertexSnapStepPx,
  wallDimFaceOffset,
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

  it('slows corner travel far below 1:1 even when zoomed in', () => {
    expect(vertexDragGain(12)).toBeLessThan(0.08);
    expect(vertexDragGain(80)).toBeLessThan(0.18);
    expect(vertexDragGain(80)).toBeGreaterThan(vertexDragGain(12));
  });

  it('caps a single corner gesture so a flick cannot throw the room', () => {
    const start = { x: 0, y: 0 };
    const far = { x: 20 * PIXELS_PER_METER, y: 0 };
    const clamped = clampVertexDragTravel(start, far);
    expect(Math.abs(clamped.x - start.x) / PIXELS_PER_METER).toBeCloseTo(VERTEX_DRAG_MAX_M, 5);
  });

  it('applies low gain, axis lock, and a travel cap together', () => {
    const anchor = { x: 200, y: 200 };
    const startPointer = { x: 200, y: 200 };
    const pointer = { x: 200 + 8 * PIXELS_PER_METER, y: 200 + 0.4 * PIXELS_PER_METER };
    const { point, axis } = applyVertexDrag({
      anchor,
      startPointer,
      pointer,
      others: [],
      zoom: 40,
      axis: null,
    });
    expect(axis).toBe('x');
    expect(Math.abs(point.y - anchor.y)).toBeLessThan(PIXELS_PER_METER * 0.05);
    const movedM = Math.abs(point.x - anchor.x) / PIXELS_PER_METER;
    expect(movedM).toBeLessThan(1.4);
    expect(movedM).toBeGreaterThan(0.2);
  });

  it('parks dim origins on the wall face independent of zoom', () => {
    expect(wallDimWorldOffset(8)).toBeCloseTo(wallDimWorldOffset(80));
    expect(wallDimFaceOffset(0.15)).toBeGreaterThan(0.1);
    expect(wallDimFaceOffset(0.15)).toBeLessThan(0.2);
  });
});
