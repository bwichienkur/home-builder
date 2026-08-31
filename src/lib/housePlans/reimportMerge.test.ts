import { describe, expect, it } from 'vitest';
import {
  asPlanDocument,
  mergeRoomConfigurations,
  roomConfigurationsFromLabels,
  assignStableRoomIds,
} from './planDocument';
import type { PlanRoomRect } from './buildPlan';

describe('re-import finish merge (QA automation)', () => {
  it('restores finishes onto re-imported rooms with stable ids', () => {
    const base: PlanRoomRect[] = [
      { id: 'old-kitchen', name: 'KITCHEN', roomType: 'Kitchen', x: 10, y: 10, w: 12, h: 14 },
      { id: 'old-great', name: 'GREAT ROOM', roomType: 'Living room', x: 22, y: 10, w: 18, h: 20 },
    ];
    const prev = assignStableRoomIds(base);
    const configs = roomConfigurationsFromLabels([
      { id: prev[0]!.id, floorCatalogId: 'tile-oak', floorColor: '#c4a574', wallCatalogId: 'paint-white' },
      { id: prev[1]!.id, ceilingCatalogId: 'ceil-smooth', ceilingColor: '#f5f5f5' },
    ]);
    // Simulate re-import with new temporary ids before stamping.
    const nextRaw: PlanRoomRect[] = [
      { id: 'tmp-1', name: 'KITCHEN', roomType: 'Kitchen', x: 10.2, y: 10.1, w: 12, h: 14 },
      { id: 'tmp-2', name: 'GREAT ROOM', roomType: 'Living room', x: 22.1, y: 9.9, w: 18, h: 20 },
    ];
    const next = assignStableRoomIds(nextRaw);
    const merged = mergeRoomConfigurations(prev, next, configs);
    expect(merged.length).toBe(2);
    const kitchen = merged.find((c) => c.floorCatalogId === 'tile-oak');
    const great = merged.find((c) => c.ceilingCatalogId === 'ceil-smooth');
    expect(kitchen?.wallCatalogId).toBe('paint-white');
    expect(great?.ceilingColor).toBe('#f5f5f5');
    expect(kitchen?.roomId).toBe(next[0]!.id);
  });

  it('stamps engine meta on plan documents', () => {
    const doc = asPlanDocument(
      {
        id: 'p',
        name: 'P',
        stories: 1,
        beds: 1,
        baths: 1,
        livingSqFt: 100,
        sourceUrl: 'x.dxf',
        note: 't',
        floors: [{ id: 'f', name: '1', rooms: [] }],
      },
      { sourceFile: 'MODEL.dxf' },
    );
    expect(doc.meta?.engineVersion).toBe(1);
    expect(doc.meta?.sourceFile).toBe('MODEL.dxf');
  });
});
