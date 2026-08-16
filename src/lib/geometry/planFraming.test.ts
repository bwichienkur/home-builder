import { describe, expect, it } from 'vitest';
import type { Wall } from '../../types';
import { framingFromWall, framingFromWalls, freeAreaFit, orbitViewPose, pageCenterFit, topViewHeight, worldShiftForFreeArea } from './planFraming';

const rect: Wall[] = [
  { id: 'w1', start: { x: 180, y: 150 }, end: { x: 660, y: 150 }, thickness: 0.15, height: 2.7 },
  { id: 'w2', start: { x: 660, y: 150 }, end: { x: 660, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w3', start: { x: 660, y: 510 }, end: { x: 180, y: 510 }, thickness: 0.15, height: 2.7 },
  { id: 'w4', start: { x: 180, y: 510 }, end: { x: 180, y: 150 }, thickness: 0.15, height: 2.7 },
];

describe('plan framing', () => {
  it('frames a room high enough to see the whole plate', () => {
    const framing = framingFromWalls(rect);
    expect(framing.span).toBeGreaterThan(4);
    expect(framing.topHeight).toBeGreaterThan(framing.span);
    expect(framing.topPose[1]).toBe(framing.topHeight);
    // Not dead-center above target (avoids lookAt singularity / blank view).
    expect(framing.topPose[2]).not.toBe(framing.center[2]);
  });

  it('scales height with span for large house plans', () => {
    const small = topViewHeight(8);
    const large = topViewHeight(40);
    expect(large).toBeGreaterThan(small * 3);
    expect(large).toBeGreaterThan(70); // beyond the old fog far-plane that blanked plans
  });

  it('orbits from the south so the full plate fills the frame', () => {
    const framing = framingFromWalls(rect);
    const [ox, oy, oz] = framing.orbitPose;
    expect(ox).toBeCloseTo(framing.center[0], 3);
    expect(oy).toBeGreaterThan(framing.span * 0.25);
    // Not so far that the plate becomes a speck in empty void.
    expect(oy).toBeLessThan(framing.span * 1.8);
    expect(oz).toBeGreaterThan(framing.center[2]);
    const centered = orbitViewPose(framing.center, framing.span);
    expect(centered[0]).toBeCloseTo(framing.center[0], 3);
  });

  it('keeps orbit pad independent from top chrome pad', () => {
    const looseTop = framingFromWalls(rect, { pad: 3.1, orbitPad: 1.18 });
    const tightBoth = framingFromWalls(rect, { pad: 1.18, orbitPad: 1.18 });
    expect(looseTop.orbitPose[1]).toBeCloseTo(tightBoth.orbitPose[1], 3);
    expect(looseTop.topHeight).toBeGreaterThan(tightBoth.topHeight);
  });

  it('frames a single wall with a closer camera than a large house plate', () => {
    const large: Wall[] = [
      { id: 'a', start: { x: 100, y: 100 }, end: { x: 1400, y: 100 }, thickness: 0.15, height: 2.7 },
      { id: 'b', start: { x: 1400, y: 100 }, end: { x: 1400, y: 1000 }, thickness: 0.15, height: 2.7 },
      { id: 'c', start: { x: 1400, y: 1000 }, end: { x: 100, y: 1000 }, thickness: 0.15, height: 2.7 },
      { id: 'd', start: { x: 100, y: 1000 }, end: { x: 100, y: 100 }, thickness: 0.15, height: 2.7 },
    ];
    const plate = framingFromWalls(large, { pad: 2.85, minHeight: 12 });
    const one = framingFromWall(large[0]!, { pad: 2.05, minHeight: 6.2, exteriorSide: -1 });
    expect(one.topHeight).toBeLessThan(plate.topHeight);
  });

  it('zooms out when the focused wall grows longer', () => {
    const short = framingFromWall(
      { id: 'a', start: { x: 200, y: 200 }, end: { x: 280, y: 200 }, thickness: 0.15, height: 2.7 },
      { pad: 2.05, minHeight: 6.2, exteriorSide: 1 },
    );
    // Long enough that wall length (not the dim-card pad) drives the frame.
    const long = framingFromWall(
      { id: 'a', start: { x: 200, y: 200 }, end: { x: 1400, y: 200 }, thickness: 0.15, height: 2.7 },
      { pad: 2.05, minHeight: 6.2, exteriorSide: 1 },
    );
    expect(long.topHeight).toBeGreaterThan(short.topHeight);
  });

  it('leaves margin around a focused wall so side fields fit', () => {
    const one = framingFromWall(rect[0]!, { pad: 2.05, minHeight: 6.2, exteriorSide: -1 });
    // Span should exceed bare wall length (~6 m) so L/W/H have breathing room.
    expect(one.span).toBeGreaterThan(6);
    expect(one.topHeight).toBeGreaterThan(one.span * 0.9);
  });

  it('biases framing toward the exterior side that holds L/W/H', () => {
    const wall = rect[0]!;
    const outside = framingFromWall(wall, { pad: 2.05, minHeight: 6.2, exteriorSide: -1 });
    const inside = framingFromWall(wall, { pad: 2.05, minHeight: 6.2, exteriorSide: 1 });
    // Top wall (y=150): exterior −normal is toward −Z / smaller plan y, so center Z should be smaller.
    expect(outside.center[2]).toBeLessThan(inside.center[2]);
    expect(outside.span).toBeGreaterThan(6);
  });

  it('frames vertical walls with enough side span for wide Html chips', () => {
    const vertical = rect[1]!;
    const framing = framingFromWall(vertical, { pad: 2.05, minHeight: 6.2, exteriorSide: -1 });
    // Bare wall length ≈ 4.5 m; side chips need extra span beyond that.
    expect(framing.span).toBeGreaterThan(4.5);
  });

  it('zooms a page-centered plate so it clears the right rail', () => {
    const fit = pageCenterFit({
      width: 390,
      height: 844,
      rightChromePx: 68,
      gutterPx: 10,
      topChromePx: 68,
      bottomChromePx: 130,
    });
    // Page-centered: reserve the rail once with a little mirrored slack (1.45×).
    expect(fit.rightReserve).toBe(78);
    expect(fit.maxPlateW).toBeCloseTo(390 - 78 * 1.45, 5);
    expect(fit.padScale).toBeGreaterThan(1.2);
    expect(fit.padScale).toBeLessThan(1.8);
    expect(fit.shiftFraction).toBe(0);
  });

  it('shifts into the free area left of a wide edit inspector', () => {
    const fit = freeAreaFit({
      width: 390,
      height: 844,
      rightChromePx: Math.min(260, Math.round(390 * 0.44)),
      gutterPx: 16,
      topChromePx: 72,
      bottomChromePx: 150,
    });
    expect(fit.shiftFraction).toBeGreaterThan(0.2);
    expect(fit.padScale).toBeGreaterThan(1.5);
    const shift = worldShiftForFreeArea(fit.shiftFraction, 28, 42, 390 / 844);
    expect(shift).toBeGreaterThan(2);
  });
});
