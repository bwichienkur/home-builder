import { describe, expect, it } from 'vitest';
import {
  computeConstructionTakeoff,
  constructionTakeoffCsv,
  mergeConstructionTakeoffs,
} from './constructionTakeoff';
import { buildEstimateSnapshot, createChangeOrderRecord, diffEstimateAgainstBaseline } from './estimateSnapshot';
import { DEFAULT_TRADE_RATES } from '../store/tradeRatesStore';
import type { Wall } from '../types';

describe('computeConstructionTakeoff', () => {
  it('sums wall length, floor area, studs, roof, and drywall for a rectangle', () => {
    const walls: Wall[] = [
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'b', start: { x: 800, y: 0 }, end: { x: 800, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'c', start: { x: 800, y: 600 }, end: { x: 0, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      { id: 'd', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
    ];
    const takeoff = computeConstructionTakeoff({
      walls,
      openings: [
        { id: 'd1', wallId: 'a', type: 'door', offset: 0.4, width: 0.9, height: 2.1, sill: 0 },
        { id: 'w1', wallId: 'b', type: 'window', offset: 0.5, width: 1.2, height: 1.2, sill: 0.9 },
      ],
      furniture: [],
    });
    expect(takeoff.wallLengthM).toBeCloseTo(35, 0);
    expect(takeoff.exteriorWallLengthM).toBeCloseTo(35, 0);
    expect(takeoff.floorAreaM2).toBeCloseTo(75, 0);
    expect(takeoff.doorCount).toBe(1);
    expect(takeoff.windowCount).toBe(1);
    expect(takeoff.studCount).toBeGreaterThan(20);
    expect(takeoff.plateLengthM).toBeCloseTo(takeoff.wallLengthM * 2, 5);
    expect(takeoff.headerCount).toBe(2);
    expect(takeoff.roofAreaM2).toBeGreaterThan(takeoff.floorAreaM2);
    expect(takeoff.footingLengthM).toBeCloseTo(takeoff.exteriorWallLengthM, 5);
    expect(takeoff.drywallAreaM2).toBeGreaterThan(100);
    expect(constructionTakeoffCsv(takeoff, { name: 'Test', unitSystem: 'metric' })).toContain('Drywall');
  });

  it('merges multi-floor takeoffs', () => {
    const walls: Wall[] = [
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'interior' },
    ];
    const a = computeConstructionTakeoff({ walls, openings: [], furniture: [], includeEnvelope: false });
    const merged = mergeConstructionTakeoffs([a, a]);
    expect(merged.wallLengthM).toBeCloseTo(a.wallLengthM * 2, 5);
    expect(merged.studCount).toBe(a.studCount * 2);
  });

  it('prices estimate with tax and markup', () => {
    const takeoff = computeConstructionTakeoff({
      walls: [
        { id: 'a', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
        { id: 'b', start: { x: 800, y: 0 }, end: { x: 800, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
        { id: 'c', start: { x: 800, y: 600 }, end: { x: 0, y: 600 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
        { id: 'd', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 2.7, assembly: 'exterior' },
      ],
      openings: [],
      furniture: [],
    });
    const snap = buildEstimateSnapshot({ takeoff, rates: DEFAULT_TRADE_RATES });
    expect(snap.lines.length).toBeGreaterThan(5);
    expect(snap.lines.every((l) => l.csi)).toBe(true);
    expect(snap.totals.grandTotal).toBeGreaterThan(snap.totals.subtotal);
    const next = buildEstimateSnapshot({ takeoff, rates: { ...DEFAULT_TRADE_RATES, drywallPerSf: 3 }, previousVersion: snap.version });
    const delta = diffEstimateAgainstBaseline(next, snap);
    expect(delta.hasBaseline).toBe(true);
    expect(delta.delta).not.toBe(0);
    const co = createChangeOrderRecord({ live: next, baseline: snap });
    expect(co.number).toBe(1);
    expect(co.label).toMatch(/^CO-/);
    expect(co.lineDeltas.length).toBeGreaterThan(0);
  });

  it('uses assembly R-values and stud spacing', () => {
    const exterior: Wall[] = [
      { id: 'a', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.18, height: 2.7, assembly: 'exterior' },
    ];
    const interior: Wall[] = [
      { id: 'b', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.12, height: 2.7, assembly: 'interior' },
    ];
    const ext = computeConstructionTakeoff({ walls: exterior, openings: [], furniture: [], includeEnvelope: false });
    const int = computeConstructionTakeoff({ walls: interior, openings: [], furniture: [], includeEnvelope: false });
    expect(ext.avgInsulationR).toBeGreaterThan(15);
    expect(int.insulationAreaM2).toBe(0);
    expect(ext.studCount).toBeGreaterThan(int.studCount);
  });
});
