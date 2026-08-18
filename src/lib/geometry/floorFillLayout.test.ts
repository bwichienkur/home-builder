import { describe, expect, it } from 'vitest';
import { catalog } from '../../components/catalog/catalogData';
import {
  floorPieceSpec,
  layoutFloorPieces,
  pointInFloorHole,
  pointInWorldPoly,
} from './floorFillLayout';

const rect = [
  { x: 0, z: 0 },
  { x: 3, z: 0 },
  { x: 3, z: 2 },
  { x: 0, z: 2 },
];

describe('floor fill layout', () => {
  it('treats oak hardwood as staggered 3D planks', () => {
    const oak = catalog.find((i) => i.id === 'floor-oak-hardwood')!;
    const spec = floorPieceSpec(oak);
    expect(spec.kind).toBe('running-bond');
    expect(spec.width).toBeCloseTo(0.127);
    expect(spec.length).toBeCloseTo(1.219);
    expect(spec.thickness).toBeCloseTo(0.019);
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(poses.length).toBeGreaterThan(8);
    expect(poses.every((p) => pointInWorldPoly(p.x, p.z, rect))).toBe(true);
    const rows = new Set(poses.map((p) => p.z.toFixed(3)));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('lays subway as running-bond 3×6 tiles', () => {
    const subway = catalog.find((i) => i.id === 'floor-subway-tile')!;
    const spec = floorPieceSpec(subway);
    expect(spec.kind).toBe('running-bond');
    expect(spec.width).toBeCloseTo(0.076);
    expect(spec.length).toBeCloseTo(0.152);
  });

  it('treats ceramic as a grouted grid of tiles', () => {
    const tile = catalog.find((i) => i.id === 'floor-tile-ceramic-white')!;
    const spec = floorPieceSpec(tile);
    expect(spec.kind).toBe('grid');
    expect(spec.grout).toBeGreaterThan(0.002);
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(poses.length).toBeGreaterThan(20);
  });

  it('packs hex mosaic as hex pieces', () => {
    const hex = catalog.find((i) => i.id === 'floor-tile-hex-stone')!;
    expect(floorPieceSpec(hex).kind).toBe('hex');
    const poses = layoutFloorPieces({ polygon: rect, spec: floorPieceSpec(hex) });
    expect(poses.length).toBeGreaterThan(10);
    expect(poses[0]!.yaw).toBeCloseTo(Math.PI / 6);
  });

  it('keeps carpet and concrete as a single slab', () => {
    const carpet = catalog.find((i) => i.id === 'floor-carpet-beige')!;
    const concrete = catalog.find((i) => i.id === 'floor-concrete-polished')!;
    expect(floorPieceSpec(carpet).kind).toBe('slab');
    expect(floorPieceSpec(concrete).kind).toBe('slab');
    expect(layoutFloorPieces({ polygon: rect, spec: floorPieceSpec(carpet) })).toEqual([]);
  });

  it('skips stair cutouts', () => {
    const spec = floorPieceSpec({ dims: [0.3, 0.01, 0.3], subcategory: 'Tile', name: 'Tile' });
    const hole = { x: 1.5, z: 1, width: 1.2, depth: 1.2, rotation: 0 };
    const poses = layoutFloorPieces({ polygon: rect, spec, holes: [hole] });
    expect(poses.some((p) => pointInFloorHole(p.x, p.z, hole))).toBe(false);
    expect(poses.length).toBeGreaterThan(5);
  });

  it('caps huge rooms so instance count stays bounded', () => {
    const big = [
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      { x: 40, z: 30 },
      { x: 0, z: 30 },
    ];
    const spec = floorPieceSpec({ dims: [0.076, 0.01, 0.152], name: 'Subway Ceramic Floor Tile', subcategory: 'Tile' });
    const poses = layoutFloorPieces({ polygon: big, spec, maxCount: 800 });
    expect(poses.length).toBeGreaterThan(20);
    expect(poses.length).toBeLessThanOrEqual(800);
  });
});
