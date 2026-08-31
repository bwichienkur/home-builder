import { describe, expect, it } from 'vitest';
import { stillwater183Plan } from './stillwater183Plan';
import {
  asPlanDocument,
  assignStableRoomIds,
  buildFromPlanDocument,
  mergeRoomConfigurations,
  planDocumentFloors,
  planDocumentRooms,
  roomCentroidFt,
  roomConfigurationsFromLabels,
  stableRoomId,
} from './planDocument';

describe('planDocument v1', () => {
  it('aliases HousePlan as NormalizedPlanDocument with meta', () => {
    const doc = asPlanDocument(stillwater183Plan, { sourceFile: 'MODEL.dwg' });
    expect(doc.id).toBe('stillwater-183');
    expect(doc.meta?.engineVersion).toBe(1);
    expect(doc.meta?.sourceFile).toBe('MODEL.dwg');
    expect(planDocumentFloors(doc).length).toBeGreaterThan(0);
    expect(planDocumentRooms(doc).length).toBeGreaterThan(0);
  });

  it('assigns stable room ids from name + centroid', () => {
    const rooms = assignStableRoomIds(stillwater183Plan.floors[0]!.rooms);
    expect(rooms.every((r) => r.id.length > 3)).toBe(true);
    const ids = new Set(rooms.map((r) => r.id));
    expect(ids.size).toBe(rooms.length);
    const c = roomCentroidFt(rooms[0]!);
    expect(stableRoomId(rooms[0]!.name, c.x, c.y)).toMatch(/^[a-z0-9-]+-\d+-\d+/);
  });

  it('merges room configurations across re-import by name+centroid', () => {
    const prev = assignStableRoomIds(stillwater183Plan.floors[0]!.rooms.slice(0, 3));
    const next = assignStableRoomIds(stillwater183Plan.floors[0]!.rooms.slice(0, 3));
    const configs = [{ roomId: prev[0]!.id, floorColor: '#abc123', floorCatalogId: 'tile-1' }];
    const merged = mergeRoomConfigurations(prev, next, configs);
    expect(merged.length).toBe(1);
    expect(merged[0]!.floorColor).toBe('#abc123');
    expect(merged[0]!.roomId).toBe(next[0]!.id);
  });

  it('snapshots finish configs from plan labels', () => {
    const configs = roomConfigurationsFromLabels([
      { id: 'a', floorColor: '#fff', floorCatalogId: 'f1' },
      { id: 'b', wallCatalogId: 'w1', ceilingColor: '#eee' },
      { id: 'c' },
    ]);
    expect(configs).toHaveLength(2);
    expect(configs[0]!.floorCatalogId).toBe('f1');
    expect(configs[1]!.wallCatalogId).toBe('w1');
  });

  it('builds a house scene from the plan document', () => {
    const doc = asPlanDocument(stillwater183Plan);
    const built = buildFromPlanDocument(doc);
    expect(built.floors.length).toBeGreaterThan(0);
    expect(built.floors[0]!.scene.walls.length).toBeGreaterThan(0);
  });
});
