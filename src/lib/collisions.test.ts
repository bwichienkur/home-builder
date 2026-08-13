import { describe, expect, it } from 'vitest';
import { findCollisions } from './collisions';

describe('collisions', () => {
  it('detects overlapping floor items', () => {
    const pairs = findCollisions([
      { id: 'a', x: 0, y: 0, z: 0, width: 1, depth: 1, height: 1 },
      { id: 'b', x: 0.2, y: 0, z: 0.2, width: 1, depth: 1, height: 1 },
    ]);
    expect(pairs).toEqual([['a', 'b']]);
  });

  it('ignores items separated vertically', () => {
    const pairs = findCollisions([
      { id: 'a', x: 0, y: 0, z: 0, width: 1, depth: 1, height: 0.4 },
      { id: 'b', x: 0, y: 1.5, z: 0, width: 1, depth: 1, height: 0.4 },
    ]);
    expect(pairs).toEqual([]);
  });
});
