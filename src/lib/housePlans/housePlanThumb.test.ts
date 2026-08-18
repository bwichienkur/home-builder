import { describe, expect, it } from 'vitest';
import { sampleHousePlans } from './samplePlans';
import { olsenHousePlans } from './olsenPlans';
import { housePlanThumbLayout } from './housePlanThumb';

describe('house plan thumb', () => {
  it('draws a viewBox that covers every room on the first story', () => {
    const plan = sampleHousePlans[0]!;
    const layout = housePlanThumbLayout(plan);
    expect(layout.rooms.length).toBe(plan.floors[0]!.rooms.length);
    expect(layout.width).toBeGreaterThan(20);
    expect(layout.height).toBeGreaterThan(20);
    expect(layout.rooms.every((r) => r.d.startsWith('M'))).toBe(true);
  });

  it('draws polygon rooms on Olsen flyer plans', () => {
    const sandbridge = olsenHousePlans.find((p) => p.id === 'sandbridge')!;
    const layout = housePlanThumbLayout(sandbridge);
    expect(layout.rooms.length).toBe(sandbridge.floors[0]!.rooms.length);
    expect(layout.rooms.every((r) => r.d.startsWith('M'))).toBe(true);
  });
});
