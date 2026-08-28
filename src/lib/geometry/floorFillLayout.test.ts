import { describe, expect, it } from 'vitest';
import { residentialFlooring } from '../../components/catalog/residentialFlooring';
import {
  clipCellToRoom,
  floorPieceSpec,
  layoutFloorPieces,
  pieceWorldAabb,
  pointInFloorHole,
  pointInWorldPoly,
  polyBounds,
} from './floorFillLayout';

const rect = [
  { x: 0, z: 0 },
  { x: 3, z: 0 },
  { x: 3, z: 2 },
  { x: 0, z: 2 },
];

function aabbInsidePoly(
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  poly: { x: number; z: number }[],
  slop = 1e-3,
) {
  const b = polyBounds(poly);
  return (
    box.minX >= b.minX - slop &&
    box.maxX <= b.maxX + slop &&
    box.minZ >= b.minZ - slop &&
    box.maxZ <= b.maxZ + slop
  );
}

function interiorCovered(
  poly: { x: number; z: number }[],
  poses: ReturnType<typeof layoutFloorPieces>,
  spec: ReturnType<typeof floorPieceSpec>,
) {
  const b = polyBounds(poly);
  const grout = spec.grout + 0.01;
  for (let x = b.minX + 0.04; x < b.maxX - 0.04; x += 0.18) {
    for (let z = b.minZ + 0.04; z < b.maxZ - 0.04; z += 0.18) {
      if (!pointInWorldPoly(x, z, poly)) continue;
      const hit = poses.some((p) => {
        const box = pieceWorldAabb(p, spec);
        return x >= box.minX - grout && x <= box.maxX + grout && z >= box.minZ - grout && z <= box.maxZ + grout;
      });
      if (!hit) return false;
    }
  }
  return true;
}

describe('floor fill layout', () => {
  it('treats oak hardwood as staggered 3D planks', () => {
    const oak = residentialFlooring.find((i) => i.id === 'floor-oak-hardwood')!;
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

  it('clips walnut planks to the room — no overflow, no interior gaps', () => {
    const walnut = residentialFlooring.find((i) => i.id === 'floor-walnut-hardwood')!;
    const spec = floorPieceSpec(walnut);
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(poses.length).toBeGreaterThan(8);
    expect(poses.every((p) => aabbInsidePoly(pieceWorldAabb(p, spec), rect))).toBe(true);
    expect(poses.some((p) => p.sx < 0.99 || p.sz < 0.99)).toBe(true);
    expect(interiorCovered(rect, poses, spec)).toBe(true);
  });

  it('clips a board that straddles the wall to the interior AABB', () => {
    const cell = { minX: -0.2, maxX: 0.4, minZ: -0.1, maxZ: 0.5 };
    const clipped = clipCellToRoom(cell, rect);
    expect(clipped).toEqual({ minX: 0, maxX: 0.4, minZ: 0, maxZ: 0.5 });
  });

  it('lays subway as running-bond 3×6 tiles', () => {
    const subway = residentialFlooring.find((i) => i.id === 'floor-subway-tile')!;
    const spec = floorPieceSpec(subway);
    expect(spec.kind).toBe('running-bond');
    expect(spec.width).toBeCloseTo(0.076);
    expect(spec.length).toBeCloseTo(0.152);
  });

  it('staggers rectangular planks along the long edge, not the short', () => {
    const oak = residentialFlooring.find((i) => i.id === 'floor-oak-hardwood')!;
    const spec = floorPieceSpec(oak);
    const poses = layoutFloorPieces({ polygon: rect, spec });
    const full = poses.filter((p) => p.sx > 0.92 && p.sz > 0.92);
    expect(full.some((p) => Math.abs(p.yaw) > 0.1)).toBe(true);
    const rowKey = (p: (typeof poses)[number]) => p.z.toFixed(2);
    const rows = [...new Set(full.map(rowKey))];
    expect(rows.length).toBeGreaterThan(1);
    const xsFor = (key: string) =>
      full
        .filter((p) => rowKey(p) === key)
        .map((p) => p.x)
        .sort((a, b) => a - b);
    const a = xsFor(rows[0]!);
    const b = xsFor(rows[1]!);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    const pitch = spec.length + spec.grout;
    const phase = (x: number) => ((x % pitch) + pitch) % pitch;
    const delta = Math.min(
      Math.abs(phase(a[0]!) - phase(b[0]!)),
      pitch - Math.abs(phase(a[0]!) - phase(b[0]!)),
    );
    expect(delta).toBeGreaterThan(spec.length * 0.35);
    expect(delta).toBeLessThan(spec.length * 0.65);
  });

  it('treats 12×24 porcelain as staggered rectangles', () => {
    const plank = residentialFlooring.find((i) => i.id === 'floor-tile-porcelain-gray')!;
    const spec = floorPieceSpec(plank);
    expect(spec.kind).toBe('running-bond');
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(poses.length).toBeGreaterThan(8);
    expect(interiorCovered(rect, poses, spec)).toBe(true);
  });

  it('treats ceramic as a grouted grid of tiles', () => {
    const tile = residentialFlooring.find((i) => i.id === 'floor-tile-ceramic-white')!;
    const spec = floorPieceSpec(tile);
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(spec.grout).toBeGreaterThan(0.002);
    expect(poses.length).toBeGreaterThan(20);
    expect(poses.every((p) => aabbInsidePoly(pieceWorldAabb(p, spec), rect))).toBe(true);
    expect(interiorCovered(rect, poses, spec)).toBe(true);
  });

  it('packs hex mosaic as hex pieces inside the room', () => {
    const hex = residentialFlooring.find((i) => i.id === 'floor-tile-hex-stone')!;
    const spec = floorPieceSpec(hex);
    expect(spec.kind).toBe('hex');
    const poses = layoutFloorPieces({ polygon: rect, spec });
    expect(poses.length).toBeGreaterThan(10);
    expect(poses.every((p) => aabbInsidePoly(pieceWorldAabb(p, spec), rect, 0.02))).toBe(true);
  });

  it('keeps carpet and concrete as a single slab', () => {
    const carpet = residentialFlooring.find((i) => i.id === 'floor-carpet-beige')!;
    const concrete = residentialFlooring.find((i) => i.id === 'floor-concrete-polished')!;
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
    expect(poses.every((p) => aabbInsidePoly(pieceWorldAabb(p, spec), rect))).toBe(true);
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
