import { describe, expect, it } from 'vitest';
import { buildScheduleOfValues, csiDivisionLabel, scheduleOfValuesCsv } from './bidPackage';
import { buildEstimateSnapshot } from './estimateSnapshot';
import { computeConstructionTakeoff } from './constructionTakeoff';
import { DEFAULT_TRADE_RATES } from '../store/tradeRatesStore';
import type { Wall } from '../types';

const box: Wall[] = [
  { id: 'a', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, thickness: 0.18, height: 2.7, assembly: 'exterior' },
  { id: 'b', start: { x: 800, y: 0 }, end: { x: 800, y: 600 }, thickness: 0.18, height: 2.7, assembly: 'exterior' },
  { id: 'c', start: { x: 800, y: 600 }, end: { x: 0, y: 600 }, thickness: 0.18, height: 2.7, assembly: 'exterior' },
  { id: 'd', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 0.18, height: 2.7, assembly: 'exterior' },
];

describe('bidPackage', () => {
  it('labels CSI divisions and builds SOV + commercial totals', () => {
    expect(csiDivisionLabel('26 05 00')).toContain('Electrical');
    const takeoff = computeConstructionTakeoff({
      walls: box,
      openings: [],
      furniture: [],
      planRooms: [
        {
          id: 'r1',
          name: 'Kitchen',
          roomType: 'Kitchen',
          points: [
            { x: 0, y: 0 },
            { x: 800, y: 0 },
            { x: 800, y: 600 },
            { x: 0, y: 600 },
          ],
        },
      ],
    });
    expect(takeoff.electricalOutletCount).toBeGreaterThan(0);
    expect(takeoff.plumbingFixtureCount).toBeGreaterThan(0);
    expect(takeoff.excavationCy).toBeGreaterThan(0);

    const snap = buildEstimateSnapshot({ takeoff, rates: DEFAULT_TRADE_RATES });
    expect(snap.totals.contingency).toBeGreaterThan(0);
    expect(snap.totals.escalation).toBeGreaterThan(0);
    expect(snap.totals.bond).toBeGreaterThan(0);
    expect(snap.totals.grandTotal).toBeGreaterThan(snap.totals.subtotal);
    expect(snap.lines.some((l) => l.csi?.startsWith('26'))).toBe(true);
    expect(snap.lines.some((l) => l.csi?.startsWith('22'))).toBe(true);

    const sov = buildScheduleOfValues(snap.lines);
    expect(sov.length).toBeGreaterThan(2);
    const csv = scheduleOfValuesCsv(snap, { projectName: 'Demo', jurisdiction: 'VA Beach, VA' });
    expect(csv).toContain('Grand total');
    expect(csv).toContain('Contingency');
  });

  it('applies vendor quotes to estimate lines', () => {
    const takeoff = computeConstructionTakeoff({ walls: box, openings: [], furniture: [] });
    const snap = buildEstimateSnapshot({
      takeoff,
      rates: DEFAULT_TRADE_RATES,
      quotes: [
        {
          id: 'q1',
          vendor: 'Acme Roofing',
          label: 'Roof package',
          amount: 12000,
          lineKey: 'roof',
          quoteDate: '2026-08-01',
        },
      ],
    });
    const roof = snap.lines.find((l) => l.key === 'roof');
    expect(roof?.material).toBe(12000);
    expect(roof?.quoteId).toBe('q1');
  });
});
