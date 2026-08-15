import { describe, expect, it } from 'vitest';
import { findCollisions } from './collisions';

describe('collisions', () => {
  it('detects overlapping floor items', () => {
    const pairs = findCollisions([
      { id: 'a', x: 0, y: 0, z: 0, width: 1, depth: 1, height: 1, rotation: 0 },
      { id: 'b', x: 0.2, y: 0, z: 0.2, width: 1, depth: 1, height: 1, rotation: 0 },
    ]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('ignores items separated vertically', () => {
    const pairs = findCollisions([
      { id: 'a', x: 0, y: 0, z: 0, width: 1, depth: 1, height: 0.4, rotation: 0 },
      { id: 'b', x: 0, y: 1.5, z: 0, width: 1, depth: 1, height: 0.4, rotation: 0 },
    ]);
    expect(pairs).toEqual([]);
  });

  it('ignores perimeter trim vs furniture', () => {
    const pairs = findCollisions([
      { id: 'a', x: 0, y: 0, z: 0, width: 1, depth: 1, height: 1, rotation: 0 },
      {
        id: 't',
        x: 0,
        y: 0,
        z: 0,
        width: 2,
        depth: 0.05,
        height: 0.09,
        rotation: 0,
        placementKind: 'perimeter-trim',
      },
    ]);
    expect(pairs).toEqual([]);
  });
});
