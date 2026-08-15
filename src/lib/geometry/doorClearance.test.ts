import { describe, expect, it } from 'vitest';
import {
  doorSwingZones,
  furnitureHitsDoorSwing,
  wallNetAreaM2,
  wallsNetAreaM2,
} from './doorClearance';
import type { Opening, Wall } from '../../types';
import { WORLD_ORIGIN } from './placement';
import { PIXELS_PER_METER } from './snapping';

const wall: Wall = {
  id: 'w1',
  start: { x: WORLD_ORIGIN.x, y: WORLD_ORIGIN.y },
  end: { x: WORLD_ORIGIN.x + 4 * PIXELS_PER_METER, y: WORLD_ORIGIN.y },
  thickness: 0.15,
  height: 2.7,
};

const door: Opening = {
  id: 'd1',
  wallId: 'w1',
  type: 'door',
  offset: 0.5,
  width: 0.9,
  height: 2.1,
  sill: 0,
  swing: 'left',
  face: 'in',
  shape: 'rect',
};

describe('doorClearance', () => {
  it('builds a swing zone for hinged doors', () => {
    const zones = doorSwingZones([door], [wall]);
    expect(zones).toHaveLength(1);
    expect(zones[0]!.maxX - zones[0]!.minX).toBeGreaterThan(0.5);
    expect(zones[0]!.maxZ - zones[0]!.minZ).toBeGreaterThan(0.5);
  });

  it('flips swing zone when face is out', () => {
    const inward = doorSwingZones([door], [wall])[0]!;
    const outward = doorSwingZones([{ ...door, face: 'out' }], [wall])[0]!;
    expect(inward.minZ).not.toBe(outward.minZ);
  });

  it('blocks furniture that overlaps the swing footprint', () => {
    const zones = doorSwingZones([door], [wall]);
    const zone = zones[0]!;
    const hit = furnitureHitsDoorSwing(
      {
        x: (zone.minX + zone.maxX) / 2,
        z: (zone.minZ + zone.maxZ) / 2,
        width: 0.5,
        depth: 0.5,
        rotation: 0,
      },
      zones,
    );
    const clear = furnitureHitsDoorSwing(
      { x: zone.maxX + 2, z: zone.maxZ + 2, width: 0.5, depth: 0.5, rotation: 0 },
      zones,
    );
    expect(hit).toBe(true);
    expect(clear).toBe(false);
  });

  it('subtracts openings from wall area for BOM', () => {
    const gross = wallNetAreaM2(wall, []);
    const net = wallNetAreaM2(wall, [door]);
    expect(gross).toBeCloseTo(4 * 2.7, 5);
    expect(net).toBeCloseTo(gross - 0.9 * 2.1, 5);
    expect(wallsNetAreaM2([wall], [door])).toBeCloseTo(net, 5);
  });
});
